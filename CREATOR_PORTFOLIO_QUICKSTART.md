# Creator Portfolio Feature - Quick Start Guide

## What's New

Creator portfolio pages are now available at `/creators/{address}/portfolio`, allowing creators to showcase their impact, achievements, and campaign history.

## For Users/Testers

### Viewing a Creator Portfolio

1. Navigate to a creator's address page: `/creators/{stellar_address}`
2. Click the "Portfolio" tab in the navigation
3. You'll see:
   - Creator name and bio
   - Social media links
   - Key statistics (campaigns, success rate, funds raised, trees planted)
   - Achievements and badges
   - Campaign history

### Demo Creators

Use these test addresses to view pre-populated portfolios:

```
/creators/GBQT37PPA7P2G7QXMKYGN5FHVMJQ3LTFP5YXGR4SZWWQF2CXJLVHZMY3/portfolio
/creators/GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7/portfolio
/creators/GCUQNQQ7GIXHTTWVFYH4EEHJWQ2RZVLZ4GJZXFK2WNMJSDWXVHVWDVXX/portfolio
```

## For Developers

### File Structure

```
apps/web/src/
├── types/creator-portfolio.ts                    # Data types
├── services/creator-portfolio.service.ts         # Business logic
├── components/creator-portfolio/                 # React components
│   ├── PortfolioHeader.tsx
│   ├── PortfolioStats.tsx
│   ├── Achievements.tsx
│   ├── SocialLinks.tsx
│   ├── PortfolioLink.tsx
│   └── EditPortfolioModal.tsx
├── app/creators/[address]/
│   ├── layout.tsx                                # Navigation layout (NEW)
│   └── portfolio/page.tsx                        # Portfolio page (NEW)
└── app/api/creators/[address]/portfolio/route.ts # API endpoint (NEW)
```

### Using Portfolio Components

#### Import and Display Portfolio

```tsx
import { PortfolioHeader } from '@/components/creator-portfolio/PortfolioHeader';
import { PortfolioStats } from '@/components/creator-portfolio/PortfolioStats';
import { getCreatorPortfolioProfile } from '@/services/creator-portfolio.service';

// In an async component:
const profile = await getCreatorPortfolioProfile(creatorAddress);

return (
  <>
    <PortfolioHeader profile={profile} />
    <PortfolioStats stats={profile.stats} />
  </>
);
```

#### Link to Portfolio

```tsx
import { PortfolioLink } from '@/components/creator-portfolio/PortfolioLink';

// As a button:
<PortfolioLink creatorAddress={address} variant="button" />

// As a inline link:
<PortfolioLink creatorAddress={address} variant="link" />
```

#### Edit Portfolio (Future)

```tsx
import { EditPortfolioModal } from '@/components/creator-portfolio/EditPortfolioModal';

const [isOpen, setIsOpen] = useState(false);

return (
  <>
    <button onClick={() => setIsOpen(true)}>Edit Portfolio</button>
    <EditPortfolioModal
      profile={profile}
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onSave={async (data) => {
        await updateCreatorPortfolio(address, data);
      }}
    />
  </>
);
```

### Service Methods

```typescript
import {
  getCreatorPortfolioProfile,
  getCreatorPortfolio,
  updateCreatorPortfolio,
  getCreatorSocialLinks,
  getCreatorAchievements,
  addCreatorAchievement,
} from '@/services/creator-portfolio.service';

// Get complete portfolio with stats
const profile = await getCreatorPortfolioProfile('G...');

// Get just portfolio data (no stats)
const portfolio = await getCreatorPortfolio('G...');

// Update portfolio
await updateCreatorPortfolio('G...', {
  displayName: 'My Name',
  bio: 'My bio',
  websiteUrl: 'https://example.com',
  socialLinks: [
    {
      platform: 'twitter',
      username: 'myhandle',
      url: 'https://twitter.com/myhandle'
    }
  ]
});

// Get social links
const links = await getCreatorSocialLinks('G...');

// Get achievements
const achievements = await getCreatorAchievements('G...');

// Add achievement
await addCreatorAchievement('G...', {
  id: 'my-achievement',
  name: 'Achievement Name',
  description: 'Description',
  icon: '🏆',
  unlockedAt: Date.now(),
  rarity: 'rare'
});
```

### API Endpoints

#### GET /api/creators/[address]/portfolio

