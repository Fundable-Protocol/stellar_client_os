# Campaign diversity: tree species diversity scoring

The `campaign-diversity` contract turns tree planting data into a single
comparable number: a **diversity score** in basis points (`0 .. 10000`), where
`10000` is the best possible planting. It exists so that a campaign's
environmental value — and its potential for carbon credits — is a function of
what was actually planted, rather than of how many trees were reported.

## Why not just count the species

A raw species count is trivially gameable and ecologically wrong. Ten thousand
trees of a single species is a monoculture: it fixes carbon, but it is not a
restoration and it should not be scored like one. The contract therefore scores
two properties of a planting and multiplies them together.

| Factor | Definition | Rewards |
| --- | --- | --- |
| **Species coverage** | Linear ramp in the number of distinct verified species, saturating at 12 | More species |
| **Species evenness** | Simpson's diversity index, normalised against its own maximum | Species planted in similar proportion, not one dominant monoculture |

## The formula

With `S` distinct verified species carrying counts `n_i` and `N = sum(n_i)`
verified trees:

```
coverage = min(S, 12) * 10000 / 12

A        = sum(n_i * (n_i - 1))        # ordered same-species tree pairs
T        = N * (N - 1)                 # all ordered tree pairs
D        = A / T                       # Simpson index: P(two trees share a species)
evenness = (1 - D) / (1 - 1/S)         # normalised evenness, capped at 10000
         = S * (T - A) / (T * (S - 1))

diversity_score = coverage * evenness / 10000
```

Both factors are computed with **integer arithmetic only**, so the result is
deterministic, cheap, and reproducible off-chain. `apps/web/src/services/campaign-diversity.service.ts`
mirrors the formula exactly for optimistic UI and for third parties that want to
re-derive and check a published score.

### Worked examples

| Planting | Coverage | Evenness | Score |
| --- | --- | --- | --- |
| 10,000 oak, one species | 833 | 0 | **0** |
| 50 oak + 50 pine | 1,666 | 10,000 | **1,666** |
| 300 oak + 100 pine | 1,666 | 7,518 | **1,252** |
| 12 species, 100 trees each | 10,000 | 10,000 | **10,000** |
| 20 species, 100 trees each | 10,000 | 10,000 | **10,000** |
| 12 species, 110 of 121 trees oak | 10,000 | 1,900 | **1,900** |

Note the last two rows: coverage saturates at 12 species, so a 20-species
planting scores the same as a 12-species one. That is deliberate — past a dozen
native species, extra species stop changing the ecological value of a site, and
rewarding raw counts would reward padding.

## Only verified plantings count

A planting batch is recorded as `Pending` and does not affect the score until
`verify_planting` moves it to `Verified`. A campaign cannot raise its score by
reporting trees that no one has checked, which is what makes the published score
worth something to an off-chain carbon registry.

Verified data is **immutable**: `reject_planting` only voids `Pending` batches.
Once a verifier has attested to a batch, the only way to unwind it is at the
campaign level, via the campaign funding contract's `mark_trees_died`, which
moves the whole campaign to `VerificationFailed`. A score that could be
retroactively rewritten would not be worth publishing.

## Tiers

`diversity_score` maps onto an environmental-value band so that front-ends and
carbon tooling get a stable label without re-deriving the thresholds:

| Tier | Score |
| --- | --- |
| `Low` | `< 2500` |
| `Medium` | `2500 .. 7499` |
| `High` | `>= 7500` |

## Carbon-credit screening

`is_carbon_credit_eligible(campaign_id)` returns `true` when the campaign has at
least **1,000 verified trees** and a score of at least **5,000**. This is a
screening signal, deliberately not an issuance decision: it says nothing about
location, survival rates, permanence or additionality, all of which a registry
must assess separately. Volume alone never qualifies a planting — a
500,000-tree monoculture is not eligible.

## Roles

| Role | Powers |
| --- | --- |
| `admin` | Rotate the registrar and admin, reject pending batches as fraudulent |
| `registrar` | Register campaigns, record plantings, verify plantings, seal campaigns |

In production the `registrar` is the **campaign funding contract**, so planting
data is written from inside the campaign escrow flow — the same transaction path
that already records and verifies tree plantings there — rather than by an
arbitrary third party. Verification is therefore gated twice: once by the
campaign contract's own admin check, and once by the registrar signature here.

