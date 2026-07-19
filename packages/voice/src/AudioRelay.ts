import { createEncoder, createDecoder, Application, Signal } from 'libopus-wasm';
import type { OpusEncoderHandle, OpusDecoderHandle } from 'libopus-wasm';
import { AudioManager } from './audio/AudioManager';

/** Called when the local encoder has a chunk ready to send. */
export type ChunkCallback = (chunk: Uint8Array) => void;

// Opus frame duration: 20ms @ 48kHz = 960 samples/channel
const FRAME_SIZE = 960;
const SAMPLE_RATE = 48000;
const CHANNELS = 1;

/**
 * Buffers incoming Float32 samples and emits 20ms frames to the encoder.
 * The AudioWorklet fires irregularly sized buffers (typically 128 samples),
 * so we accumulate until we have a full 960-sample frame.
 */
class FrameBuffer {
    private buf = new Float32Array(FRAME_SIZE);
    private pos = 0;
    private readonly onFrame: (frame: Float32Array) => void;

    constructor(onFrame: (frame: Float32Array) => void) {
        this.onFrame = onFrame;
    }

    push(samples: Float32Array): void {
        let offset = 0;
        while (offset < samples.length) {
            const space = FRAME_SIZE - this.pos;
            const toCopy = Math.min(space, samples.length - offset);
            this.buf.set(samples.subarray(offset, offset + toCopy), this.pos);
            this.pos += toCopy;
            offset += toCopy;

            if (this.pos === FRAME_SIZE) {
                this.onFrame(this.buf);
                this.buf = new Float32Array(FRAME_SIZE);
                this.pos = 0;
            }
        }
    }
}

/**
 * Schedules decoded audio frames for a single peer using a running
 * nextPlayTime pointer, maintaining seamless gapless playback.
 */
class PeerPlayer {
    private readonly ctx: AudioContext;
    private readonly gainNode: GainNode;
    private nextPlayTime = 0;
    private readonly decoder: Promise<OpusDecoderHandle>;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.gainNode = ctx.createGain();
        this.gainNode.connect(ctx.destination);
        this.decoder = createDecoder({ channels: CHANNELS, sampleRate: SAMPLE_RATE });
    }

    setVolume(volume: number): void {
        this.gainNode.gain.setTargetAtTime(
            Math.max(0, Math.min(1, volume / 100)),
            this.ctx.currentTime,
            0.01
        );
    }

    setMuted(muted: boolean): void {
        // Preserve the previous volume when unmuting via a stored value
        this.gainNode.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }

    async scheduleChunk(packet: Uint8Array): Promise<void> {
        const dec = await this.decoder;
        try {
            // Decode directly to Float32 — no base64 conversion needed
            const rawFloats = dec.decodeFloat(packet);
            if (!rawFloats || rawFloats.length === 0) return;
            // Wrap in a concrete Float32Array<ArrayBuffer> for Web Audio compatibility
            const floats = new Float32Array(rawFloats);

            const buffer = this.ctx.createBuffer(CHANNELS, floats.length, SAMPLE_RATE);
            buffer.copyToChannel(floats, 0);

            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(this.gainNode);

            // 80ms lookahead: avoids glitches on network jitter
            const now = this.ctx.currentTime;
            const scheduleAt = Math.max(now + 0.08, this.nextPlayTime);
            src.start(scheduleAt);
            this.nextPlayTime = scheduleAt + buffer.duration;
        } catch (e) {
            console.warn('[PeerPlayer] Decode/schedule error:', e);
        }
    }

    async destroy(): Promise<void> {
        const dec = await this.decoder;
        dec.free();
        this.gainNode.disconnect();
    }
}

/**
 * AudioRelay — server-relay voice chat engine.
 *
 * Local:  mic → AudioManager (RNNoise) → AudioWorklet → FrameBuffer →
 *         OpusEncoder (libopus-wasm) → base64 → onChunk()
 *
 * Remote: base64 → OpusDecoder (libopus-wasm) → AudioBufferSourceNode
 *         (scheduled per peer via GainNode for volume/mute)
 *
 * No WebRTC. No ICE. No SDP. The server is the relay.
 */
