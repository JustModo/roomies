import { Application, Signal } from 'libopus-wasm';
import type { Application as OpusApplication, Signal as OpusSignal } from 'libopus-wasm';
import type { JitterBufferOptions } from './audio/JitterBuffer';

export interface VoiceConfig {
  sampleRate: 48000;
  channels: 1;
  frameSize: number;
  preprocessor: {
    dcBlockerR: number;
  };
  playback: {
    gainRampSeconds: number;
    scheduleAheadSeconds: number;
    tickMs: number;
    jitter: JitterBufferOptions;
  };
  opus: {
    application: OpusApplication;
    bitrate: number;
    complexity: number;
    vbr: boolean;
    dtx: boolean;
    fec: boolean;
    packetLossPercent: number;
    signal: OpusSignal;
  };
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  sampleRate: 48000,
  channels: 1,
  frameSize: 960,

  preprocessor: {
    dcBlockerR: 0.995,
  },

  playback: {
    gainRampSeconds: 0.1,
    scheduleAheadSeconds: 0.04,
    tickMs: 10,
    jitter: {
      targetDepthFrames: 3,
      maxDepthFrames: 6,
      maxConcealFrames: 5,
    },
  },

  opus: {
    application: Application.Voip,
    bitrate: 24000,
    complexity: 10,
    vbr: true,
    dtx: true,
    fec: true,
    packetLossPercent: 5,
    signal: Signal.Voice,
  },
};
