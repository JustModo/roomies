import { Application, Signal } from "libopus-wasm";
import type {
  Application as OpusApplication,
  Signal as OpusSignal,
} from "libopus-wasm";

export interface VoiceConfig {
  sampleRate: 48000;
  channels: 1;
  frameSize: number;
  captureWarmupFrames: number;
  preprocessor: {
    dcBlockerR: number;
  };
  playback: {
    jitterLookaheadSeconds: number;
    gainRampSeconds: number;
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
  captureWarmupFrames: 0,

  preprocessor: {
    dcBlockerR: 0.995,
  },

  playback: {
    jitterLookaheadSeconds: 0.12,
    gainRampSeconds: 0.005,
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
