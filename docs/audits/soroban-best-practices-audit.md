# Soroban Best Practices Compliance Audit

Audit of all 8 contracts in `contracts/` against the [Stellar Soroban best-practices guidance](https://developers.stellar.org/docs/build/smart-contracts) and the community Soroban security checklist (storage/TTL management, authorization, arithmetic safety, error handling, and event emission). Scope: `campaign-funding`, `dispute-arbiter`, `distributor`, `donor-verification`, `nft-stream`, `payment-stream`, `planter`, `soulbound-badge`.

## Summary

| Contract | Errors as `Result` | Auth coverage | TTL extension | Events | Notes |
|---|---|---|---|---|---|
| `donor-verification` | Yes | Yes | Yes | Yes | Reference implementation - see below |
| `nft-stream` | Yes | Yes | missing | Yes (`#[contractevent]`) | Best structured of the rest; missing TTL |
| `payment-stream` | Yes | Yes | Yes | Yes | Compliant |
| `campaign-funding` | Mixed (`panic_with_error!`) | Yes | Yes | Yes | Acceptable pattern, but inconsistent with `Result`-based contracts |
| `soulbound-badge` | Mixed | Yes | Yes | none | |
| `dispute-arbiter` | Mixed (`panic!` + `Result`) | Yes | Partial | none | |
| `distributor` | raw `assert!`/`panic!` | Yes | none | none | |
| `planter` | N/A (no validation at all) | **none** | none | none | Critical gap |

## 1. Build-breaking: invalid workspace manifest (Critical)

`contracts/Cargo.toml` declares `soroban-sdk` twice under `[workspace.dependencies]`:

```toml
[workspace.dependencies]
soroban-sdk = "=27.0.6"
soroban-sdk = "=25.3.2"
```

This is not valid TOML - a duplicate key is a hard parse error, not a "last one wins" override. I confirmed this by parsing the file directly (Python's `tomllib`): it fails with `Cannot overwrite a value (at line 22)`. `cargo build`/`cargo test` at the workspace root will fail outright until one of these lines is removed. Every downstream crate declares `soroban-sdk.workspace = true`, so this blocks the whole workspace, not just one contract.

**Fix:** delete the `25.3.2` line and keep the pinned `27.0.6` (or vice versa, whichever the team intends as the SDK floor).

## 2. `donor-verification` is not a workspace member, and pins a stale SDK

The workspace `members` list is:
```
payment-stream, distributor, dispute-arbiter, nft-stream, campaign-funding, soulbound-badge, planter
```
`donor-verification` is absent, even though its directory, `Cargo.toml`, and `docs/contracts/donor-verification.md` all exist. Because it's excluded, it builds as a fully standalone crate with its own dependency set - and it pins `soroban-sdk = "21.0.0"`, three major SDK versions behind the rest of the repo (which targets 27.x/25.x). It also re-declares a full `[profile.release]` block locally rather than inheriting the workspace one.

**Best-practice deviation:** SDK versions should be unified via `workspace.dependencies` across all contracts in a repo; a contract silently excluded from CI/test coverage is a real risk, especially since this is otherwise the most carefully written contract in the repo (see §6).

## 3. `planter`: no authorization on state-mutating entry point (Critical)

```rust
pub fn set_planter_metrics(env: Env, wallet: Address, metrics: PlanterMetrics) {
    env.storage().persistent().set(&wallet, &metrics);
}
```
There is no `require_auth()` call anywhere in this contract. Any caller can overwrite any wallet's `PlanterMetrics` (including `current_bond_locked`) with arbitrary values. This violates the most basic Soroban authorization guidance - every state-changing function must authenticate the party it's acting on behalf of, typically via `.require_auth()` on the relevant `Address`. It also has no TTL extension, so the entry can be archived unexpectedly.

## 4. `distributor`: unchecked storage reads, no TTL, no events

- `fee_addr` is read with `.unwrap()` on an `Option` (`distribute` and `distribute_weighted`, lines ~76 and ~120). If the contract is used before `fee_addr` is set, this panics with an opaque WASM trap instead of a typed `Error`, and the transaction fee is still spent.
- No call to `extend_ttl` anywhere in the file - persistent stats entries (global/token/user stats, history) can expire from the ledger, silently resetting distribution history.
- Zero `events().publish` calls - no `distribute`/`distribute_weighted` events are emitted, so off-chain indexers have no way to track distributions.
- Validation uses bare `assert!(...)` (panics with a string) rather than the `#[contracterror]` + `Result<_, Error>` pattern used by `nft-stream`, `donor-verification`, and `payment-stream` elsewhere in the same repo - inconsistent error-handling convention across the workspace.

## 5. `dispute-arbiter`: inconsistent error handling, no events

`initialize` uses a bare `panic!("Contract already initialized")`, while every other entry point (`create_dispute`, `cast_vote`, `set_voting_period`, etc.) returns `Result<_, ArbiterError>`. Mixing the two means callers can't uniformly match on typed errors for this contract - `initialize` failures surface as an untyped trap. No `events().publish` calls exist at all, so dispute creation, votes, and resolutions are unobservable off-chain.

## 6. `nft-stream`: well structured, but missing TTL management

This is otherwise the cleanest contract outside `donor-verification`: consistent `Result<_, Error>` returns, no `.unwrap()` in any non-test path, and structured `#[contractevent]` types for every state change. The one gap: it never calls `.extend_ttl()` on `DataKey::Stream(..)` or `DataKey::StreamOwnershipRecord(..)` persistent entries. Streams are explicitly long-duration by design (`start_time`/`end_time` can span months), so an un-extended persistent entry risks archival before `claim()` is called, which would make the stream unreachable.

## 7. `donor-verification`: reference implementation

Worth calling out as the pattern the rest of the workspace should converge on: typed `#[contracterror]` enum, `Result` returns throughout, `require_auth()` on every mutating call, consistent `extend_ttl(threshold, extend_to)` after every write, and an `events().publish` on the one state-changing outcome that matters (`verified`). Its only issues are workspace-integration ones (§2), not code-quality ones.

## 8. Minor / lower-priority notes

- `campaign-funding` and `soulbound-badge` use `panic_with_error!` rather than returning `Result`, which is an accepted Soroban pattern (it does produce a typed error code) but is inconsistent with the `Result`-returning contracts in the same repo - worth standardizing on one convention repo-wide.
- `soulbound-badge` (lines 239, 343) indexes a `Vec` with `.get(i).unwrap()` inside a loop bounded by the same vector's length - safe in practice, but idiomatic Soroban code typically avoids `.unwrap()` entirely in contract logic (vs. test code) to keep panic surfaces auditable at a glance; consider `.get_unchecked(i)` with a documented invariant, or restructure with `.iter()`.
- No contract in the repo (including `donor-verification`) performs multiplication/division with `checked_mul`/`checked_div` where amounts are user-supplied (e.g. `nft-stream::calculate_vested`'s `total_amount * elapsed as i128`); values are `i128` so overflow requires enormous inputs, but it's worth an explicit `checked_mul` given these are financial calculations.

## Recommended fix order

1. Fix the workspace `Cargo.toml` duplicate key (unblocks CI entirely).
2. Add `require_auth()` to `planter::set_planter_metrics`.
3. Add `donor-verification` to workspace members and bump it to the shared SDK version.
4. Add `extend_ttl` calls to `nft-stream` and `distributor`.
5. Replace the `distributor` fee-address `.unwrap()` with a typed `Error::NotInitialized`-style return.
6. Standardize error handling (`Result<_, Error>` vs `panic_with_error!` vs bare `panic!`) across `distributor` and `dispute-arbiter`.
