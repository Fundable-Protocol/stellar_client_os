---
"@fundable/web": patch
---

feat(notifications): backer digest email (daily / weekly)

Backers can opt into a daily or weekly digest email summarising updates across
all campaigns they have backed:

- Digest preference toggle (off / daily / weekly) on the new
  `/settings/notifications` page.
- Daily digests are sent at 8 AM in the backer's local time; weekly digests on
  Monday at 8 AM local time.
- `POST /api/notifications/backer-digest` sends due digests (call hourly) and is
  idempotent per delivery period; `GET/PUT /api/backers/digest-preferences`
  manages the preference.
