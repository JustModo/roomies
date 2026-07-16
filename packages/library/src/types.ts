export interface ScannedSubtitle {
  path: string;
  language: string | null;
}

export interface ScannedEpisode {
  path: string;
  title: string;
  number: number | null;
  subtitles: ScannedSubtitle[];
}

export interface ScannedMovie {
  path: string;
  name: string;
  type: 'movie' | 'show';
  episodes: ScannedEpisode[];
}
