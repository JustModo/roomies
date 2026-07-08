import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../api/client';
import { MediaFile } from '@roomies/contracts';

export function useLibrary() {
  const [library, setLibrary] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi('/library/');
      const allFiles = data.flatMap((lib: any) => lib.mediaFiles);
      setLibrary(allFiles);
    } catch (err: any) {
      setError(err.message || 'Failed to load library');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanLibrary = async () => {
    try {
      setIsScanning(true);
      await fetchApi('/library/scan', { 
        method: 'POST', 
        body: { name: 'Main Library', path: '/media' }
      });
      await fetchLibrary();
    } catch (err: any) {
      setError(err.message || 'Failed to scan library');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  return {
    library,
    isLoading,
    error,
    isScanning,
    scanLibrary,
    refreshLibrary: fetchLibrary
  };
}
