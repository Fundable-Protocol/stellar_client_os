import { useCallback, useState } from 'react';
import { extractExif, type ExifSummary } from '@/lib/exif';

export type ExifPreviewStatus = 'idle' | 'loading' | 'success' | 'error';

export function useExifPreview() {
  const [status, setStatus] = useState<ExifPreviewStatus>('idle');
  const [data, setData] = useState<ExifSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (file: File) => {
    setStatus('loading');
    setError(null);
    try {
      const result = await extractExif(file);
      setData(result);
      setStatus('success');
    } catch {
      setError('Could not read file metadata.');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setData(null);
    setError(null);
  }, []);

  return { status, data, error, analyze, reset };
}
