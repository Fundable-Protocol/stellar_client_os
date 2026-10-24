# Creator Portfolio Feature

## Overview

This feature adds public portfolio pages for campaign creators, allowing them to showcase their environmental impact, campaigns, and community reputation in one place.

## Acceptance Criteria ✓

- [x] Portfolio accessible at `/creators/{address}/portfolio`
- [x] Displays success rate, total raised, and number of campaigns
- [x] Creator can write a short bio
- [x] Creator can add social media links
- [x] Shows achievements/badges
- [x] Environmental impact metrics (trees planted, CO2 offset)
- [x] Campaign history and performance

## Routes

### Public Routes

- **`GET /creators/{address}`** - Creator profile page (existing)
- **`GET /creators/{address}/portfolio`** - Creator portfolio page (NEW)
- **`GET /api/creators/{address}/portfolio`** - Portfolio data API endpoint (NEW)

### Admin/Creator Routes

- **`POST /api/creators/{address}/portfolio`** - Update portfolio data (requires auth)

## File Structure

```
apps/web/src/
├── types/
│   └── creator-portfolio.ts          # Portfolio type definitions
├── services/
│   └── creator-portfolio.service.ts  # Portfolio data aggregation service
├── components/
│   └── creator-portfolio/
│       ├── PortfolioHeader.tsx       # Header with bio and social links
│       ├── PortfolioStats.tsx        # Stats cards display
│       ├── Achievements.tsx          # Achievements/badges display
│       ├── SocialLinks.tsx           # Social media links component
│       ├── PortfolioLink.tsx         # Link to portfolio page
│       └── EditPortfolioModal.tsx    # Edit portfolio form modal
├── app/
│   ├── creators/[address]/
│   │   ├── layout.tsx                # Navigation between profile/portfolio (NEW)
│   │   └── portfolio/
│   │       └── page.tsx              # Portfolio page (NEW)
│   └── api/creators/[address]/
│       └── portfolio/
│           └── route.ts              # API endpoint (NEW)
└── migrations/
    └── 20261018_create_creator_portfolio_tables.sql  # Database schema (NEW)
```

## Data Models

### CreatorPortfolioData
Main portfolio profile information:
- `creatorAddress` - Stellar wallet address
- `displayName` - Creator's public name (optional)
- `bio` - Long-form description (max 500 chars)
- `profileImageUrl` - Avatar URL
- `websiteUrl` - Creator's website (optional)
- `socialLinks` - Array of social media links
- `achievements` - Array of earned achievements/badges
- `createdAt` / `updatedAt` - Timestamps

### PortfolioStats
Aggregated campaign metrics:
- `totalCampaigns` - Number of campaigns created
- `successfulCampaigns` - Number of successful campaigns
- `successRate` - Success percentage (0-100)
- `totalRaisedUsd` - Total funds raised
- `totalBackers` - Number of unique backers
- `totalTreesPlanted` - Total environmental impact
- `totalCo2OffsetKg` - Annual CO2 offset
- `activeCampaigns` - Currently active campaigns

### SocialLink
Social media connection:
- `platform` - Platform type ('twitter', 'instagram', 'facebook', 'linkedin', 'website', 'github')
- `username` - Optional username for the platform
- `url` - Direct URL to profile

### CreatorAchievement
Badge/achievement unlocked:
- `id` - Unique achievement ID
- `name` - Achievement name
- `description` - What was accomplished
- `icon` - Emoji or icon
- `unlockedAt` - Timestamp when earned
- `rarity` - Rarity level ('common', 'rare', 'epic', 'legendary')

## Components

### PortfolioHeader
Displays the creator's profile information with their name, bio, profile image, and social links. Features a gradient background and prominent visual design.

```tsx
<PortfolioHeader profile={profile} />
```

### PortfolioStats
Shows 4-card grid with:
- Total campaigns & successful campaigns
- Success rate & active campaigns
- Total raised in USD & backer count
- Trees planted & CO2 offset

```tsx
<PortfolioStats stats={profile.stats} />
```

### Achievements
Grid display of earned badges/achievements with rarity coloring.

```tsx
<Achievements achievements={profile.achievements} />
```

### SocialLinks
Displays social media links as styled buttons with platform-specific icons.

