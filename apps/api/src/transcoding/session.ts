import fs from 'fs';
import path from 'path';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { RESOLUTION_PRESETS, HLS_BASE_URL } from './config';

/**
 * Manages all transcoding variants for a single media file.
 *
 * Variants are created on-demand: when a client requests a specific resolution,
 * the session either returns an existing (cached) variant or spawns a new one.
 * The master playlist is regenerated each time a variant is added.
 */
export class TranscodeSession {
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;

  private variants = new Map<Resolution, TranscodeVariant>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;

  constructor(mediaFileId: string, inputPath: string, outputBaseDir: string) {
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;

    // Ensure the base output directory exists
    fs.mkdirSync(this.outputBaseDir, { recursive: true });
  }

  /**
   * Returns the HLS URL for the master playlist.
   */
  get masterPlaylistUrl(): string {
    return `${HLS_BASE_URL}/${this.mediaFileId}/master.m3u8`;
  }

  /**
   * Registers an error callback for variant failures.
   */
  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Ensures a variant for the given resolution exists and is running.
   * If the variant already exists (running or has cached segments), it is reused.
   * Otherwise, a new FFmpeg process is spawned.
   *
   * Returns the HLS URL for the variant's stream playlist.
   */
  ensureVariant(resolution: Resolution): string {
    const existing = this.variants.get(resolution);
    if (existing) {
      // Variant already exists — reuse it (cache hit)
      return this.getVariantUrl(resolution);
    }

    // Check if cached segments exist on disk from a previous run
    const variantDir = path.join(this.outputBaseDir, resolution);
    const variant = new TranscodeVariant(resolution, variantDir);

    variant.on('ready', () => {
      console.log(`[session:${this.mediaFileId}] Variant ${resolution} ready (first segment available)`);
    });

    variant.on('error', (err: Error) => {
      console.error(`[session:${this.mediaFileId}] Variant ${resolution} error:`, err.message);
      if (this.onErrorCallback) {
        this.onErrorCallback(resolution, err);
      }
    });

    variant.on('exit', (code: number | null) => {
      if (code === 0) {
        console.log(`[session:${this.mediaFileId}] Variant ${resolution} completed successfully`);
      }
    });

    this.variants.set(resolution, variant);

    // Start the FFmpeg process (non-blocking)
    variant.start(this.inputPath);

    // Regenerate the master playlist to include this new variant
    this.writeMasterPlaylist();

    return this.getVariantUrl(resolution);
  }

  /**
   * Returns the list of currently active resolutions.
   */
  getActiveResolutions(): Resolution[] {
    return Array.from(this.variants.keys());
  }

  /**
   * Checks if a specific variant has cached segments ready.
   */
  isVariantReady(resolution: Resolution): boolean {
    return this.variants.get(resolution)?.isReady ?? false;
  }

  /**
   * Stops all running FFmpeg processes and cleans up.
   */
  stop(): void {
    for (const [resolution, variant] of this.variants) {
      console.log(`[session:${this.mediaFileId}] Stopping variant ${resolution}`);
      variant.stop();
    }
    this.variants.clear();
  }

  /**
   * Writes the master.m3u8 playlist listing all active variants.
   * Caddy serves this file statically from the cache directory.
   */
  private writeMasterPlaylist(): void {
    const lines: string[] = ['#EXTM3U'];

    for (const [resolution, variant] of this.variants) {
      const preset = RESOLUTION_PRESETS[resolution];
      const bandwidth = parseInt(preset.videoBitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;

      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${resolution}"`,
        `${resolution}/stream.m3u8`
      );
    }

    const masterPath = path.join(this.outputBaseDir, 'master.m3u8');
    fs.writeFileSync(masterPath, lines.join('\n') + '\n');
  }

  private getVariantUrl(resolution: Resolution): string {
    return `${HLS_BASE_URL}/${this.mediaFileId}/${resolution}/stream.m3u8`;
  }
}
