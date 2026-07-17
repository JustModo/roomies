import { AudioManager } from './audio/AudioManager';
import { optimizeSDP } from './webrtc/SDPUtils';

export type SignalPayload = {
    targetUserId: string;
    signal: any;
};

export class WebRTCManager {
    private audioManager = new AudioManager();
    
    private connections = new Map<string, RTCPeerConnection>();
    private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
    
    public onSignal?: (payload: SignalPayload) => void;
    public onStreamAdded?: (userId: string, stream: MediaStream) => void;
    public onStreamRemoved?: (userId: string) => void;
    public onPeerDisconnected?: (userId: string) => void;

    public get hasLocalStream(): boolean {
        return this.audioManager.hasLocalStream;
    }

    public getConnectedPeers(): string[] {
        return Array.from(this.connections.keys());
    }

    public async join(): Promise<void> {
        await this.audioManager.join();
    }

    public toggleMute(muted: boolean) {
        this.audioManager.toggleMute(muted);
    }

    private async createPeerConnection(userId: string): Promise<RTCPeerConnection> {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: [
                        'turn:openrelay.metered.ca:80',
                        'turn:openrelay.metered.ca:443',
                        'turn:openrelay.metered.ca:443?transport=tcp'
                    ],
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        });

        this.connections.set(userId, pc);
        this.iceCandidateQueues.set(userId, []);

        const streamToUse = this.audioManager.stream;
        if (streamToUse) {
            streamToUse.getTracks().forEach(track => {
                pc.addTrack(track, streamToUse);
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal?.({
                    targetUserId: userId,
                    signal: { type: 'candidate', candidate: event.candidate }
                });
            }
        };

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            if (stream) {
                this.onStreamAdded?.(userId, stream);
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.removePeer(userId);
            }
        };

        return pc;
    }

    public async connectToPeer(userId: string, isInitiator: boolean) {
        if (this.connections.has(userId)) return;

        if (isInitiator) {
            const pc = await this.createPeerConnection(userId);
            try {
                const offer = await pc.createOffer();
                if (offer.sdp) offer.sdp = optimizeSDP(offer.sdp);
                await pc.setLocalDescription(offer);
                
                this.onSignal?.({
                    targetUserId: userId,
                    signal: pc.localDescription
                });
            } catch (e) {
                console.error('[WebRTC] Create offer failed', e);
            }
        }
    }

    public async handleSignal(sourceUserId: string, signal: any) {
        let pc = this.connections.get(sourceUserId);
        
        // If we get a new offer but already have a connection, reset it.
        if (pc && signal.type === 'offer' && pc.currentRemoteDescription) {
            this.removePeer(sourceUserId);
            pc = undefined;
        }

        try {
            if (signal.type === 'offer') {
                if (!pc) pc = await this.createPeerConnection(sourceUserId);
                
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                
                // Process any queued ICE candidates that arrived before the offer was set
                const queue = this.iceCandidateQueues.get(sourceUserId) || [];
                for (const candidate of queue) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.iceCandidateQueues.set(sourceUserId, []);

                const answer = await pc.createAnswer();
                if (answer.sdp) answer.sdp = optimizeSDP(answer.sdp);
                await pc.setLocalDescription(answer);
                
                this.onSignal?.({
                    targetUserId: sourceUserId,
                    signal: pc.localDescription
                });
            } else if (signal.type === 'answer') {
                if (!pc) return;
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                
                // Process any queued ICE candidates that arrived before the answer was set
                const queue = this.iceCandidateQueues.get(sourceUserId) || [];
                for (const candidate of queue) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.iceCandidateQueues.set(sourceUserId, []);
            } else if (signal.type === 'candidate') {
                // If remote description isn't set yet, queue the candidate!
                // This mimics the webrtc-starter flow of holding candidates until the answer/offer is processed.
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } else {
                    const queue = this.iceCandidateQueues.get(sourceUserId) || [];
                    queue.push(signal.candidate);
                    this.iceCandidateQueues.set(sourceUserId, queue);
                }
            }
        } catch (e) {
            console.error('[WebRTC] Error handling signal', e);
        }
    }

    public removePeer(userId: string) {
        const pc = this.connections.get(userId);
        if (pc) {
            pc.close();
            this.connections.delete(userId);
            this.iceCandidateQueues.delete(userId);
            this.onStreamRemoved?.(userId);
            this.onPeerDisconnected?.(userId);
        }
    }

    public leave() {
        this.audioManager.leave();
        for (const [userId, pc] of this.connections) {
            pc.close();
            this.onStreamRemoved?.(userId);
        }
        this.connections.clear();
        this.iceCandidateQueues.clear();
    }
}
