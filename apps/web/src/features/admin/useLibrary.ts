import { useState, useEffect, useCallback } from 'react';
import { Movie, Library } from '@roomies/contracts';
import { useServices } from '../../app/ServicesProvider';

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

export function useLibrary() {
  const { api } = useServices();
  const [library, setLibrary] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.request<Library[]>('/library/');
      setLibrary(data.flatMap((lib) => lib.movies || []));
    } catch (err) {
      setError(messageOf(err, 'Failed to load library'));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const scanLibrary = useCallback(async () => {
    try {
      setIsScanning(true);
      await api.request('/library/scan', { method: 'POST', body: {} });
      await fetchLibrary();
    } catch (err) {
      setError(messageOf(err, 'Failed to scan library'));
    } finally {
      setIsScanning(false);
    }
  }, [api, fetchLibrary]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  return { library, setLibrary, isLoading, error, isScanning, scanLibrary };
}
