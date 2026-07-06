import fs from 'fs/promises';
import path from 'path';
import { TranscodeProfile } from './profiles';

export const PlaylistGenerator = {
  /**
   * Write the HLS master playlist that references all quality variants.
   *
   * Example output:
   * ```
   * #EXTM3U
   * #EXT-X-VERSION:3
   * #EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,NAME="360p"
   * 360p/playlist.m3u8
   * #EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1280x720,NAME="720p"
   * 720p/playlist.m3u8
   * #EXT-X-STREAM-INF:BANDWIDTH=6200000,RESOLUTION=1920x1080,NAME="1080p"
   * 1080p/playlist.m3u8
   * ```
   */
  async writeMasterPlaylist(
    outputDir: string,
    profiles: TranscodeProfile[],
  ): Promise<void> {
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

    for (const p of profiles) {
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${p.width}x${p.height},NAME="${p.name}"`,
        `${p.name}/playlist.m3u8`,
      );
    }

    lines.push(''); // trailing newline
    await fs.writeFile(path.join(outputDir, 'master.m3u8'), lines.join('\n'));
  },

  /**
   * Generates the URL for the master playlist.
   */
  generateUrl(sessionId: string): string {
    const hlsBaseUrl = process.env.HLS_BASE_URL || 'http://localhost:80/hls';
    // The session ID is used as the directory name for the session.
    return `${hlsBaseUrl}/${sessionId}/master.m3u8`;
  }
};
