# Creator identity verification (optional, badge-earning)

Campaign creators can **optionally** verify their identity to build backer trust.
Verification never blocks creating or running a campaign; it only earns trust signals:

| Verified steps | Level        | What backers see                                              |
| -------------- | ------------ | ------------------------------------------------------------- |
| 0 of 3         | `unverified` | Nothing (no penalty — verification is optional)               |
| 1–2 of 3       | `partial`    | Subdued chip, e.g. **"2 of 3 identity checks"**               |
| 3 of 3         | `verified`   | **"Verified Creator"** badge on every campaign by the creator |

The three steps are:

1. **Email** — a 6-digit one-time code sent to the creator's email address.
2. **Phone** — a 6-digit one-time code sent by SMS (international E.164 format, e.g. `+2348012345678`).
3. **Government ID** — a passport, national ID card or driver's licence, approved by a Fundable reviewer.

Verification belongs to the **creator's Stellar address**, so earning (or losing) the badge
updates all of that creator's campaigns at once.

---

## For creators: how to get verified

Open **`/creators/<your-address>/verification`** (also linked as the *Verification* tab on your
creator profile, and as *"Get the Verified Creator badge"* on your campaign page).

### Step 0 — Prove you own the creator address

Connect the wallet that owns your creator address and click **Sign with wallet**. You sign a
one-time text message (no transaction, no fees). This opens a verification session valid for
1 hour, and prevents anyone else from verifying — or withdrawing — on your behalf.

### Step 1 — Verify your email

1. Enter your email address and click **Send code**.
2. Enter the 6-digit code from the email within **10 minutes** and click **Verify code**.

### Step 2 — Verify your phone number

1. Enter your phone number in international format (`+` country code, then number) and click **Send code**.
2. Enter the 6-digit code from the SMS within **10 minutes**.

### Step 3 — Verify your government ID

