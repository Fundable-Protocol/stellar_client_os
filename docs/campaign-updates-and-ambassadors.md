# Campaign updates & the ambassador program

Two creator-facing features:

1. **Campaign updates** — rich-text progress posts a creator publishes during
   and after a campaign, with a chronological feed on the campaign page and
   email/in-app notifications for the backers.
2. **Ambassador program** — recruit ambassadors by email, track the pledges
   they bring in, and assign their rewards automatically once they cross a
   tier threshold.

---

## 1. Campaign updates

### Data model

`apps/web/src/types/campaign-update.ts`

| Type | Purpose |
| --- | --- |
| `CampaignUpdatePost` | The post itself: title, Markdown body, image URLs, tags, visibility, status and the notification mode used when it goes live. |
| `CampaignUpdatePreference` | A backer's per-campaign preference: `instant`, `daily_digest`, `weekly_digest` or `off`, plus whether in-app notifications are on. |
| `InAppNotification` | A stored in-app notification (update, ambassador reward, ambassador invite). |
| `CampaignUpdateDispatchReport` | The result of a publish: how many backers were emailed, queued for a digest, or notified in-app. |

### Services

| File | Responsibility |
| --- | --- |
| `services/campaign-update.service.ts` | CRUD for posts. Chronological ordering by default (oldest → newest) so the feed reads as a running log. In-memory data source with a `setCampaignUpdateDataSource()` seam. |
| `services/campaign-update-notification.service.ts` | Backer preferences, the in-app notification store, the digest queue, and the email/digest rendering. |
| `services/campaign-update-publish.service.ts` | Ties the two together: publish → notify. Also resolves the recipient list from stored preferences plus an optional explicit backer list. |

### Markdown

The app has no Markdown dependency, so `lib/markdown.ts` implements a small,
safe renderer:

- Raw HTML in the source is escaped before parsing, so an author can never
  inject markup.
- Only a fixed set of tags is emitted (headings, paragraphs, lists,
  blockquotes, code, links, images, rules).
- Link and image targets are restricted to `http(s)`, `mailto:` and
  site-relative paths — `javascript:` and protocol-relative URLs are dropped.

The same renderer is used for the on-page feed and for the email bodies, so a
post looks identical in both.

### Image upload

`/api/presign-upload` gained a `campaign-update` purpose and a matching
`buildCampaignUpdateKey()` helper (`lib/s3/keys.ts`). The client asks for a
pre-signed PUT URL, uploads straight to S3, and stores the resulting public
URL on the post. The endpoint now also returns `publicUrl` so the client does
not have to build the CDN URL itself.

### API

| Method & path | Purpose |
| --- | --- |
| `GET /api/campaigns/:id/updates` | The feed. Published posts are public; drafts are creator-only; `backers_only` posts require a `viewerAddress`. `order=chronological` (default) or `reverse_chronological`. |
| `POST /api/campaigns/:id/updates` | Create a post. `status: "published"` publishes it and notifies the backers. |
| `GET/PATCH/DELETE /api/campaigns/:id/updates/:updateId` | Read, edit or remove a single post. |
| `POST /api/campaigns/:id/updates/:updateId/publish` | Publish a draft and fan out the notifications. |
| `GET/PUT /api/campaigns/:id/updates/preferences` | Read or store a backer's notification preference. |
| `GET/PATCH /api/campaigns/:id/updates/notifications` | The in-app notification centre of a recipient. |

### Authorization

`lib/campaign-authorization.ts` compares the caller address with the
campaign's recorded creator. Campaigns that are not present in the campaign
data source (demo data) cannot be verified, so the check is skipped and a
warning is logged; indexed campaigns are always enforced.

### UI

| Component | Where it renders |
| --- | --- |
| `CampaignUpdateFeed` | The campaign page — public feed + backer preference control. |
| `CampaignUpdateManager` | The creator dashboard — list, publish, edit, delete. |
| `CampaignUpdateEditor` | Markdown editor with a formatting toolbar, live preview and image upload. |
| `CampaignUpdatePreferenceControl` | Instant / daily digest / weekly digest / no email. |
| `MarkdownRenderer` | Renders the Markdown body of a post. |

Pages: `/campaigns/:id/updates` (creator dashboard). The campaign page gains
an **Updates** tab; the server-rendered campaign page renders the feed below
the campaign body.

---

## 2. Ambassador program

### Data model

`apps/web/src/types/ambassador.ts`

| Type | Purpose |
| --- | --- |
| `Ambassador` | A recruited ambassador: tier, status, referral code, pledged total and pledge count. |
| `AmbassadorInvite` | The email invitation: token, tier, expiry and status. |
| `AmbassadorPledge` | A pledge attributed to an ambassador. |
| `AmbassadorReward` | A perk/commission assigned when a tier threshold is crossed. |
| `AmbassadorPledgeSummary` | The per-ambassador dashboard row: tier, progress to the next tier, rewards. |

### Reward ladder

Defined in `services/campaign-ambassador.service.ts`.

| Tier | Threshold | Commission | Perks |
| --- | --- | --- | --- |
| `SEED` | 0 | — | Newsletter, thank-you listing |
| `SPROUT` | 100 | 10% | Early access, 10% referral tier |
| `BLOOM` | 500 | 15% | Name on the campaign page, 15% referral tier |
| `CANOPY` | 2000 | 20% | Featured spotlight, 20% referral tier |

