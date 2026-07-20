import { Resolution } from '@roomies/transcoding';

export interface AsyncSessionState {
    transcodeOffset: number;
}

export interface MemberState {
    username: string;
    userId: string;

    status: 'ready' | 'buffering' | 'async';
    position: number;
    activeResolution?: Resolution;
    asyncSession?: AsyncSessionState;
    controlsLocked: boolean;
    pingQuality: number;
    party: {
        isJoined: boolean;
        micMuted: boolean;
        videoMuted: boolean;
    };
}

export interface RoomPlaybackState {
    state: 'waiting' | 'playing' | 'paused' | 'buffering';
    intendedState: 'playing' | 'paused';
    anchorPosition: number;
    anchorTime: number;
    playbackRate: number;
}

export interface SubtitleTrack {
    id: string;
    language: string | null;
}

export interface RoomSettingsState {
    allowAsyncMode: boolean;
}

export interface RoomState {
    settings: RoomSettingsState;
    mediaId: string;
    mediaTitle: string;
    hlsUrl: string;
    duration: number;
    transcodeOffset: number;
    subtitles: SubtitleTrack[];
    playback: RoomPlaybackState;
    members: MemberState[];
}

export class RoomStore {
    private state: RoomState;
    private lockedUserIds = new Set<string>();

    constructor() {
        this.state = {
            settings: {
                allowAsyncMode: true,
            },
            mediaId: '',
            mediaTitle: '',
            hlsUrl: '',
            duration: 0,
            transcodeOffset: 0,
            subtitles: [],
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

    public updateSettings(updates: Partial<RoomSettingsState>): void {
        this.state.settings = {
            ...this.state.settings,
            ...updates,
        };
    }

    public getState(): Readonly<RoomState> {
        return this.state;
    }

    public updateMedia(mediaId: string, mediaTitle: string, hlsUrl: string, duration: number, transcodeOffset = 0, subtitles: SubtitleTrack[] = []): void {
        this.state.mediaId = mediaId;
        this.state.mediaTitle = mediaTitle;
        this.state.hlsUrl = hlsUrl;
        this.state.duration = duration;
        this.state.transcodeOffset = transcodeOffset;
        this.state.subtitles = subtitles;
    }

    public updateTranscodeOffset(offset: number): void {
        this.state.transcodeOffset = offset;
    }

    public getCurrentPosition(): number {
        const p = this.state.playback;
        if (p.state === 'playing') {
            const elapsed = (Date.now() - p.anchorTime) / 1000;
            return p.anchorPosition + (elapsed * p.playbackRate);
        }
        return p.anchorPosition;
    }

    /** NOTE: Merges playback state updates and recalculates anchorPosition if state/rate changes while playing. */
    public updatePlayback(updates: Partial<RoomPlaybackState>): void {
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

    public setPlaybackState(status: RoomPlaybackState['state']): void {
        this.updatePlayback({ state: status, anchorTime: Date.now() });
    }

    public resetAllMembers(): void {
        for (const member of this.state.members) {
            if (member.status !== 'async') {
                member.status = 'buffering';
            }
        }
    }

    public addMember(member: MemberState): void {
        if (!this.state.members.some(m => m.userId === member.userId)) {
            member.controlsLocked = this.lockedUserIds.has(member.userId);
            this.state.members.push(member);
        }
    }

    public removeMember(userId: string): boolean {
        const initialLength = this.state.members.length;
        this.state.members = this.state.members.filter(m => m.userId !== userId);
        return this.state.members.length < initialLength;
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

    public setControlLock(userId: string, locked: boolean): void {
        if (locked) {
            this.lockedUserIds.add(userId);
        } else {
            this.lockedUserIds.delete(userId);
        }
        this.updateMember(userId, { controlsLocked: locked });
    }
}

export const roomStore = new RoomStore();
