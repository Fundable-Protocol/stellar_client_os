---
"@fundable/web": patch
---

feat(frontend): campaign follow — get updates without sponsoring (v1) (#942)

Users can now follow a campaign to receive progress updates without sponsoring
it, building an audience for campaigns before launch:

- `Follow for Updates` button on the campaign detail page with per-channel
  notification preferences (in-app, email, webhook), delivery frequency
  (instant, daily/weekly digest), and selectable update types.
- Idempotent follows per wallet (re-follow updates preferences instead of
  duplicating), case-insensitive address matching, and a follower count
  surfaced on the campaign page.
- REST endpoints under `/api/campaigns/[id]/follow` (GET/POST/DELETE) backed by
  the in-memory `campaign-follow.service`, mirroring the existing community
  spaces pattern, with unit tests for the service and validation helpers.
