export interface ScannedEpisode {
  path: string;
  title: string;
  number: number | null;
}

export interface ScannedMedia {
  path: string;
  name: string;
  type: 'movie' | 'show';
  episodes: ScannedEpisode[];
}