A campaign cannot be registered twice: `register_campaign` returns `false` for
an existing campaign instead of failing, so a retried integration transaction
cannot brick a campaign.

## Species identity

Species are keyed by `SHA-256(lower_case(species_name))`, a 32-byte code, so
`Oak`, `oak` and `OAK` all resolve to one species and cannot be used to claim
coverage twice. Names are limited to 64 bytes and stored once per species.
`get_species_code` exposes the same derivation so off-chain callers can compute
the code without re-implementing the canonicalisation rules.

## Bounded cost

Recomputing a score walks the campaign's species index rather than scanning
storage, and that index is capped:

| Constant | Value | Purpose |
| --- | --- | --- |
| `MAX_DIVERSITY_SPECIES` | 12 | Coverage ramp saturates here |
| `MAX_SPECIES_PER_CAMPAIGN` | 64 | Bounds a rescore to 64 storage reads |
| `MAX_TREES_PER_CAMPAIGN` | 1,000,000,000 | Bounds the largest integer in the formula |
| `MAX_SPECIES_NAME_LEN` | 64 bytes | Bounds the stored species name |

A 64-species campaign already scores full marks, so the cap costs nothing in
practice.

## Interface

### Lifecycle

| Function | Purpose |
| --- | --- |
| `initialize(admin, registrar)` | One-shot setup |
| `register_campaign(campaign_id) -> bool` | Add a campaign; idempotent |
| `seal_campaign(campaign_id)` | Close a campaign to further plantings |

### Plantings

| Function | Purpose |
| --- | --- |
| `record_planting(campaign_id, species_name, tree_count, reporter) -> u32` | Submit a `Pending` batch |
| `verify_planting(campaign_id, planting_id) -> u32` | Accept a batch; returns the new score |
| `reject_planting(campaign_id, planting_id) -> u32` | Void a `Pending` batch; idempotent |

### Queries

| Function | Returns |
| --- | --- |
| `get_campaign(campaign_id)` | Full aggregate record |
| `get_planting(campaign_id, planting_id)` | One planting batch |
| `get_species(campaign_id, species_code)` | One species aggregate |
| `list_species(campaign_id)` | Every species, in first-planted order |
| `get_species_code(species_name)` | Derive the on-chain species code |
| `get_diversity_score(campaign_id)` | Score in basis points |
| `get_tier(campaign_id)` | `Low` / `Medium` / `High` |
| `get_species_count(campaign_id)` | Distinct verified species |
| `get_verified_tree_count(campaign_id)` | Verified trees |
| `get_planting_count(campaign_id)` | Batches recorded |
| `is_carbon_credit_eligible(campaign_id)` | Screening flag |
| `get_campaign_count()` | Campaigns in the registry |
| `get_admin()` / `get_registrar()` | Role addresses |

### Admin

| Function | Purpose |
| --- | --- |
| `set_admin(new_admin)` | Rotate the admin |
| `set_registrar(new_registrar)` | Rotate the registrar, e.g. after a contract upgrade |

## Events

`CampaignRegistered`, `PlantingRecorded`, `PlantingVerified`, `PlantingRejected`,
`DiversityScoreUpdated`, `CampaignSealed`, `RegistrarUpdated`, `AdminUpdated`.
Each carries `campaign_id` as an indexed topic so indexers can subscribe to a
single campaign.

`DiversityScoreUpdated` is emitted only when the score actually moves, and
carries both the previous and new value, so a consumer can maintain the score
from the event stream alone without reading storage.

## Integration

The campaign funding contract is the intended registrar. A minimal integration:

```rust
// 1. On campaign creation, from the funding contract:
diversity.register_campaign(&campaign_id);

// 2. When `record_tree_planting` succeeds, with the species as reported:
let planting_id = diversity.record_planting(
    &campaign_id, &species_name, &tree_count, &env.current_contract_address(),
);

// 3. When `verify_tree_planting` succeeds:
diversity.verify_planting(&campaign_id, &planting_id);

// 4. Read the score for the campaign page:
let score = diversity.get_diversity_score(&campaign_id);
```
