import fs from 'fs';
import path from 'path';
import { prisma } from '../database/sqlite';
import {
  TranscodeSessionManager,
  HLS_BASE_URL,
  CACHE_DIR,
  AudioTrackDescriptor,
} from '@roomies/transcoding';
import { getMasterPlaylistUrl } from './urls';
import type { SubtitleTrack, AudioTrackInfo } from '@roomies/contracts';

export { getMasterPlaylistUrl } from './urls';

/** Ensure a TranscodeSession exists for playlist/seek paths (loads audio track descriptors). */
export async function ensurePlaybackSession(sessionId: string, mediaFileId: string) {
  const existing = TranscodeSessionManager.getSession(sessionId);
  if (existing) {
    if (existing.mediaFileId !== mediaFileId) {
      throw new Error('Session media mismatch');
    }
    return existing;
  }

  const mediaFile = await prisma.mediaFile.findUnique({
    where: { id: mediaFileId },
    include: { audioTracks: { orderBy: { streamIndex: 'asc' } } },
  });
  if (!mediaFile) throw new Error('Media file not found');

  const audioTrackDescriptors: AudioTrackDescriptor[] = mediaFile.audioTracks.map((a) => ({
    id: a.id,
    streamIndex: a.streamIndex,
  }));

  return TranscodeSessionManager.startSession(sessionId, mediaFileId, mediaFile.path, audioTrackDescriptors);
}

/** Rewrite relative HLS segment lines to absolute Caddy/cache URLs. */
export function rewritePlaylistSegmentUrls(content: string, outputDir: string): string {
  const relativeDir = path.relative(CACHE_DIR, outputDir);
  const baseUrl = `${HLS_BASE_URL}/${relativeDir}/`;
  return content.replace(/^(?!#)(.+)$/gm, `${baseUrl}$1`);
}

/** Read an on-disk HLS playlist and rewrite segment URIs for HTTP serving. */
export async function serveHlsPlaylist(outputDir: string, playlistFileName: string): Promise<string> {
  const playlistPath = path.join(outputDir, playlistFileName);
  const content = await fs.promises.readFile(playlistPath, 'utf8');
  return rewritePlaylistSegmentUrls(content, outputDir);
}

export interface MediaChangedInput {
  mediaFileId: string;
  title: string;
  duration: number;
  sessionId?: 'sync' | 'async';
  sessionScope?: 'room' | 'user';
  transcodeOffset?: number;
  subtitles?: SubtitleTrack[];
  audioTracks?: AudioTrackInfo[];
}

/** Shared media.changed payload builder — always includes audioTracks (may be empty). */
export function buildMediaChangedPayload(input: MediaChangedInput) {
  const sessionId = input.sessionId ?? (input.sessionScope === 'user' ? 'async' : 'sync');
  return {
    mediaFileId: input.mediaFileId,
    title: input.title,
    hlsUrl: input.mediaFileId ? getMasterPlaylistUrl(input.mediaFileId, sessionId) : '',
    duration: input.duration,
    ...(input.transcodeOffset !== undefined ? { transcodeOffset: input.transcodeOffset } : {}),
    ...(input.sessionScope !== undefined ? { sessionScope: input.sessionScope } : {}),
    subtitles: input.subtitles ?? [],
    audioTracks: input.audioTracks ?? [],
  };
}