Fetch portfolio data.

```bash
curl https://app.example.com/api/creators/GDJVK.../portfolio
```

Response includes profile data and stats (cached for 1 hour).

#### POST /api/creators/[address]/portfolio

Update portfolio (requires authentication - to be implemented).

```bash
curl -X POST https://app.example.com/api/creators/GDJVK.../portfolio \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "New Name",
    "bio": "Updated bio",
    "socialLinks": [...]
  }'
```

## Integration Checklist

- [x] Portfolio page created
- [x] API endpoint created
- [x] Components created
- [x] Services created
- [x] Database schema created (SQL)
- [x] Types defined
- [x] Navigation added
- [ ] Authentication implemented (POST endpoint)
- [ ] Image upload implemented
- [ ] Achievement unlock logic implemented
- [ ] Verification badges added
- [ ] Testing completed

## Current Limitations

1. **Demo Data Only**: Currently uses in-memory storage with demo data
2. **No Auth**: POST endpoint has auth check commented out
3. **Static Achievements**: Achievements are pre-populated, not dynamically earned
4. **Avatar Generator**: Uses dicebear API for profile images

## Production Setup

To enable database persistence:

1. **Run Migration**
   ```bash
   psql -d your_database < apps/web/migrations/20261018_create_creator_portfolio_tables.sql
   ```

2. **Update Service**
   - Replace in-memory `portfolioDatabase` Map with real database queries
   - Use your ORM (Prisma, TypeORM, etc.) to fetch/store data

3. **Add Authentication**
   - Uncomment auth check in POST endpoint
   - Verify user address matches Stellar wallet

4. **Configure Image Storage**
   - Replace dicebear URLs with CDN storage
   - Add image upload form in EditPortfolioModal

5. **Implement Achievement Logic**
   - Add triggers when campaigns hit milestones
   - Create admin panel to award badges

## Styling Guide

All components use Tailwind CSS with:
- Green-to-blue gradient theme (`from-green-500 to-blue-500`)
- Shadow effects for depth (`shadow-md`, `shadow-lg`)
- Hover states for interactivity
- Mobile-first responsive design
- Accessibility colors (WCAG AA compliant)

### Color Palette

- Primary: Green (`#10B981`) - Environmental/growth
- Secondary: Blue (`#3B82F6`) - Trust/stability
- Accent: Purple (`#A855F7`) - Premium/exclusive
- Neutral: Gray (`#6B7280`) - Professional

### Achievement Rarities

- **Common** - Gray background, standard achievement
- **Rare** - Blue background, notable milestone
- **Epic** - Purple background, significant achievement
- **Legendary** - Gold/Yellow background, highest tier

## Testing

### Manual Test Flow

1. Start the web app: `npm run dev`
2. Navigate to `/creators/{address}` for any creator
3. Click the "Portfolio" tab
4. Verify all elements render:
   - Header with bio and social links
   - Stats cards with correct numbers
   - Achievement badges with rarities
   - Campaign history list
5. Test API: `curl http://localhost:3000/api/creators/{address}/portfolio`
6. Check responsive design on mobile/tablet

### Test Addresses

```javascript
const testAddresses = [
  'GBQT37PPA7P2G7QXMKYGN5FHVMJQ3LTFP5YXGR4SZWWQF2CXJLVHZMY3',
  'GDJVKSMSLRX4DN7KNIDKF7A7TNVR7NMY76WFEJNZGFX73ZQFYH3QLBM7',
  'GCUQNQQ7GIXHTTWVFYH4EEHJWQ2RZVLZ4GJZXFK2WNMJSDWXVHVWDVXX',
];
```

## Next Steps

1. **Database Integration** - Replace demo data with real database
2. **Authentication** - Implement wallet verification for profile edits
3. **Image Upload** - Add image upload feature for avatars
4. **Achievement System** - Create dynamic achievement unlock triggers
5. **Creator Onboarding** - Build guided setup flow for new creators
6. **Verification** - Add verification badge system
7. **Analytics** - Creator dashboard with performance metrics
8. **Customization** - Portfolio themes and customization options

## Support

For questions or issues, refer to:
- `CREATOR_PORTFOLIO_FEATURE.md` - Detailed documentation
- `apps/web/src/services/creator-portfolio.service.ts` - Service implementation
- `apps/web/src/components/creator-portfolio/` - Component implementations
