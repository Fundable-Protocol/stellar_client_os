# Mobile offline mode

Issue: [Fundable-Protocol/stellar_client_os#893](https://github.com/Fundable-Protocol/stellar_client_os/issues/893)

Sponsors can browse campaigns and manage a wishlist without a connection; queued
wishlist changes are flushed when connectivity is restored.

## What lives here

All offline logic is **pure TypeScript** under `src/offline/`, so it runs and is
tested off-device. It never imports React Native, Expo or a native storage
module.

| Module            | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `storage.ts`      | `KeyValueStorage` contract, in-memory implementation, JSON helpers.   |
| `types.ts`        | `CampaignSummary` / `CampaignDetail` shapes cached locally.          |
| `campaignCache.ts`| Persisted campaign list/detail cache + read-through `CampaignRepository`. |
| `wishlist.ts`     | Offline-first wishlist (`add` / `remove` / `list`), persisted.        |
| `sync.ts`         | Durable wishlist sync queue, sync engine, connectivity monitor.      |
| `index.ts`        | `getOfflineServices()` composition + barrel exports.                 |

### Read-through cache

`CampaignRepository.loadList` / `loadDetail` are network-first: a successful
fetch refreshes the cache, and a failed fetch transparently falls back to the
last cached payload (`fromCache: true`). If nothing is cached the caller can
supply a `fallback` (e.g. `[]` for the browse list) or the original error is
re-thrown.

### Offline wishlist + sync

`WishlistSyncEngine.add/remove` mutate the local wishlist and enqueue an
operation durably. `WishlistSyncQueue` applies a deterministic merge — for each
campaign only the **latest** operation survives — so flushing can never emit
duplicates. `bindSyncOnReconnect` subscribes to a `ConnectivityMonitor` and
flushes the queue on an offline → online transition only; failed operations stay
queued for the next attempt.

## Wiring it into an app

### 1. Storage

No storage library existed in this package before this change, so the layer is
written against an injectable `KeyValueStorage` interface instead of hard-coding
a dependency. Register your backend once at startup:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureOfflineStorage } from "./src/offline";

configureOfflineStorage(AsyncStorage);
```

`KeyValueStorage` is a subset of the AsyncStorage API, so any compatible store
works. If nothing is configured the layer falls back to an in-process memory
store (session-scoped).

### 2. Connectivity

`createConnectivityMonitor(source)` wraps any `ConnectivitySource`. The
`CampaignDetailScreen` drives it from the existing WebSocket lifecycle
(`onopen` → online, `onclose`/`onerror` → offline). To use
`@react-native-community/netinfo` instead, pass a source that subscribes to
`NetInfo.addEventListener` and calls the listener with `state.isConnected`.

## Tests

```
pnpm --filter @fundable/mobile test        # vitest run
pnpm --filter @fundable/mobile typecheck   # tsc --noEmit
```

Coverage:

- `__tests__/campaignCache.test.ts` — cache write → offline read; empty-cache
  fallback and error re-throw; namespace isolation.
- `__tests__/wishlist.test.ts` — offline add/remove persistence across restarts;
  idempotency.
- `__tests__/sync.test.ts` — queue collapse; flush without duplicates; failed
  ops stay queued; flush happens only on reconnect.
- `__tests__/offlineFlow.test.ts` — end-to-end offline browse → wishlist edits →
  sync-on-reconnect; empty-cache offline path.

> Note: the pre-existing `src/screens/CampaignDetailScreen.tsx` imports
> `react-native` / `expo-notifications`, which are not part of this repo's
> dependency manifest. The mobile `typecheck`/`test` scripts therefore scope to
> the pure offline modules. Add the React Native toolchain (or a Jest preset) if
> you want component-level tests too.
