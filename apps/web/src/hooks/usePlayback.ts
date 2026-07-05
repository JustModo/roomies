import { useState, useEffect } from 'react';
import { fetchApi } from '../api/client';

/**
 * Hook to fetch the current party state.
 *
 * Note: The old `useTranscodeStatus` hook (which polled /api/transcoding/:partyId/status)
 * is removed. With live transcoding, the HLS URL is returned directly from
 * POST /api/playback/start and the client can start playing immediately —
 * no polling needed.
 */
export function usePartyState(partyId: string | undefined) {
  const [partyState, setPartyState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partyId) return;

    const fetchState = async () => {
      try {
        const data = await fetchApi(`/playback/${partyId}`);
        setPartyState(data);
      } catch (err: any) {
        setError(err.message);
      }
    };

    fetchState();
    
    // In a real implementation, we would connect to the websocket here to get live playback updates.
    // For now we just fetch initial state.
    
  }, [partyId]);

  return { partyState, error };
}
