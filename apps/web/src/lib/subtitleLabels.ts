const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function languageName(code: string): string {
  try {
    return capitalize(new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code);
  } catch {
    return capitalize(code);
  }
}

export const isExternalSubtitle = (language: string | null) => {
  const lower = language?.toLowerCase() ?? '';
  return lower === 'external' || lower.startsWith('external:');
};

export function displaySubtitleLabel(language: string | null): string {
  if (!language || language.toLowerCase() === 'external') return 'External';
  if (language.toLowerCase().startsWith('external:')) {
    const name = language.slice(9).trim();
    return name ? `${languageName(name)} External` : 'External';
  }
  return languageName(language.trim());
}

export function sortSubtitles<T extends { language: string | null }>(subtitles: T[]): T[] {
  return [...subtitles].sort((a, b) => {
    const external = Number(isExternalSubtitle(b.language)) - Number(isExternalSubtitle(a.language));
    return external || displaySubtitleLabel(a.language).localeCompare(displaySubtitleLabel(b.language));
  });
}
