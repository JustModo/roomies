import { APIRequestContext } from '@playwright/test';
import { API_BASE, authHeaders } from './auth';

const MOVIE_FILENAME = 'movie.mp4';

export interface StartedMedia {
  mediaFileId: string;
  title: string;
  hlsUrl: string;
}

function findMovieMediaFileId(library: any): { mediaFileId: string; title: string } | null {
  const libraries = Array.isArray(library) ? library : [library];
  for (const lib of libraries) {
    for (const movie of lib.movies ?? []) {
      const files = movie.mediaFiles ?? [];
      const match =
        files.find((file: any) => String(file.path ?? '').includes(MOVIE_FILENAME)) ?? files[0];
      if (match?.id) {
        return { mediaFileId: match.id, title: movie.name ?? 'Movie' };
      }
    }
  }
  return null;
}

export async function scanLibrary(request: APIRequestContext, adminToken: string) {
  const res = await request.post(`${API_BASE}/api/library/scan`, {
    headers: await authHeaders(adminToken),
    data: {},
  });
  if (!res.ok()) {
    throw new Error(`Library scan failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function getLibraries(request: APIRequestContext, adminToken: string) {
  const res = await request.get(`${API_BASE}/api/library`, {
    headers: await authHeaders(adminToken),
  });
  if (!res.ok()) {
    throw new Error(`Get library failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function ensureMovieMedia(
  request: APIRequestContext,
  adminToken: string,
): Promise<{ mediaFileId: string; title: string }> {
  let libraries = await getLibraries(request, adminToken);
  let found = findMovieMediaFileId(libraries);

  if (!found) {
    await scanLibrary(request, adminToken);
    libraries = await getLibraries(request, adminToken);
    found = findMovieMediaFileId(libraries);
  }

  if (!found) {
    throw new Error(
      `Could not find ${MOVIE_FILENAME} in library. Ensure MEDIA_ROOT points at packages/test/.e2e/media`,
    );
  }
  return found;
}

export async function startMedia(
  request: APIRequestContext,
  adminToken: string,
  mediaFileId?: string,
): Promise<StartedMedia> {
  const media = mediaFileId
    ? { mediaFileId, title: 'Movie' }
    : await ensureMovieMedia(request, adminToken);

  const res = await request.post(`${API_BASE}/api/playback/change-media`, {
    headers: await authHeaders(adminToken),
    data: { mediaFileId: media.mediaFileId },
  });
  if (!res.ok()) {
    throw new Error(`change-media failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return {
    mediaFileId: body.mediaFileId ?? media.mediaFileId,
    title: body.title ?? media.title,
    hlsUrl: body.hlsUrl,
  };
}

export async function stopMedia(request: APIRequestContext, adminToken: string) {
  await request.post(`${API_BASE}/api/playback/stop`, {
    headers: await authHeaders(adminToken),
  });
}
