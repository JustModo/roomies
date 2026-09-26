import { createContext, useContext, useState, ReactNode } from 'react';
import type { AudioRelay } from '@roomies/voice';
import { ApiClient, createApiClient } from '../services/api';
import { AppStorage, createStorage } from '../services/storage';
import { MediaCaps, detectCaps } from '../services/media';
import { OpenSocket, openSocket } from '../services/socket';

export interface Services {
  api: ApiClient;
  storage: AppStorage;
  session: AppStorage;
  media: MediaCaps;
  openSocket: OpenSocket;
  createAudioRelay: () => Promise<AudioRelay>;
}

export const createServices = (): Services => ({
  api: createApiClient(),
  storage: createStorage(globalThis.localStorage),
  session: createStorage(globalThis.sessionStorage),
  media: detectCaps(),
  openSocket,
  createAudioRelay: () => import('@roomies/voice').then(({ AudioRelay }) => new AudioRelay()),
});

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value?: Services; children: ReactNode }) {
  const [services] = useState(() => value ?? createServices());
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used within a ServicesProvider');
  return services;
}
