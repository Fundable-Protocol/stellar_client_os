/**
 * Creator Portfolio API Endpoint
 * 
 * GET /api/creators/[address]/portfolio
 * - Retrieves complete creator portfolio data with stats
 * 
 * POST /api/creators/[address]/portfolio
 * - Updates creator portfolio information (requires authentication)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCreatorPortfolioProfile, updateCreatorPortfolio } from '@/services/creator-portfolio.service';
import { UpdatePortfolioInput } from '@/types/creator-portfolio';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address || address.length < 10) {
      return NextResponse.json(
        { error: 'Invalid creator address' },
        { status: 400 }
      );
    }

    const profile = await getCreatorPortfolioProfile(address);

    return NextResponse.json(profile, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching creator portfolio:', error);
    return NextResponse.json(
      { error: 'Failed to fetch creator portfolio' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address || address.length < 10) {
      return NextResponse.json(
        { error: 'Invalid creator address' },
        { status: 400 }
      );
    }

    // TODO: Add authentication check to verify the user is updating their own profile
    // const session = await getSession();
    // if (!session || session.address !== address) {
    //   return NextResponse.json(
    //     { error: 'Unauthorized' },
    //     { status: 401 }
    //   );
    // }

    const body: UpdatePortfolioInput = await request.json();

    // Validate input
    if (body.bio && body.bio.length > 500) {
      return NextResponse.json(
        { error: 'Bio must be 500 characters or less' },
        { status: 400 }
      );
    }

    if (body.socialLinks && body.socialLinks.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 social links allowed' },
        { status: 400 }
      );
    }

    const updated = await updateCreatorPortfolio(address, body);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating creator portfolio:', error);
    return NextResponse.json(
      { error: 'Failed to update creator portfolio' },
      { status: 500 }
    );
  }
}
