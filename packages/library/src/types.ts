export interface ScannedEpisode {
  path: string;
  number: number | null;
  subtitlePaths: string[];
}

export interface ScannedSeason {
  path: string;
  name: string;
  number: number | null;
  episodes: ScannedEpisode[];
}

export interface ScannedTitle {
  path: string;
  name: string;
  type: 'movie' | 'show';
  coverPath: string | null;
  seasons: ScannedSeason[];
}
