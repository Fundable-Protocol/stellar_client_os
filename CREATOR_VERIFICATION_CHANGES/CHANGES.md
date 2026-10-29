# Creator identity verification — change summary

Base commit: d4d8c6a5 (https://github.com/Kappa16/stellar_client_os)

Contents of this folder:
- changed-files/ — every created and modified file, at its repo path
- creator-identity-verification.patch — full diff vs base; apply with: git apply creator-identity-verification.patch

The rest of this zip is the whole workspace (repo incl. .git; node_modules and .next excluded — run `pnpm install`).

## Created files (21)
- apps/web/src/app/api/admin/creator-verifications/route.ts
- apps/web/src/app/api/creators/[address]/verification/email/route.ts
- apps/web/src/app/api/creators/[address]/verification/government-id/route.ts
- apps/web/src/app/api/creators/[address]/verification/government-id/upload/route.ts
- apps/web/src/app/api/creators/[address]/verification/phone/route.ts
- apps/web/src/app/api/creators/[address]/verification/route.test.ts
- apps/web/src/app/api/creators/[address]/verification/route.ts
- apps/web/src/app/api/creators/[address]/verification/session/route.ts
- apps/web/src/app/creators/[address]/verification/page.tsx
- apps/web/src/components/creator/CreatorVerificationBadge.test.tsx
- apps/web/src/components/creator/CreatorVerificationBadge.tsx
- apps/web/src/components/creator/CreatorVerificationWizard.test.tsx
- apps/web/src/components/creator/CreatorVerificationWizard.tsx
- apps/web/src/lib/creator-verification-http.ts
- apps/web/src/lib/creator-verification.test.ts
- apps/web/src/lib/creator-verification.ts
- apps/web/src/services/campaign-search.verification.test.ts
- apps/web/src/services/creator-identity-verification.service.test.ts
- apps/web/src/services/creator-identity-verification.service.ts
- docs/creator-identity-verification.md
- migrations/008_creator_identity_verification.sql

## Modified files (21)
- .env.example
- README.md
- apps/web/src/app/(overview)/campaigns/[id]/page.tsx
- apps/web/src/app/(overview)/campaigns/page.tsx
- apps/web/src/app/api/campaigns/route.ts
- apps/web/src/app/api/campaigns/search/route.ts
- apps/web/src/app/creators/[address]/layout.tsx
- apps/web/src/components/creator/CreatorProfileHeader.tsx
- apps/web/src/components/modules/campaign/CampaignSearchPanel.tsx
- apps/web/src/components/modules/campaigns/CampaignSearch.test.tsx
- apps/web/src/components/modules/campaigns/CampaignSearch.tsx
- apps/web/src/graphql/resolvers.ts
- apps/web/src/graphql/schema.ts
- apps/web/src/hooks/use-campaigns.ts
- apps/web/src/lib/s3/index.ts
- apps/web/src/lib/s3/keys.ts
- apps/web/src/services/campaign-search.service.ts
- apps/web/src/services/campaign.service.ts
- apps/web/src/types/campaign.ts
- docs/campaign-verification.md
- docs/openapi.yaml

## Diff stat
```
 21 files changed, 547 insertions(+), 61 deletions(-)
```
