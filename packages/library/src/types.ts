export interface ScannedEpisode {
  path: string;
  title: string;
  number: number | null;
  subtitlePath: string | null;
}

export interface ScannedMovie {
  path: string;
  name: string;
  type: 'movie' | 'show';
  coverPath: string | null;
  episodes: ScannedEpisode[];
}