1. Choose the document type (passport, national ID card or driver's licence) and the
   issuing country's two-letter ISO code (e.g. `NG`, `KE`, `US`).
2. Attach a clear photo (JPEG/PNG/WebP/HEIC) or PDF of the document and click **Submit for review**.
3. The step shows **Pending** until a reviewer approves it. If it is **Rejected**, the reason is
   shown and you can submit a new document.

When all three steps show **Verified**, the **Verified Creator** badge appears on your campaigns,
on your creator profile and in search results.

### Code rules

| Rule                    | Value                                          |
| ----------------------- | ---------------------------------------------- |
| Code length             | 6 digits                                       |
| Code lifetime           | 10 minutes                                     |
| Wrong attempts allowed  | 5 per code (then request a new code)           |
| Resend cooldown         | 60 seconds                                     |
| Wallet session lifetime | 1 hour                                         |

### Changing details or opting out

- Starting verification for a **new** email or phone number replaces the previous verification
  for that step, so the full badge is removed until the new contact is confirmed.
- You can **withdraw** at any time from the verification page. All stored verification data is
  erased and the badge is removed from your campaigns.

---

## For backers: what the badge means

- **Verified Creator** — the creator confirmed control of an email inbox and a phone number, and a
  Fundable reviewer approved a government-issued ID for the creator's address.
- **"n of 3 identity checks"** — the creator completed some, but not all, steps.
- **No badge** — the creator has not opted in. This is not a negative signal by itself.

The badge is a trust signal, not an endorsement of the campaign's goals or outcomes; continue to
review a campaign's milestones, evidence and audit trail (see [campaign-verification.md](campaign-verification.md)).

### Where verification status is shown

- Campaign detail page header (next to the creator address).
- Campaign directory cards (`/campaigns`).
- Campaign search results (`GET /api/campaigns/search` and the search panel), including a
  **"Verified creators only"** filter. When relevance is equal, verified creators rank first,
  then partially verified creators.
- Creator profile header (`/creators/<address>`).
- APIs: `/api/campaigns`, `/api/campaigns/search` and the GraphQL `Campaign.verification` field.

---

## Privacy & security

- Only the **outcome** (verified / not verified per step) is public. Email addresses and phone
  numbers are kept only as a masked form (e.g. `j•••e@example.org`, `+•••5678`) plus a salted
  hash, visible solely to the creator's own session.
- One-time codes are stored as salted SHA-256 hashes and compared in constant time.
- Government ID documents are uploaded to a **private** storage prefix
  (`creator-identity/<address>/…`) separate from public campaign evidence; the public API never
  returns the document reference. Submissions must reference the creator's own prefix.
- Pending/rejected states and rejection reasons are visible only to the creator and admins.
- Approving or rejecting a government ID requires the admin API key.

---

## API reference

All endpoints live under `/api/creators/{address}/verification`, where `{address}` is the
creator's Stellar public key (`G…`). Endpoints marked 🔐 require
`Authorization: Bearer <session token>` (from the session endpoint) for the **same** address;
endpoints marked 🛡️ require `Authorization: Bearer <ADMIN_API_KEY>`.

| Method   | Path                                   | Auth | Purpose                                       |
| -------- | -------------------------------------- | ---- | --------------------------------------------- |
| `GET`    | `/verification`                        | —    | Public status (owner view with a session)     |
| `DELETE` | `/verification`                        | 🔐   | Withdraw & erase verification data            |
| `POST`   | `/verification/session`                | —    | Wallet challenge / session token              |
| `POST`   | `/verification/email`                  | 🔐   | Send / confirm email code                     |
| `POST`   | `/verification/phone`                  | 🔐   | Send / confirm SMS code                       |
| `POST`   | `/verification/government-id/upload`   | 🔐   | Pre-signed upload URL for the ID document     |
| `POST`   | `/verification/government-id`          | 🔐   | Submit the ID document for review             |
| `PATCH`  | `/verification/government-id`          | 🛡️   | Approve / reject a pending ID                 |
| `GET`    | `/api/admin/creator-verifications`     | 🛡️   | Review queue (pending government IDs)         |

### 0. Session

```http
POST /api/creators/GABC.../verification/session
{ "action": "challenge" }
→ 200 { "nonce": "uuid", "message": "Fundable creator identity verification\nAddress: GABC...\nNonce: uuid", "expiresAt": 1780000300000 }

POST /api/creators/GABC.../verification/session
{ "action": "verify", "nonce": "uuid", "signature": "<base64 or hex ed25519 signature>" }
→ 200 { "token": "uuid", "expiresAt": 1780003600000 }
```

Signatures may be a raw ed25519 signature over the message bytes, or a
[SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) signature
as produced by wallet `signMessage` APIs (e.g. Freighter).

### 1–2. Email / phone

```http
POST /api/creators/GABC.../verification/email
Authorization: Bearer <token>
{ "action": "start", "email": "creator@example.org" }
→ 202 { "dispatch": { "step": "email", "status": "pending", "maskedTarget": "c•••r@example.org", "expiresAt": 1780000600000 }, "verification": { ... } }

{ "action": "confirm", "code": "123456" }
→ 200 { "verification": { "summary": { "status": "partial", ... }, "steps": [ ... ] } }
```

Phone uses the same shape at `/verification/phone` with `{ "action": "start", "phone": "+2348012345678" }`.

### 3. Government ID

```http
POST /api/creators/GABC.../verification/government-id/upload
Authorization: Bearer <token>
{ "contentType": "image/jpeg" }
→ 200 { "url": "https://<bucket>.s3...", "key": "creator-identity/GABC.../uuid.jpg", "contentType": "image/jpeg", "expiresAt": 1780000300 }

PUT <url>   (upload the file with the same Content-Type)

POST /api/creators/GABC.../verification/government-id
Authorization: Bearer <token>
{ "documentType": "passport", "issuingCountry": "NG", "documentReference": "creator-identity/GABC.../uuid.jpg" }
→ 202 { "verification": { "steps": [ ..., { "step": "government_id", "status": "pending" } ] } }
```

Admin review:

```http
GET /api/admin/creator-verifications
Authorization: Bearer <ADMIN_API_KEY>
→ 200 { "pending": [ { "creator": "GABC...", "documentType": "passport", "issuingCountry": "NG", "documentReference": "...", "submittedAt": 1780000000000 } ], "count": 1 }

PATCH /api/creators/GABC.../verification/government-id
Authorization: Bearer <ADMIN_API_KEY>
{ "decision": "approve", "reviewer": "trust-team@fundable" }
{ "decision": "reject", "reviewer": "trust-team@fundable", "reason": "Document is blurry" }   // reason required
```

### Public status

```http
GET /api/creators/GABC.../verification
→ 200 {
  "owner": false,
  "verification": {
    "creator": "GABC...",
    "summary": {
      "emailVerified": true, "phoneVerified": true, "governmentIdVerified": true,
      "badges": ["email", "phone", "government_id"],
      "status": "verified", "isVerified": true, "verifiedCount": 3, "totalCount": 3, "verifiedAt": 1780000900000
    },
    "steps": [ { "step": "email", "status": "verified", "verifiedAt": ... }, ... ]
  }
}
```

### Search & listings

- `GET /api/campaigns/search?q=mangrove` — every result includes `verification` (the summary above)
  and `campaign.creatorVerification`.
- `GET /api/campaigns/search?verified=true` — only campaigns by Verified Creators (may be used
  without a query).
- `GET /api/campaigns?verified=true` — listing filter; each campaign includes `creatorVerification`,
  `verified`, `verificationStatus` and `verificationBadges`.
- GraphQL: `campaigns(filter: { verifiedOnly: true })`, and `Campaign.verification { emailVerified phoneVerified governmentIdVerified isVerified status }`.

### Errors

Errors return `{ "error": "<message>", "code": "<CODE>" }`:

| Code                   | HTTP | Meaning                                         |
| ---------------------- | ---- | ----------------------------------------------- |
| `INVALID_INPUT`        | 400  | Malformed email/phone/code/document fields      |
| `INVALID_ADDRESS`      | 400  | `{address}` is not a Stellar public key         |
| `INVALID_CODE`         | 400  | Wrong code (remaining attempts in the message)  |
| `NO_PENDING_CHALLENGE` | 409  | Confirm called before a code was requested      |
| `INVALID_STATE`        | 409  | Already verified / already awaiting review      |
| `NOT_FOUND`            | 404  | No pending government ID to review              |
| `CHALLENGE_EXPIRED`    | 410  | Code expired — request a new one                |
| `TOO_MANY_ATTEMPTS`    | 429  | 5 wrong attempts — request a new code           |
| `RATE_LIMITED`         | 429  | Resend requested within the 60 s cooldown       |
| `DELIVERY_FAILED`      | 502  | Email/SMS provider could not deliver the code   |

Missing or invalid sessions return `401`; a session for a different address returns `403`.

---

## Configuration

| Variable                          | Purpose                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `ADMIN_API_KEY`                   | Required for the admin review endpoints (fail closed with `503` when unset).                  |
| `AWS_S3_BUCKET`, `AWS_REGION`, …  | Storage for ID documents (same S3 configuration as evidence uploads).                         |
| `CREATOR_VERIFICATION_DEV_CODES`  | Set to `true` **in local development only** to echo one-time codes in API responses (`devCode`). Ignored when `NODE_ENV=production`. |

Email delivery uses `EmailService`; SMS delivery uses a pluggable sender
(`CreatorIdentityVerificationService({ sendSmsCode })`) — wire a production SMS gateway there.

## Implementation map

| Concern                         | Location                                                                 |
| ------------------------------- | ------------------------------------------------------------------------ |
| Shared model, badge rules       | `apps/web/src/lib/creator-verification.ts`                               |
| Flow, codes, sessions, review   | `apps/web/src/services/creator-identity-verification.service.ts`         |
| HTTP routes                     | `apps/web/src/app/api/creators/[address]/verification/**`                |
| Badge component                 | `apps/web/src/components/creator/CreatorVerificationBadge.tsx`           |
| Creator wizard                  | `apps/web/src/components/creator/CreatorVerificationWizard.tsx`          |
| Search integration              | `apps/web/src/services/campaign-search.service.ts`                       |
| Database schema (reference)     | `migrations/008_creator_identity_verification.sql`                       |
