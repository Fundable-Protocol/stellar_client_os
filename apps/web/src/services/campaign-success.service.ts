// apps/web/src/services/campaign-success-service.ts

export interface BackerTestimonial {
  id: string;
  author: string;
  role?: string;
  content: string;
  rating?: number; // optional
}

export interface CreatorInterview {
  id: string;
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
}

export interface SuccessStory {
  id: string;
  campaignId: string;
  title: string;
  category: string;
  raisedAmount: string;
  goalAmount: string;
  token: string;
  sponsorCount: number;
  collaboratorCount: number;
  status: 'COMPLETED' | 'SUCCESS';
  description: string;
  coverImageUrl?: string;
  creatorInterview: CreatorInterview;
  backerTestimonials: BackerTestimonial[];
}

const API_BASE = '/api/campaigns';

export async function getSuccessStories(): Promise<SuccessStory[]> {
  try {
    const response = await fetch(`${API_BASE}/success-stories`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch success stories: ${response.status}`);
    }

    const data = await response.json();
    return data as SuccessStory[];
  } catch (error) {
    console.error('Error fetching success stories:', error);
    throw error;
  }
}