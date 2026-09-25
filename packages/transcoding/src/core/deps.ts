import type { Logger } from '@roomies/config';
import type { TranscodeOptions } from '../config/options';
import type { EncoderBackend } from '../ffmpeg/hwaccel';

/** Counts live FFmpeg processes against the server-wide cap. */
export class WorkerSlots {
  private live = 0;

  constructor(readonly max: number) {}

  get count(): number {
    return this.live;
  }

  get isFull(): boolean {
    return this.live >= this.max;
  }

  acquire(): void {
    this.live++;
  }

  release(): void {
    this.live--;
  }
}

/** Collaborators shared by every session and worker a TranscodeSessionManager creates. */
export interface TranscodeDeps {
  readonly options: TranscodeOptions;
  readonly encoder: EncoderBackend;
  readonly slots: WorkerSlots;
  readonly log: Logger;
}