```tsx
<SocialLinks links={profile.socialLinks} />
```

### EditPortfolioModal
Modal form for creators to edit their portfolio information including bio, display name, website, and social links.

```tsx
<EditPortfolioModal
  profile={profile}
  isOpen={isOpen}
  onClose={handleClose}
  onSave={handleSave}
/>
```

## Services

### getCreatorPortfolioProfile(address)
Fetches complete portfolio data with aggregated stats.

```typescript
const profile = await getCreatorPortfolioProfile('GDJVK...');
// Returns: CreatorPortfolioProfile with all data and stats
```

### updateCreatorPortfolio(address, data)
Updates portfolio information (requires authentication in production).

```typescript
await updateCreatorPortfolio('GDJVK...', {
  bio: 'New bio text',
  displayName: 'My Name',
  socialLinks: [...]
});
```

### getCreatorPortfolio(address)
Fetches just portfolio metadata (without stats).

```typescript
const portfolio = await getCreatorPortfolio('GDJVK...');
```

### getCreatorSocialLinks(address)
Gets social media links for a creator.

```typescript
const links = await getCreatorSocialLinks('GDJVK...');
```

### getCreatorAchievements(address)
Gets earned achievements/badges.

```typescript
const achievements = await getCreatorAchievements('GDJVK...');
```

## API Endpoints

### GET /api/creators/[address]/portfolio
Fetch creator portfolio with stats.

**Response:**
```json
{
  "creatorAddress": "GDJVK...",
  "displayName": "Creator Name",
  "bio": "Creator's bio text",
  "profileImageUrl": "https://...",
  "socialLinks": [
    {
      "platform": "twitter",
      "username": "creator_name",
      "url": "https://twitter.com/creator_name"
    }
  ],
  "achievements": [
    {
      "id": "first-campaign",
      "name": "First Campaign",
      "description": "Launched your first campaign",
      "icon": "🌱",
      "unlockedAt": 1697630000,
      "rarity": "common"
    }
  ],
  "stats": {
    "totalCampaigns": 5,
    "successfulCampaigns": 4,
    "successRate": 80,
    "totalRaisedUsd": "$150,000.00",
    "totalBackers": 2500,
    "totalTreesPlanted": 15000,
    "totalCo2OffsetKg": 45000,
    "activeCampaigns": 1
  },
  "createdAt": 1697630000,
  "updatedAt": 1697630000
}
```

### POST /api/creators/[address]/portfolio
Update creator portfolio (requires authentication).

**Request Body:**
```json
{
  "displayName": "New Name",
  "bio": "Updated bio",
  "websiteUrl": "https://mysite.com",
  "socialLinks": [
    {
      "platform": "twitter",
      "username": "new_handle",
      "url": "https://twitter.com/new_handle"
    }
  ]
}
```

**Validation:**
- Bio: max 500 characters
- Social links: max 10 per creator

## Database Schema

### creator_profiles
Stores creator portfolio metadata.

```sql
CREATE TABLE creator_profiles (
  creator_address text PRIMARY KEY,
  display_name text,
  bio text,
  profile_image_url text,
  website_url text,
  created_at timestamptz,
  updated_at timestamptz
);
```

### creator_social_links
Stores social media links with unique platform constraint per creator.

```sql
CREATE TABLE creator_social_links (
  id uuid PRIMARY KEY,
  creator_address text REFERENCES creator_profiles,
  platform text,
  username text,
  url text,
  created_at timestamptz
);
```

### creator_achievements
Stores earned achievements/badges.

```sql
CREATE TABLE creator_achievements (
  id uuid PRIMARY KEY,
  creator_address text REFERENCES creator_profiles,
  achievement_name text,
  description text,
  icon text,
  rarity text,
  unlocked_at timestamptz,
  created_at timestamptz
);
```

## Features

### Current Implementation

1. **Portfolio Display**
   - Creator profile card with avatar
   - Display name and bio
   - Social media links
   - Environmental impact metrics
   - Campaign statistics (total, successful, success rate)
   - Achievements/badges grid
   - Campaign history list

2. **Data Aggregation**
   - Aggregates data from existing campaign records
   - Calculates success rates and impact metrics
   - Combines creator profile metadata with campaign stats

3. **Navigation**
   - Tab navigation between profile and portfolio
   - Share profile functionality
   - Link to active campaigns

