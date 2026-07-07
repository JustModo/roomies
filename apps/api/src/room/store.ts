export interface MemberState {
    username: string;
    userId: string;

    status: 'ready' | 'buffering';
    position: number;
}

export interface RoomPlaybackState {
    state: 'waiting' | 'playing' | 'paused' | 'buffering';
    intendedState: 'playing' | 'paused';
    anchorPosition: number;
    anchorTime: number;
    playbackRate: number;
}

export interface RoomState {
    mediaId: string;
    mediaTitle: string;
    hlsUrl: string;
    duration: number;
    transcodeOffset: number;
    playback: RoomPlaybackState;
    members: MemberState[];
}

export class RoomStore {
    private state: RoomState;

    constructor() {
        this.state = {
            mediaId: '',
            mediaTitle: '',
            hlsUrl: '',
            duration: 0,
            transcodeOffset: 0,
            playback: {
                state: 'waiting',
                intendedState: 'paused',
                anchorPosition: 0,
                anchorTime: Date.now(),
                playbackRate: 1,
            },
            members: [],
        };
    }

    /**
     * Returns a reference to the current state.
     */
    public getState(): Readonly<RoomState> {
        return this.state;
    }

    /**
     * Updates the current media playing in the room.
     */
    public updateMedia(mediaId: string, mediaTitle: string, hlsUrl: string, duration: number, transcodeOffset = 0): void {
        this.state.mediaId = mediaId;
        this.state.mediaTitle = mediaTitle;
        this.state.hlsUrl = hlsUrl;
        this.state.duration = duration;
        this.state.transcodeOffset = transcodeOffset;
    }

    /**
     * Updates the transcode offset.
     */
    public updateTranscodeOffset(offset: number): void {
        this.state.transcodeOffset = offset;
    }

    /**
     * Calculates the true current position of the video based on anchor time and rate.
     */
    public getCurrentPosition(): number {
        const p = this.state.playback;
        if (p.state === 'playing') {
            const elapsed = (Date.now() - p.anchorTime) / 1000;
            return p.anchorPosition + (elapsed * p.playbackRate);
        }
        return p.anchorPosition;
    }

    /**
     * Merges partial updates into the playback state.
     * Automatically bakes in elapsed time to anchorPosition if state/rate changes while playing.
     */
    public updatePlayback(updates: Partial<RoomPlaybackState>): void {
        // If playing and we aren't explicitly seeking, lock in the current calculated position
        // before applying the new state or rate.
        if (this.state.playback.state === 'playing' && updates.anchorPosition === undefined) {
            if (updates.state !== undefined || updates.playbackRate !== undefined) {
                this.state.playback.anchorPosition = this.getCurrentPosition();
            }
        }

        this.state.playback = {
            ...this.state.playback,
            ...updates,
        };
    }

    /**
     * Convenience method to just change the playback state (e.g. paused -> playing)
     * and update the anchor time to now.
     */
    public setPlaybackState(status: RoomPlaybackState['state']): void {
        this.updatePlayback({ state: status, anchorTime: Date.now() });
    }

    /**
     * Resets all members to not ready and not buffering.
     * Called when media changes to force a re-sync.
     */
    public resetAllMembers(): void {
        for (const member of this.state.members) {
            member.status = 'buffering';
        }
    }

    public addMember(member: MemberState): void {
        if (!this.state.members.some(m => m.userId === member.userId)) {
            this.state.members.push(member);
        }
    }

    public removeMember(userId: string): void {
        this.state.members = this.state.members.filter(m => m.userId !== userId);
    }

    public updateMember(userId: string, updates: Partial<MemberState>): void {
        const index = this.state.members.findIndex(m => m.userId === userId);
        if (index !== -1) {
            this.state.members[index] = {
                ...this.state.members[index],
                ...updates,
            };
        }
    }
}

// Export a singleton instance representing the global room state
export const roomStore = new RoomStore();
