import { createDecoder } from 'libopus-wasm';
import type { OpusDecoderHandle } from 'libopus-wasm';
import type { VoiceConfig } from '../config';

export class PeerPlayer {
    private readonly ctx: AudioContext;
    private readonly gainNode: GainNode;
    private readonly decoder: Promise<OpusDecoderHandle>;
    private readonly config: VoiceConfig;
    private nextPlayTime = 0;
    private destroyed = false;
    // Serializes all decoder access so a destroy() can never free the wasm
    // handle while a scheduleChunk() call is still mid-decode with it.
    private opQueue: Promise<void> = Promise.resolve();

    constructor(ctx: AudioContext, config: VoiceConfig) {
        this.ctx = ctx;
        this.config = config;
        this.gainNode = ctx.createGain();
        this.gainNode.connect(ctx.destination);
        this.decoder = createDecoder({
            channels: config.channels,
            sampleRate: config.sampleRate,
        });
    }

    setVolume(volume: number): void {
        this.gainNode.gain.setTargetAtTime(
            Math.max(0, Math.min(1, volume / 100)),
            this.ctx.currentTime,
            this.config.playback.gainRampSeconds
        );
    }

    setMuted(muted: boolean): void {
        this.gainNode.gain.setTargetAtTime(
            muted ? 0 : 1,
            this.ctx.currentTime,
            this.config.playback.gainRampSeconds
        );
    }

    async scheduleChunk(packet: Uint8Array): Promise<void> {
        this.opQueue = this.opQueue.then(async () => {
            if (this.destroyed) return;
            const dec = await this.decoder;
            if (this.destroyed) return;
            try {
                const rawFloats = dec.decodeFloat(packet);
                if (!rawFloats || rawFloats.length === 0) return;

                const floats = new Float32Array(rawFloats);
                const buffer = this.ctx.createBuffer(
                    this.config.channels,
                    floats.length,
                    this.config.sampleRate
                );
                buffer.copyToChannel(floats, 0);

                const src = this.ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(this.gainNode);

                const now = this.ctx.currentTime;
                const scheduleAt = Math.max(now + this.config.playback.jitterLookaheadSeconds, this.nextPlayTime);
                src.start(scheduleAt);
                this.nextPlayTime = scheduleAt + buffer.duration;
            } catch (e) {
                console.warn('[PeerPlayer] Decode/schedule error:', e);
            }
        });
        return this.opQueue;
    }

    async destroy(): Promise<void> {
        this.opQueue = this.opQueue.then(async () => {
            if (this.destroyed) return;
            this.destroyed = true;
            const dec = await this.decoder;
            dec.free();
            this.gainNode.disconnect();
        });
        return this.opQueue;
    }
}
