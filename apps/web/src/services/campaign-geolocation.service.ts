/**
 * Campaign Geolocation Service
 *
 * Maps real-world planting sites with coordinates, species data, and GeoJSON export (Issue #853).
 */

export interface PlantingSite {
  id: string;
  campaignId: number;
  latitude: number;
  longitude: number;
  region: string;
  species: string[];
  treesPlanted: number;
  plantedAt: Date;
  verificationStatus: 'verified' | 'pending' | 'rejected';
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    id: string;
    campaignId: number;
    region: string;
    species: string[];
    treesPlanted: number;
    status: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export class CampaignGeolocationService {
  /**
   * Filter planting sites within a bounding box.
   */
  static getSitesInBounds(
    sites: PlantingSite[],
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): PlantingSite[] {
    return sites.filter(
      (s) =>
        s.latitude >= minLat &&
        s.latitude <= maxLat &&
        s.longitude >= minLng &&
        s.longitude <= maxLng
    );
  }

  /**
   * Convert planting sites to standard GeoJSON FeatureCollection for interactive maps.
   */
  static toGeoJSON(sites: PlantingSite[]): GeoJSONFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: sites.map((s) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.longitude, s.latitude],
        },
        properties: {
          id: s.id,
          campaignId: s.campaignId,
          region: s.region,
          species: s.species,
          treesPlanted: s.treesPlanted,
          status: s.verificationStatus,
        },
      })),
    };
  }

  /**
   * Calculate total trees planted across a geographic region.
   */
  static calculateRegionalTotal(sites: PlantingSite[], region: string): number {
    return sites
      .filter((s) => s.region.toLowerCase() === region.toLowerCase())
      .reduce((acc, s) => acc + s.treesPlanted, 0);
  }
}
