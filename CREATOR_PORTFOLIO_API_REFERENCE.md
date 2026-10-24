# Creator Portfolio API Reference

## Base URL

```
https://api.fundable.com/api
```

## Authentication

POST endpoints require bearer token authentication (to be implemented):

```
Authorization: Bearer {wallet_signature}
```

## Endpoints

### GET /creators/[address]/portfolio

Retrieve complete creator portfolio with statistics.

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| address | string | URL path | Yes | Stellar wallet address (56 chars starting with 'G') |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| include | string | all | Comma-separated fields to include: `profile,stats,achievements,social` |
| format | string | json | Response format: `json` or `xml` |

#### Example Request

```bash
curl -X GET "https://api.fundable.com/api/creators/GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7/portfolio"
```

#### Response (200 OK)

```json
{
  "creatorAddress": "GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7",
  "displayName": "Creator Name",
  "bio": "Passionate environmental advocate with a mission to plant trees globally.",
  "profileImageUrl": "https://api.dicebear.com/7.x/avataaars/svg?seed=GDJVK...",
  "websiteUrl": "https://example.com",
  "socialLinks": [
    {
      "platform": "twitter",
      "username": "creator_name",
      "url": "https://twitter.com/creator_name"
    },
    {
      "platform": "instagram",
      "username": "creator_eco",
      "url": "https://instagram.com/creator_eco"
    },
    {
      "platform": "website",
      "url": "https://example.com"
    }
  ],
  "achievements": [
    {
      "id": "first-campaign",
      "name": "First Campaign",
      "description": "Launched your first campaign",
      "icon": "🌱",
      "unlockedAt": 1697630000000,
      "rarity": "common"
    },
    {
      "id": "100k-raised",
      "name": "Century Club",
      "description": "Raised over $100,000",
      "icon": "💰",
      "unlockedAt": 1697890000000,
      "rarity": "rare"
    },
    {
      "id": "impact-leader",
      "name": "Impact Leader",
      "description": "Planted over 10,000 trees",
      "icon": "🌳",
      "unlockedAt": 1698150000000,
      "rarity": "epic"
    }
  ],
  "stats": {
    "totalCampaigns": 5,
    "successfulCampaigns": 4,
    "successRate": 80.0,
    "totalRaisedUsd": "$150,000.00",
    "totalBackers": 2500,
    "totalTreesPlanted": 15000,
    "totalCo2OffsetKg": 45000,
    "activeCampaigns": 1
  },
  "createdAt": 1697630000000,
  "updatedAt": 1698250000000
}
```

#### Error Responses

**400 Bad Request** - Invalid address format
```json
{
  "error": "Invalid creator address",
  "code": "INVALID_ADDRESS_FORMAT",
  "message": "Creator address must be 56 characters starting with 'G'"
}
```

**404 Not Found** - Creator portfolio not found
```json
{
  "error": "Creator portfolio not found",
  "code": "PORTFOLIO_NOT_FOUND",
  "message": "No portfolio exists for address GDJVK..."
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to fetch creator portfolio",
  "code": "INTERNAL_ERROR",
  "message": "An unexpected error occurred while fetching the portfolio"
}
```

#### Caching

Responses include cache headers:
```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

- **s-maxage=3600**: Cached for 1 hour on CDN
- **stale-while-revalidate=86400**: Stale response served for 24 hours while background refresh

---

### POST /api/creators/[address]/portfolio

Update creator portfolio information (requires authentication).

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| address | string | URL path | Yes | Stellar wallet address |

#### Request Body

```json
{
  "displayName": "New Display Name",
  "bio": "Updated bio text...",
  "profileImageUrl": "https://cdn.example.com/avatar.jpg",
  "websiteUrl": "https://example.com",
  "socialLinks": [
    {
      "platform": "twitter",
      "username": "new_handle",
      "url": "https://twitter.com/new_handle"
    }
  ]
}
```

#### Request Body Schema

| Field | Type | Max Length | Required | Description |
|-------|------|-----------|----------|-------------|
| displayName | string | 100 | No | Creator's display name |
| bio | string | 500 | No | Creator biography |
| profileImageUrl | string | 500 | No | URL to profile image |
| websiteUrl | string | 500 | No | Creator's website URL |
| socialLinks | array | - | No | Array of social media links |

#### Social Links Schema

| Field | Type | Required | Values |
|-------|------|----------|--------|
| platform | string | Yes | `twitter`, `instagram`, `facebook`, `linkedin`, `github`, `website` |
| username | string | No | Platform-specific username |
| url | string | Yes | Full URL to profile |

#### Example Request

```bash
curl -X POST "https://api.fundable.com/api/creators/GDJVK.../portfolio" \
  -H "Authorization: Bearer {signature}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Jane Eco",
    "bio": "Environmental activist focused on reforestation in Southeast Asia.",
    "websiteUrl": "https://janeecoinitiative.com",
    "socialLinks": [
      {
        "platform": "twitter",
        "username": "jane_eco",
        "url": "https://twitter.com/jane_eco"
      },
      {
        "platform": "instagram",
        "username": "jane.eco.initiative",
        "url": "https://instagram.com/jane.eco.initiative"
      }
    ]
  }'
```

#### Response (200 OK)

Returns updated portfolio data:

```json
{
  "creatorAddress": "GDJVK...",
  "displayName": "Jane Eco",
  "bio": "Environmental activist focused on reforestation in Southeast Asia.",
  "profileImageUrl": "...",
  "websiteUrl": "https://janeecoinitiative.com",
  "socialLinks": [
    {
      "platform": "twitter",
      "username": "jane_eco",
      "url": "https://twitter.com/jane_eco"
    },
    {
      "platform": "instagram",
      "username": "jane.eco.initiative",
      "url": "https://instagram.com/jane.eco.initiative"
    }
  ],
  "achievements": [...],
  "createdAt": 1697630000000,
  "updatedAt": 1698250000000
}
```

#### Error Responses

**400 Bad Request** - Validation error

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "bio": "Bio must be 500 characters or less",
    "socialLinks": "Maximum 10 social links allowed"
  }
}
```

