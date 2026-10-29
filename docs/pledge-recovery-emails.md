# Abandoned pledge recovery emails

Pledge recovery for reward-tier instalment checkout stores short-lived checkout
intents in Redis and sends one reminder after an hour. Set `REDIS_URL` for the
web application and `CRON_SECRET` for the scheduled dispatcher. `NEXT_PUBLIC_URL`
should be the public application origin so reminder and opt-out links point to
the deployed site.

Invoke `POST /api/cron/pledge-recovery` every five minutes with the header
`Authorization: Bearer <CRON_SECRET>`. The dispatcher sends only due reminders;
it skips completed checkouts and users who opted out. Each reminder contains a
single-use recovery capability link that restores the reward tier, email, and
instalment plan, and an opt-out link.
