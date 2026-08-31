import { NextResponse } from 'next/server';

// Mock data for campaign success stories
// In a real implementation, this would come from a database or external service
const successStories = [
  {
    id: 'story-001',
    campaignId: 'camp-101',
    title: 'Save the Amazon RainForest Reserve',
    category: 'Environmental & Reforestation',
    raisedAmount: '33,850',
    goalAmount: '50,000',
    token: 'XLM',
    sponsorCount: 6,
    collaboratorCount: 2,
    status: 'COMPLETED',
    description: 'Despite not reaching the full goal, the campaign successfully purchased 25,000 hectares of critical rainforest and implemented the first phase of community-led guardianship.',
    coverImageUrl: '/images/success-stories/amazon.jpg',
    creatorInterview: {
      id: 'int-001',
      quote: 'We proved that small-scale grassroots funding can make a real impact. The backers faith kept us going, and we delivered on our promise to protect the land.',
      author: 'Maria Alvarez',
      role: 'Lead Organizer, Amazon Reserve Initiative',
      avatarUrl: '/images/avatars/maria.jpg',
    },
    backerTestimonials: [
      {
        id: 'test-001',
        author: 'John Doe',
        content: 'Been part of this journey was incredible. The team kept us updated every step of the way and the land is now protected.',
        rating: 5,
      {
        id: 'test-002',
        author: 'Jane Smith',
        content: 'I’ve funded many campaigns, but this one truly shipped. Transparency and results exceeded my expectations.',
        rating: 5,
      },
    ],
  },
  {
    id: 'story-002',
    campaignId: 'camp-102',
    title: 'Clean Water Wells for Sub-Saharan Communities',
    category: 'Community & Social Impact',
    raisedAmount: '18,200',
    goalAmount: '25,000',
    token: 'USDC',
    sponsorCount: 14,
    collaboratorCount: 3,
    status: 'SUCCESS',
    description: 'Successfully installed 8 of the 12 planned solar-powered water filtration wells, bringing clean water to over 5,000 people.',
    coverImageUrl: '/images/success-stories/water-wells.jpg',
    creatorInterview: {
      id: 'int-002',
      quote: 'The community support was overwhelming. We were able to scale our initial plan and now villages have access to safe drinking water.',
      author: 'David Ochieng',
      role: 'Project Director, Water for All',
      avatarUrl: '/images/avatars/david.jpg',
    },
    backerTestimonials: [
      {
        id: 'test-003',
        author: 'Alice Brown',
        content: 'I’m proud to support a campaign that delivered tangible results. The photos and stories from the field were heartwarming.',
        rating: 5,
      },
    ],
  },
];

export async function GET() {
  return NextResponse.json(successStories);
}