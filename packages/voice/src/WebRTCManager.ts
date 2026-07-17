export type SignalPayload = {
    targetUserId: string;
    signal: any;
};

export class WebRTCManager {
    private localStream: MediaStream | null = null;
    private connections = new Map<string, RTCPeerConnection>();
    public onSignal?: (payload: SignalPayload) => void;
    public onStreamAdded?: (userId: string, stream: MediaStream) => void;
    public onStreamRemoved?: (userId: string) => void;

    public async join(): Promise<void> {
        if (this.localStream) return;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is not available (requires HTTPS or localhost).');
        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true
                }, 
                video: false 
            });
        } catch (e) {
            console.error('[WebRTC] Failed to get local audio', e);
            throw e;
        }
    }

    public toggleMute(muted: boolean) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }
    }

    private optimizeSDP(sdp: string): string {
        const match = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
        if (!match) return sdp;

        const payloadType = match[1];
        const fmtpRegex = new RegExp(`a=fmtp:${payloadType} (.*)`);
        
        if (fmtpRegex.test(sdp)) {
            return sdp.replace(fmtpRegex, `a=fmtp:${payloadType} $1;usedtx=1;useinbandfec=1;stereo=0`);
        } else {
            return sdp.replace(
                new RegExp(`(a=rtpmap:${payloadType} opus\\/48000\\/2\\r\\n)`),
                `$1a=fmtp:${payloadType} usedtx=1;useinbandfec=1;stereo=0\r\n`
            );
        }
    }

    public connectToPeer(userId: string, isInitiator: boolean) {
        if (this.connections.has(userId)) return;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        });

        this.connections.set(userId, pc);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
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
                this.onStreamRemoved?.(userId);
                pc.close();
                this.connections.delete(userId);
            }
        };

        if (isInitiator) {
            pc.createOffer()
                .then(offer => {
                    if (offer.sdp) offer.sdp = this.optimizeSDP(offer.sdp);
                    return pc.setLocalDescription(offer);
                })
                .then(() => {
                    this.onSignal?.({
                        targetUserId: userId,
                        signal: pc.localDescription
                    });
                })
                .catch(e => console.error('[WebRTC] Create offer failed', e));
        }
    }

    public async handleSignal(sourceUserId: string, signal: any) {
        let pc = this.connections.get(sourceUserId);
        
        if (!pc) {
            this.connectToPeer(sourceUserId, false);
            pc = this.connections.get(sourceUserId)!;
        }

        try {
            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                const answer = await pc.createAnswer();
                if (answer.sdp) answer.sdp = this.optimizeSDP(answer.sdp);
                await pc.setLocalDescription(answer);
                this.onSignal?.({
                    targetUserId: sourceUserId,
                    signal: pc.localDescription
                });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
            } else if (signal.type === 'candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
            this.onStreamRemoved?.(userId);
        }
    }

    public leave() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        for (const [userId, pc] of this.connections) {
            pc.close();
            this.onStreamRemoved?.(userId);
        }
        this.connections.clear();
    }
}
