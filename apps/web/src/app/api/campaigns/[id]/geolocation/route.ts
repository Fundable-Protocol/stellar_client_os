import { NextRequest, NextResponse } from 'next/server';
import { CampaignGeolocationService, PlantingSite } from '@/services/campaign-geolocation.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = parseInt(params.id, 10);
    const mockSites: PlantingSite[] = [
      {
        id: 'site-1',
        campaignId,
        latitude: -1.2921,
        longitude: 36.8219,
        region: 'Nairobi Reforestation Zone',
        species: ['Acacia', 'Baobab'],
        treesPlanted: 1500,
        plantedAt: new Date('2026-05-01'),
        verificationStatus: 'verified',
      }
    ];

    const geoJson = CampaignGeolocationService.toGeoJSON(mockSites);
    return NextResponse.json(geoJson, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve campaign geolocation data' },
      { status: 500 }
    );
  }
}
