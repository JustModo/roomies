import { createEncoder } from 'libopus-wasm';
import type { OpusEncoderHandle } from 'libopus-wasm';
import { AudioManager } from './audio/AudioManager';
import type { AcquireResult } from './audio/AudioManager';
import { AudioPreprocessor } from './audio/AudioPreprocessor';
import { FrameBuffer } from './audio/FrameBuffer';
import { PeerPlayer } from './audio/PeerPlayer';
import { DEFAULT_VOICE_CONFIG } from './config';
import type { VoiceConfig } from './config';
// @ts-ignore - Vite URL import for AudioWorklet asset.
import pcmCaptureWorkletUrl from './worklets/pcmCaptureWorklet.js?url';

/** Called when the local encoder has a chunk ready to send. */
export type ChunkCallback = (chunk: Uint8Array) => void;

/** AudioContext.setSinkId is still experimental and missing from some lib.dom versions. */
type SinkCapableContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

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
    private readonly audioManager: AudioManager;
    private encoder: OpusEncoderHandle | null = null;
    private audioCtx: AudioContext | null = null;
    private captureSource: MediaStreamAudioSourceNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private captureSink: GainNode | null = null;
    private frameBuffer: FrameBuffer | null = null;
    private peers = new Map<string, PeerPlayer>();
    private selfMuted = false;
    private desiredSinkId: string | undefined;
    private analyserNode: AnalyserNode | null = null;
    private vadInterval: number | ReturnType<typeof setInterval> | null = null;

    /** Called with each encoded Opus chunk that should be sent to the server. */
    public onChunk?: ChunkCallback;
    /** Called when the active input device ends unexpectedly (e.g. unplugged). */
    public onInputDeviceEnded?: () => void;
    /** Called when the set of currently speaking users changes. Local user is 'local'. */
    public onActiveSpeakersChanged?: (activeSpeakers: Set<string>) => void;

    constructor(config: VoiceConfig = DEFAULT_VOICE_CONFIG) {
        this.config = config;
        this.audioManager = new AudioManager(config);
        this.audioManager.onTrackEnded = () => this.onInputDeviceEnded?.();
        this.preprocessor = new AudioPreprocessor(config.preprocessor.dcBlockerR);
    }

    /** Whether the currently supported browser can redirect audio output to a chosen device. */
    public static get outputSelectionSupported(): boolean {
        return typeof window !== 'undefined' &&
            typeof (AudioContext.prototype as SinkCapableContext).setSinkId === 'function';
    }

    private async applyDesiredSinkId(ctx: AudioContext): Promise<void> {
        const sinkCapableCtx = ctx as SinkCapableContext;
        if (!this.desiredSinkId || typeof sinkCapableCtx.setSinkId !== 'function') return;
        try {
            await sinkCapableCtx.setSinkId(this.desiredSinkId);
        } catch (e) {
            console.warn('[AudioRelay] Failed to set output device:', e);
        }
    }

    /**
     * Sets the preferred audio output device. Applies immediately to the live
     * AudioContext (if any) and to any AudioContext created afterwards.
     * No-ops silently on browsers that don't support output selection.
     */
    public async setOutputDevice(deviceId?: string): Promise<void> {
        this.desiredSinkId = deviceId;
        if (this.audioCtx) {
            await this.applyDesiredSinkId(this.audioCtx);
        }
    }

    /**
     * Acquires the mic, builds the RNNoise pipeline, initialises the
     * Opus encoder, and begins streaming 20ms frames. Safe to call
     * multiple times — no-ops if already active.
     */
    public async join(deviceId?: string): Promise<AcquireResult> {
        if (this.encoder) return { usedFallback: false };

        const acquireResult = await this.audioManager.join(deviceId);

        try {
            const stream = this.audioManager.stream;
            if (!stream) throw new Error('[AudioRelay] No microphone stream available.');

            this.audioCtx = new AudioContext({ sampleRate: this.config.sampleRate });
            await this.applyDesiredSinkId(this.audioCtx);

            this.encoder = await createEncoder({
                channels: this.config.channels,
                sampleRate: this.config.sampleRate,
                ...this.config.opus,
            });

            this.preprocessor.reset();

            this.frameBuffer = new FrameBuffer(this.config.frameSize, (frame) => {
                if (this.selfMuted || !this.encoder) return;
                const processedFrame = this.preprocessor.process(frame);
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

            this.analyserNode = this.audioCtx.createAnalyser();
            this.analyserNode.fftSize = 256;

            // Keep the capture worklet pulled by the graph without audible local monitor output.
            source.connect(this.analyserNode);
            this.analyserNode.connect(this.workletNode);
            this.workletNode.connect(this.captureSink);
            this.captureSink.connect(this.audioCtx.destination);

            this.startVadPolling();

            return acquireResult;
        } catch (e) {
            // A failure here must not leave the mic captured (browser mic
            // indicator staying on) or a half-built AudioContext dangling.
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
            if (this.analyserNode) {
                this.analyserNode.disconnect();
                this.analyserNode = null;
            }
            this.frameBuffer = null;
            if (this.encoder) {
                this.encoder.free();
                this.encoder = null;
            }
            if (this.audioCtx) {
                this.audioCtx.close().catch(() => {});
                this.audioCtx = null;
            }
            this.audioManager.leave();
            throw e;
        }
    }

    /**
     * Switches the active microphone while joined, without dropping the
     * encoder/connection to peers — only the capture source is rewired.
     * Falls back to the system default device if the requested one is
     * unavailable. Safe to call before joining (just re-acquires for next join).
     */
    public async switchMic(deviceId?: string): Promise<AcquireResult> {
        const result = await this.audioManager.switchInput(deviceId);

        if (this.encoder && this.audioCtx && this.workletNode) {
            const stream = this.audioManager.stream;
            if (stream) {
                if (this.captureSource) {
                    this.captureSource.disconnect();
                }
                const source = this.audioCtx.createMediaStreamSource(stream);
                
                if (this.analyserNode) {
                    source.connect(this.analyserNode);
                } else {
                    source.connect(this.workletNode);
                }
                
                this.captureSource = source;
            }
        }

        return result;
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
            void this.applyDesiredSinkId(this.audioCtx);
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

    private startVadPolling(): void {
        if (this.vadInterval) return;
        const THRESHOLD = 0.001;
        
        let lastActiveSpeakers = new Set<string>();

        this.vadInterval = setInterval(() => {
            const activeSpeakers = new Set<string>();

            // Check local mic
            if (this.analyserNode && !this.selfMuted) {
                const data = new Float32Array(this.analyserNode.fftSize);
                this.analyserNode.getFloatTimeDomainData(data);
                let sumSquares = 0;
                for (let i = 0; i < data.length; i++) {
                    sumSquares += data[i] * data[i];
                }
                const vol = Math.sqrt(sumSquares / data.length);
                if (vol > THRESHOLD) {
                    activeSpeakers.add('local');
                }
            }

            // Check remote peers
            for (const [userId, peer] of this.peers.entries()) {
                if (peer.getVolume() > THRESHOLD) {
                    activeSpeakers.add(userId);
                }
            }

            // If set changed, fire callback
            if (activeSpeakers.size !== lastActiveSpeakers.size || 
                [...activeSpeakers].some(s => !lastActiveSpeakers.has(s))) {
                lastActiveSpeakers = activeSpeakers;
                this.onActiveSpeakersChanged?.(activeSpeakers);
            }
        }, 100);
    }

    private stopVadPolling(): void {
        if (this.vadInterval) {
            clearInterval(this.vadInterval as any);
            this.vadInterval = null;
            this.onActiveSpeakersChanged?.(new Set());
        }
    }

    /** Stops encoding, releases the mic, and destroys all peer players. */
    public leave(): void {
        this.stopVadPolling();
        
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

        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }

        if (this.encoder) {
            this.encoder.free();
            this.encoder = null;
        }

        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }

        this.audioManager.leave();

        void Promise.all([...this.peers.values()].map((peer) => peer.destroy()));

        this.peers.clear();
        this.selfMuted = false;
    }
}
