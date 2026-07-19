import { createEncoder } from 'libopus-wasm';
import type { OpusEncoderHandle } from 'libopus-wasm';
import { AudioManager } from './audio/AudioManager';
import { AudioPreprocessor } from './audio/AudioPreprocessor';
import { FrameBuffer } from './audio/FrameBuffer';
import { PeerPlayer } from './audio/PeerPlayer';
import { VoiceActivityDetector } from './audio/VoiceActivityDetector';
import { DEFAULT_VOICE_CONFIG } from './config';
import type { VoiceConfig } from './config';
// @ts-ignore - Vite URL import for AudioWorklet asset.
import pcmCaptureWorkletUrl from './worklets/pcmCaptureWorklet.js?url';

/** Called when the local encoder has a chunk ready to send. */
export type ChunkCallback = (chunk: Uint8Array) => void;

/**
 * AudioRelay — server-relay voice chat engine.
 *
 * Local:  mic → AudioManager (RNNoise) → AudioWorklet → FrameBuffer →
 *         voice gate → OpusEncoder (libopus-wasm) → binary onChunk()
 *
 * Remote: binary Opus → OpusDecoder (libopus-wasm) → AudioBufferSourceNode
 *         (scheduled per peer via GainNode for volume/mute)
 *
 * No WebRTC. No ICE. No SDP. The server is the relay.
 */
export class AudioRelay {
    private readonly config: VoiceConfig;
    private readonly preprocessor: AudioPreprocessor;
    private readonly vad: VoiceActivityDetector;
    private readonly audioManager: AudioManager;
    private encoder: OpusEncoderHandle | null = null;
    private audioCtx: AudioContext | null = null;
    private captureSource: MediaStreamAudioSourceNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private captureSink: GainNode | null = null;
    private frameBuffer: FrameBuffer | null = null;
    private peers = new Map<string, PeerPlayer>();
    private selfMuted = false;

    /** Called with each encoded Opus chunk that should be sent to the server. */
    public onChunk?: ChunkCallback;

    constructor(config: VoiceConfig = DEFAULT_VOICE_CONFIG) {
        this.config = config;
        this.audioManager = new AudioManager(config);
        this.preprocessor = new AudioPreprocessor(config.preprocessor.dcBlockerR);
        this.vad = new VoiceActivityDetector({
            ...config.vad,
            warmupFrames: config.captureWarmupFrames,
        });
    }

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

        this.audioCtx = new AudioContext({ sampleRate: this.config.sampleRate });

        this.encoder = await createEncoder({
            channels: this.config.channels,
            sampleRate: this.config.sampleRate,
            ...this.config.opus,
        });

        this.preprocessor.reset();
        this.vad.reset();

        this.frameBuffer = new FrameBuffer(this.config.frameSize, (frame) => {
            if (this.selfMuted || !this.encoder) return;
            const processedFrame = this.preprocessor.process(frame);
            if (!this.vad.shouldTransmit(processedFrame)) return;

            try {
                const packet = this.encoder.encodeFloat(processedFrame);
                if (!packet || packet.length === 0) return;

                this.onChunk?.(packet);
            } catch (e) {
                console.warn('[AudioRelay] Encode error:', e);
            }
        });

        await this.audioCtx.audioWorklet.addModule(pcmCaptureWorkletUrl);

        const source = this.audioCtx.createMediaStreamSource(stream);
        this.captureSource = source;
        this.workletNode = new AudioWorkletNode(this.audioCtx, 'roomies-pcm-capture');
        this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
            this.frameBuffer?.push(new Float32Array(e.data));
        };

        this.captureSink = this.audioCtx.createGain();
        this.captureSink.gain.value = 0;

        // Keep the capture worklet pulled by the graph without audible local monitor output.
        source.connect(this.workletNode);
        this.workletNode.connect(this.captureSink);
        this.captureSink.connect(this.audioCtx.destination);
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
            this.audioCtx = new AudioContext({ sampleRate: this.config.sampleRate });
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }

        let peer = this.peers.get(userId);
        if (!peer) {
            peer = new PeerPlayer(this.audioCtx, this.config);
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
        if (this.captureSource) {
            this.captureSource.disconnect();
            this.captureSource = null;
        }
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        if (this.captureSink) {
            this.captureSink.disconnect();
            this.captureSink = null;
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
