import fs from 'fs';
import path from 'path';
import type { AudioTrackInfo, SubtitleTrack } from '@roomies/contracts';
import { HLS_BASE_URL } from '@roomies/transcoding';
import type { RoomState } from '../room/store';

/** Discriminated union identifying who a playback session belongs to. */
export type SessionScope = { type: 'room' } | { type: 'user'; userId: string };

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

/** Convert a SessionScope to the string key used by TranscodeSessionManager. */
export const sessionScopeToId = (scope: SessionScope): 'sync' | 'async' => (scope.type === 'room' ? 'sync' : 'async');

/** Master playlist URL for a media file + session (sync|async). */
export const getMasterPlaylistUrl = (mediaFileId: string, sessionId: string = 'sync') =>
  `/api/playback/hls/${mediaFileId}/${sessionId}/master.m3u8`;

/** Rewrite relative HLS segment lines to absolute Caddy/cache URLs. */
export function rewritePlaylistSegmentUrls(content: string, outputDir: string, cacheDir: string): string {
  const baseUrl = `${HLS_BASE_URL}/${path.relative(cacheDir, outputDir)}/`;
  return content.replace(/^(?!#)(.+)$/gm, `${baseUrl}$1`);
}

/** Read an on-disk HLS playlist and rewrite segment URIs for HTTP serving. */
export async function serveHlsPlaylist(outputDir: string, playlistFileName: string, cacheDir: string): Promise<string> {
  const content = await fs.promises.readFile(path.join(outputDir, playlistFileName), 'utf8');
  return rewritePlaylistSegmentUrls(content, outputDir, cacheDir);
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

/** media.changed payload pointing a client at the room's current media in the given scope. */
export const mediaChangedFor = (state: Readonly<RoomState>, sessionScope: 'room' | 'user', transcodeOffset: number) =>
  buildMediaChangedPayload({
    mediaFileId: state.mediaId,
    title: state.mediaTitle || 'Unknown Media',
    duration: state.duration,
    transcodeOffset,
    sessionScope,
    subtitles: state.subtitles,
    audioTracks: state.audioTracks,
  });
