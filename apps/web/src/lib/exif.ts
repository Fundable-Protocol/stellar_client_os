import exifr from 'exifr';

export interface ExifSummary {
  gps: { latitude: number; longitude: number } | null;
  timestamp: string | null;
  device: { make: string | null; model: string | null };
}

export async function extractExif(file: File): Promise<ExifSummary> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      pick: ['Make', 'Model', 'DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude'],
    });

    if (!data) {
      return { gps: null, timestamp: null, device: { make: null, model: null } };
    }

    return {
      gps:
        data.latitude && data.longitude
          ? { latitude: data.latitude, longitude: data.longitude }
          : null,
      timestamp: (data.DateTimeOriginal ?? data.CreateDate)?.toISOString?.() ?? null,
      device: { make: data.Make ?? null, model: data.Model ?? null },
    };
  } catch {
    return { gps: null, timestamp: null, device: { make: null, model: null } };
  }
}
