import { describe, it, expect } from 'vitest';
import { CampaignGeolocationService, PlantingSite } from './campaign-geolocation.service';

describe('CampaignGeolocationService', () => {
  const sites: PlantingSite[] = [
    {
      id: 'site-1',
      campaignId: 853,
      latitude: 0.5,
      longitude: 32.5,
      region: 'East Africa',
      species: ['Acacia', 'Moringa'],
      treesPlanted: 1000,
      plantedAt: new Date('2026-03-01'),
      verificationStatus: 'verified',
    },
    {
      id: 'site-2',
      campaignId: 853,
      latitude: -3.2,
      longitude: -60.0,
      region: 'Amazon Basin',
      species: ['Cedar', 'Mahogany'],
      treesPlanted: 2500,
      plantedAt: new Date('2026-04-15'),
      verificationStatus: 'verified',
    },
  ];

  it('filters sites within geographic bounding box', () => {
    const eastAfricaSites = CampaignGeolocationService.getSitesInBounds(sites, 0.0, 1.0, 32.0, 33.0);
    expect(eastAfricaSites.length).toBe(1);
    expect(eastAfricaSites[0].id).toBe('site-1');
  });

  it('transforms planting sites to valid GeoJSON FeatureCollection', () => {
    const geoJson = CampaignGeolocationService.toGeoJSON(sites);
    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features.length).toBe(2);
    expect(geoJson.features[0].geometry.coordinates).toEqual([32.5, 0.5]);
    expect(geoJson.features[0].properties.treesPlanted).toBe(1000);
  });

  it('calculates regional tree totals accurately', () => {
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'East Africa')).toBe(1000);
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'Amazon Basin')).toBe(2500);
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'Asia')).toBe(0);
  });
});
