import { Application, Signal } from 'libopus-wasm';
import type { Application as OpusApplication, Signal as OpusSignal } from 'libopus-wasm';

export interface VoiceConfig {
    sampleRate: 48000;
    channels: 1;
    frameSize: number;
    captureWarmupFrames: number;
    vad: {
        rmsThreshold: number;
        startFrames: number;
        hangoverFrames: number;
    };
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
    captureWarmupFrames: 10,
    vad: {
        rmsThreshold: 0.008,
        startFrames: 2,
        hangoverFrames: 12,
    },
    preprocessor: {
        dcBlockerR: 0.995,
    },
    playback: {
        jitterLookaheadSeconds: 0.08,
        gainRampSeconds: 0.01,
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
