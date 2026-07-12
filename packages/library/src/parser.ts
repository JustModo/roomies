import path from 'path';

export interface ParsedEpisode {
  season: number | null;
  episode: number | null;
  title: string;
  sortNumber: number | null;
}

export const parseEpisodeFilename = (filename: string): ParsedEpisode => {
  const base = path.basename(filename, path.extname(filename));
  const lowerBase = base.toLowerCase();

  // 1. Match S01E01, S01E01E02, S01E01-E02, S1E1, etc.
  const sxeMatch = lowerBase.match(/s(\d+)\s*e(\d+)(?:[-e]\d+)?/i);
  if (sxeMatch) {
    const season = parseInt(sxeMatch[1], 10);
    const episode = parseInt(sxeMatch[2], 10);
    return {
      season,
      episode,
      title: `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`,
      sortNumber: season * 10000 + episode,
    };
  }

  // 2. Match 1x01 (season 1, episode 1)
  const xMatch = lowerBase.match(/(?:^|\s|[\[\(])(\d+)x(\d+)(?:\s|[\]\)]|$)/i);
  if (xMatch) {
    const season = parseInt(xMatch[1], 10);
    const episode = parseInt(xMatch[2], 10);
    return {
      season,
      episode,
      title: `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`,
      sortNumber: season * 10000 + episode,
    };
  }

  // 3. Match Episode 01 or E01
  const epMatch = lowerBase.match(/(?:ep(?:isode)?|e)[\s\._-]*(\d+)/i);
  if (epMatch) {
    const episode = parseInt(epMatch[1], 10);
    return {
      season: null,
      episode,
      title: `Episode ${episode}`,
      sortNumber: episode,
    };
  }

  // 4. Try absolute anime numbering like "Show - 1098", "Show - 01"
  const animeMatch = base.match(/-\s*0*(\d{1,4})(?:\s|-|$|v\d)/i);
  if (animeMatch) {
    const episode = parseInt(animeMatch[1], 10);
    return {
      season: null,
      episode,
      title: `Episode ${episode}`,
      sortNumber: episode,
    };
  }

  // 5. Try leading 101 format (3+ digits often means season + episode, e.g. 101 -> S1E1, 1205 -> S12E5)
  // Only if standalone to avoid matching 1080p etc.
  const joinedMatch = lowerBase.match(/(?:^|\s|[\[\(-])([1-9]\d{2,3})(?:\s|[\]\)-]|$)/);
  if (joinedMatch) {
    const numStr = joinedMatch[1];
    // Avoid common resolutions/years
    if (!['1080', '2160', '720'].includes(numStr) && !(parseInt(numStr) > 1900 && parseInt(numStr) < 2100)) {
      const season = parseInt(numStr.length === 3 ? numStr.substring(0, 1) : numStr.substring(0, 2), 10);
      const episode = parseInt(numStr.substring(numStr.length - 2), 10);
      return {
        season,
        episode,
        title: `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`,
        sortNumber: season * 10000 + episode,
      };
    }
  }

  // 6. Just grab the first standalone number if nothing else matches
  const fallbackNum = lowerBase.match(/(?:^|\s)0*(\d+)(?:\s|$)/);
  if (fallbackNum) {
    const episode = parseInt(fallbackNum[1], 10);
    return {
      season: null,
      episode,
      title: `Episode ${episode}`,
      sortNumber: episode,
    };
  }

  // Unparsed fallback
  return {
    season: null,
    episode: null,
    title: base,
    sortNumber: null,
  };
};