export class AudioRelay {
    private audioManager = new AudioManager();
    private encoder: OpusEncoderHandle | null = null;
    private audioCtx: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private frameBuffer: FrameBuffer | null = null;
    private peers = new Map<string, PeerPlayer>();
    private selfMuted = false;

    /** Called with each encoded Opus chunk that should be sent to the server. */
    public onChunk?: ChunkCallback;

    /**
     * Acquires the mic, builds the RNNoise pipeline, initialises the
     * Opus encoder, and begins streaming 20ms frames. Safe to call
     * multiple times — no-ops if already active.
     */
    public async join(): Promise<void> {
        if (this.encoder) return;

        await this.audioManager.join();

        const stream = this.audioManager.stream;
        if (!stream) throw new Error('[AudioRelay] No microphone stream available.');

        this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

        // Create Opus encoder: mono, 48kHz, VBR, 16kbps target, VOIP application
        this.encoder = await createEncoder({
            channels: CHANNELS,
            sampleRate: SAMPLE_RATE,
            application: Application.Voip,
            bitrate: 16000,
            vbr: true,
            fec: true,
            packetLossPercent: 5,
            signal: Signal.Voice,
        });

        this.frameBuffer = new FrameBuffer((frame) => {
            if (this.selfMuted || !this.encoder) return;
            try {
                const packet = this.encoder.encodeFloat(frame);
                if (!packet || packet.length === 0) return;

                this.onChunk?.(packet);
            } catch (e) {
                console.warn('[AudioRelay] Encode error:', e);
            }
        });

        // Inline AudioWorklet: captures Float32 PCM from the processed stream
        // and posts it to the main thread without blocking audio playback.
        const workletCode = `
            class PcmCapture extends AudioWorkletProcessor {
                process(inputs) {
                    const ch = inputs[0]?.[0];
                    if (ch?.length) this.port.postMessage(ch, [ch.buffer]);
                    return true;
                }
            }
            registerProcessor('roomies-pcm-capture', PcmCapture);
        `;
        const workletBlob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(workletBlob);
        await this.audioCtx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = this.audioCtx.createMediaStreamSource(stream);
        this.workletNode = new AudioWorkletNode(this.audioCtx, 'roomies-pcm-capture');
        this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
            this.frameBuffer?.push(new Float32Array(e.data));
        };

        // Connect: stream source → worklet (sink only, not to audio output)
        source.connect(this.workletNode);
    }

    /** Mutes or unmutes the local mic. When muted, no chunks are sent upstream. */
    public setMuted(muted: boolean): void {
        this.selfMuted = muted;
        this.audioManager.setMuted(muted);
    }

    /**
     * Schedules an incoming encoded audio chunk from a remote peer.
     * Lazily creates a PeerPlayer (with its own decoder) for each new userId.
     */
    public scheduleChunk(userId: string, packet: Uint8Array): void {
        // Ensure we have an AudioContext even for receive-only (non-joined) users
        if (!this.audioCtx) {
            this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }

        let peer = this.peers.get(userId);
        if (!peer) {
            peer = new PeerPlayer(this.audioCtx);
            this.peers.set(userId, peer);
        }
        peer.scheduleChunk(packet);
    }

    /** Sets the playback volume (0–100) for a specific peer. */
    public setVolume(userId: string, volume: number): void {
        this.peers.get(userId)?.setVolume(volume);
    }

    /** Locally silences or restores a specific peer's audio output. */
    public setPeerMuted(userId: string, muted: boolean): void {
        this.peers.get(userId)?.setMuted(muted);
    }

    /** Removes a peer's player when they leave the party. */
    public removePeer(userId: string): void {
        const peer = this.peers.get(userId);
        if (peer) {
            peer.destroy();
            this.peers.delete(userId);
        }
    }

    /** Stops encoding, releases the mic, and destroys all peer players. */
    public leave(): void {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        this.frameBuffer = null;

        if (this.encoder) {
            this.encoder.free();
            this.encoder = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }

        this.audioManager.leave();

        for (const peer of this.peers.values()) {
            peer.destroy();
        }
        this.peers.clear();
        this.selfMuted = false;
    }
}
