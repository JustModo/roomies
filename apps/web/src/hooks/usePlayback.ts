import { useState, useEffect } from 'react';
import { fetchApi } from '../api/client';
import { TranscodeStatusResponse } from '@roomies/contracts';

export function useTranscodeStatus(partyId: string | undefined) {
  const [statusResponse, setStatusResponse] = useState<TranscodeStatusResponse>({ status: 'pending' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partyId) return;

    let intervalId: any;

    const checkStatus = async () => {
      try {
        const data: TranscodeStatusResponse = await fetchApi(`/transcoding/${partyId}/status`);
        setStatusResponse(data);

        // If ready or failed, stop polling
        if (data.status === 'ready' || data.status === 'failed') {
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setError(err.message);
        clearInterval(intervalId);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 2 seconds
    intervalId = setInterval(checkStatus, 2000);

    return () => clearInterval(intervalId);
  }, [partyId]);

  return { statusResponse, error };
}

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