**401 Unauthorized** - Invalid or missing authentication

```json
{
  "error": "Unauthorized",
  "code": "AUTH_FAILED",
  "message": "Invalid wallet signature or not the portfolio owner"
}
```

**404 Not Found** - Creator not found

```json
{
  "error": "Creator not found",
  "code": "CREATOR_NOT_FOUND",
  "message": "No creator profile exists for this address"
}
```

**422 Unprocessable Entity** - Invalid social link

```json
{
  "error": "Invalid social link",
  "code": "INVALID_SOCIAL_LINK",
  "details": {
    "index": 0,
    "platform": "Invalid platform. Must be one of: twitter, instagram, facebook, linkedin, github, website"
  }
}
```

---

## Response Formats

### Portfolio Profile Object

```typescript
interface CreatorPortfolioProfile {
  creatorAddress: string;
  displayName?: string;
  bio?: string;
  profileImageUrl?: string;
  websiteUrl?: string;
  socialLinks: SocialLink[];
  achievements: CreatorAchievement[];
  stats: PortfolioStats;
  createdAt: number;
  updatedAt: number;
}
```

### Social Link Object

```typescript
interface SocialLink {
  platform: 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'website' | 'github';
  username?: string;
  url: string;
}
```

### Achievement Object

```typescript
interface CreatorAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
```

### Portfolio Stats Object

```typescript
interface PortfolioStats {
  totalCampaigns: number;
  successfulCampaigns: number;
  successRate: number;
  totalRaisedUsd: string;
  totalBackers: number;
  totalTreesPlanted: number;
  totalCo2OffsetKg: number;
  activeCampaigns: number;
}
```

---

## Rate Limiting

Rate limits are applied per wallet address:

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /creators/[address]/portfolio | 100 requests | 1 hour |
| POST /creators/[address]/portfolio | 10 requests | 1 hour |

Headers returned:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1698290000
```

---

## Pagination (Future)

For endpoints returning lists (campaigns, achievements), pagination will be:

```
GET /api/creators/{address}/portfolio/campaigns?page=1&limit=10

{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

## Webhooks (Future)

Portfolio updates can trigger webhooks:

```
POST {webhook_url}
Content-Type: application/json

{
  "event": "portfolio.updated",
  "creatorAddress": "GDJVK...",
  "timestamp": 1698250000000,
  "changes": {
    "bio": "old_value -> new_value",
    "socialLinks": "..."
  }
}
```

---

## GraphQL API (Future)

Alternative GraphQL endpoint:

```graphql
query {
  creator(address: "GDJVK...") {
    portfolio {
      displayName
      bio
      socialLinks {
        platform
        username
        url
      }
      achievements {
        id
        name
        rarity
      }
      stats {
        totalCampaigns
        successRate
        totalRaisedUsd
      }
    }
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { CreatorPortfolioClient } from '@fundable/sdk';

const client = new CreatorPortfolioClient({
  baseUrl: 'https://api.fundable.com/api'
});

// Fetch portfolio
const portfolio = await client.getPortfolio('GDJVK...');
console.log(portfolio.stats.totalRaisedUsd);

// Update portfolio
await client.updatePortfolio('GDJVK...', {
  bio: 'New bio',
  socialLinks: [
    {
      platform: 'twitter',
      username: 'handle',
      url: 'https://twitter.com/handle'
    }
  ]
}, signature);
```

### Python

```python
from fundable import CreatorPortfolio

client = CreatorPortfolio(api_key='your-api-key')

# Fetch portfolio
portfolio = client.get_portfolio('GDJVK...')
print(f"Success rate: {portfolio.stats.success_rate}%")

# Update portfolio
client.update_portfolio('GDJVK...', {
    'bio': 'New bio',
    'displayName': 'Jane Eco'
})
```

---

## Common Use Cases

### Display Creator Card

```javascript
const response = await fetch(`/api/creators/${address}/portfolio`);
const profile = await response.json();

// Display name + success rate + total raised
console.log(`${profile.displayName} - ${profile.stats.successRate}% success rate`);
console.log(`Total raised: ${profile.stats.totalRaisedUsd}`);
```

### Filter by Success Rate

```javascript
const creators = await Promise.all([
  fetch(`/api/creators/${addr1}/portfolio`),
  fetch(`/api/creators/${addr2}/portfolio`)
].map(r => r.json()));

const topCreators = creators.filter(c => c.stats.successRate >= 80);
```

### Share Portfolio

```javascript
const shareUrl = new URL('https://fundable.com/creators/{address}/portfolio');
const shareText = `Check out ${profile.displayName}'s portfolio: ${profile.stats.totalCampaigns} campaigns, ${profile.stats.successRate}% success rate!`;
```

---

## Status Codes Reference

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Authentication failed |
| 404 | Not Found | Resource not found |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

---

## Changelog

### v1.0.0 (2026-10-18)
- Initial API release
- GET portfolio endpoint
- POST portfolio update endpoint
- Achievement tracking
- Social links management

### v1.1.0 (Future)
- Pagination support
- Advanced filtering
- Webhook support
- GraphQL endpoint
- Analytics endpoints

---

## Support

- **API Issues**: support@fundable.com
- **Documentation**: docs.fundable.com/api/creators
- **Status**: status.fundable.com
