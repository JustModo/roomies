export interface MemberState {
    username: string;
    userId: string;

    ready: boolean;
    buffering: boolean;
    position: number;
}

export interface RoomPlaybackState {
    state: 'waiting' | 'playing' | 'paused' | 'buffering';
    anchorPosition: number;
    anchorTime: number;
    playbackRate: number;
}

export interface RoomState {
    mediaUrl: string;
    duration: number;
    playback: RoomPlaybackState;
    members: MemberState[];
}

export class RoomStore {
    private state: RoomState;

    constructor() {
        this.state = {
            mediaUrl: '',
            duration: 0,
            playback: {
                state: 'waiting',
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
    public updateMedia(mediaUrl: string, duration: number): void {
        this.state.mediaUrl = mediaUrl;
        this.state.duration = duration;
    }

    /**
     * Merges partial updates into the playback state.
     */
    public updatePlayback(updates: Partial<RoomPlaybackState>): void {
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
        this.state.playback.state = status;
        this.state.playback.anchorTime = Date.now();
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