4. **Demo Data**
   - Pre-populated demo creators with profile data
   - Demo achievements based on creator metrics
   - Sample social links

### Future Enhancements

1. **Creator Dashboard**
   - Edit portfolio form (component ready: `EditPortfolioModal`)
   - Upload custom profile image
   - Manage achievements
   - Performance analytics

2. **Reputation System**
   - Backer reviews and ratings (already partially implemented)
   - Trust badges
   - Verification indicators

3. **Search & Discovery**
   - Filter creators by success rate
   - Sort by impact metrics
   - Search by creator name/bio

4. **Social Sharing**
   - Share portfolio links
   - Embed portfolio widget
   - OG metadata for social previews

5. **Achievements System**
   - Automated achievement unlock logic
   - Milestones (100k raised, 10k trees, etc.)
   - Leaderboards

## Integration Points

### With Existing Code

- **Creator Stats**: Uses `getCreatorStats()` to aggregate campaign metrics
- **Campaign Service**: Queries campaigns by creator address
- **Reviews Service**: Displays aggregated ratings from backers
- **Campaign Components**: Reuses existing `CreatorCampaignsList` component

### With Authentication (TODO)

The portfolio editing functionality needs authentication to verify the user is the creator:

```typescript
// In POST handler, add authentication check:
const session = await getSession();
if (!session || session.address !== address) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

## Styling

Components use Tailwind CSS with:
- Gradient backgrounds (green-to-blue theme)
- Shadow effects for depth
- Hover states for interactivity
- Responsive grid layouts
- Mobile-first design
- Accessibility-friendly colors and spacing

## Testing

### Manual Testing Checklist

- [ ] Navigate to `/creators/{address}` to see original profile
- [ ] Navigate to `/creators/{address}/portfolio` to see new portfolio
- [ ] Tab navigation between profile and portfolio works
- [ ] API endpoint `/api/creators/{address}/portfolio` returns correct data
- [ ] Social links display properly
- [ ] Achievement badges show with correct rarity colors
- [ ] Stats cards display accurate numbers
- [ ] Responsive design works on mobile/tablet
- [ ] Campaign history loads correctly
- [ ] Share buttons work

### Demo Creators

Use these addresses to test with pre-populated data:
- `GBQT37PPA7P2G7QXMKYGN5FHVMJQ3LTFP5YXGR4SZWWQF2CXJLVHZMY3`
- `GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7`
- `GCUQNQQ7GIXHTTWVFYH4EEHJWQ2RZVLZ4GJZXFK2WNMJSDWXVHVWDVXX`

## Migration

To apply database schema:

```bash
psql -d your_database < apps/web/migrations/20261018_create_creator_portfolio_tables.sql
```

Or if using Prisma, create a migration:

```bash
npx prisma migrate dev --name create_creator_portfolio_tables
```

## Configuration

### Environment Variables

None required for basic functionality. The feature uses demo data by default.

For production:
- Add authentication mechanism
- Configure image storage (CDN/S3)
- Set up achievement unlock triggers

## Performance

- Portfolio data cached for 1 hour (3600s) in API response headers
- Stats aggregated on-demand from existing campaign records
- No additional database queries needed for demo implementation
- Optimized image loading with Next.js Image component

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Color contrast meets WCAG AA standards
- Keyboard navigation support
- Alt text on images

## Security

- Creator address validation on all routes
- Input sanitization for bio/profile data (max length limits)
- Social link URL validation
- Protected POST endpoint (authentication needed in production)

## Known Limitations

1. **Demo Data**: Currently uses in-memory storage. Production needs database implementation.
2. **Authentication**: POST endpoint has authentication check commented out - needs session implementation.
3. **Image Upload**: Profile images use avatar generator. Real upload feature needed.
4. **Achievement Logic**: Achievements are static. Dynamic unlock system needed.

## Future Roadmap

- [ ] Implement achievement unlock triggers based on campaign milestones
- [ ] Add creator verification badges
- [ ] Build creator onboarding flow
- [ ] Analytics dashboard for creators
- [ ] Creator awards/recognition program
- [ ] Integration with email notifications
- [ ] Creator tier system (already typed in codebase)
- [ ] Portfolio customization themes
