import { describe, it, expect } from 'vitest';
import { displaySubtitleLabel, isExternalSubtitle, sortSubtitles } from '@roomies/web/src/lib/subtitleLabels';

describe('subtitle labels', () => {
  it('names languages and external tracks', () => {
    expect(displaySubtitleLabel('en')).toBe('English');
    expect(displaySubtitleLabel(null)).toBe('External');
    expect(displaySubtitleLabel('external:fr')).toBe('French External');
    expect(isExternalSubtitle('External:de')).toBe(true);
    expect(isExternalSubtitle('de')).toBe(false);
  });

  it('sorts external tracks first, then by label', () => {
    const sorted = sortSubtitles([{ language: 'fr' }, { language: 'external:en' }, { language: 'de' }]);
    expect(sorted.map((s) => s.language)).toEqual(['external:en', 'fr', 'de']);
  });
});
