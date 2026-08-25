/** Master playlist URL for a media file + session (sync|async). */
export const getMasterPlaylistUrl = (mediaFileId: string, sessionId: string = 'sync') =>
  `/api/playback/hls/${mediaFileId}/${sessionId}/master.m3u8`;