The commission is paid on the slice of the pledged amount that falls inside
the tier's band (the amount between the previous threshold and this one), so
the tiers stack without paying the same pledge twice. The entry tier has no
threshold and never awards a reward — its perks are granted on join.

### Flow

1. **Recruit** — the creator invites an ambassador by email
   (`POST /api/campaigns/:id/ambassadors`). The API creates an invitation
   token, emails a unique link, and returns the link so it can also be shared
   manually.
2. **Accept** — the ambassador opens `/campaigns/invite/ambassador/:token`,
   confirms their details, and receives a unique referral code.
3. **Track** — pledges are recorded against the ambassador
   (`POST /api/campaigns/:id/ambassadors/:ambassadorId/pledges`). The running
   total and the pledge count are updated.
4. **Reward** — the thresholds are re-evaluated on every pledge. As soon as
   one is crossed, the matching reward is assigned and returned in the
   response. `POST /api/campaigns/:id/ambassador-rewards` re-runs the
   evaluation for the whole program.

### API

| Method & path | Purpose |
| --- | --- |
| `GET /api/campaigns/:id/ambassadors` | The program dashboard: totals, per-ambassador pledge tracking and pending invitations. |
| `POST /api/campaigns/:id/ambassadors` | Invite an ambassador by email. |
| `GET/PATCH/DELETE /api/campaigns/:id/ambassadors/:ambassadorId` | Read one ambassador, change its tier or status, or remove it. |
| `GET/POST /api/campaigns/:id/ambassadors/:ambassadorId/pledges` | List or record the pledges of an ambassador. |
| `GET/POST /api/campaigns/:id/ambassador-rewards` | List the assigned rewards, or re-run the assignment. |
| `GET/POST /api/ambassadors/invite/:token` | Read an invitation, or accept it. |

### UI

| Component | Purpose |
| --- | --- |
| `AmbassadorDashboard` | Program totals, reward ladder, pledge table, invitation list. |
| `AmbassadorPledgeTable` | Per-ambassador pledge tracking with progress towards the next tier. |
| `AmbassadorInviteModal` | The invite-by-email form. |
| `AmbassadorProgress` | The thin progress bar used by the table. |

Pages: `/campaigns/:id/ambassadors` (creator dashboard),
`/campaigns/invite/ambassador/:token` (accept an invitation). The campaign
page gains an **Ambassadors** tab.

---

## Persistence

`migrations/008_campaign_updates.sql` and
`migrations/009_campaign_ambassadors.sql` define the PostgreSQL schema for
both features (`campaign_updates`, `campaign_update_preferences`,
`in_app_notifications`, `campaign_update_digest_queue`, `ambassador_invites`,
`ambassadors`, `ambassador_pledges`, `ambassador_rewards`). They follow the
existing migration conventions: idempotent, `uuid` primary keys,
`numeric(78, 0)` for token amounts, `timestamptz` timestamps and
`CREATE INDEX IF NOT EXISTS` for the read paths.

The runtime services still use the in-memory data sources used by the rest of
the codebase; the `set*DataSource()` seams are where a durable backend plugs
in.

## Tests

```
src/lib/markdown.test.ts
src/services/campaign-update.service.test.ts
src/services/campaign-update-notification.service.test.ts
src/services/campaign-ambassador.service.test.ts
src/services/campaign-waitlist.service.test.ts
src/app/api/campaigns/[id]/updates/route.test.ts
src/app/api/campaigns/[id]/ambassadors/route.test.ts
```

## Notes on the existing codebase

The repository contained several files that were corrupted by a bad merge
(base64 blobs, duplicated blocks, spliced imports) and blocked the campaign
page from compiling. Those were repaired as part of this work because the
update feed and the ambassador dashboard live on the campaign page:

- `components/modules/campaign/sustainability/CampaignSustainabilityScore.tsx`
  restored from its base64 payload.
- `lib/co2-impact.ts` — duplicated declarations in `isRainySeason()` and
  `calculateCo2Offset()` removed; the seasonal multiplier now uses
  `getCampaignCreditMultiplierBps()` and keeps the deterministic baseline for
  callers without a planting date.
- `services/campaign-follow.service.ts` and `types/campaign-follow.ts` — two
  merged implementations (email-based and wallet-based) separated again.
- `app/api/campaigns/[id]/follow/route.ts` — two merged handlers merged into
  one that serves both email and wallet follows.
- `components/modules/impact/CampaignImpactCalculator.tsx` — a chart block
  spliced into the middle of another chart restored.
- `components/modules/campaigns/CampaignDetail.tsx` — an unclosed `<div>`,
  duplicate imports and mangled class names fixed.
- `components/modules/campaign/waitlist/` — the `CampaignWaitlist` and
  `CampaignWaitlistPanel` components were referenced but missing; they are
  implemented here on top of a new `campaign-waitlist` service and
  `/api/campaigns/:id/waitlist` route.
- `vitest.config.ts` — `@stellar/freighter-api` ships a UMD bundle whose
  named exports Node cannot detect, so the wallet kit could not be imported
  under Vitest. A shim in `src/test-utils/freighter-api.ts` re-exports them.
