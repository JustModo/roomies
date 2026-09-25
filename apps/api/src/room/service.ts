import { PlaybackCoordinator } from '../playback/coordinator';
import { mediaChangedFor } from '../playback/helpers';
import { SyncService } from '../sync/service';
import { SocketHub } from '../websocket/hub';
import { SocketContext, SocketPayload } from '../websocket/router';
import { RoomStore } from './store';

/** Room membership and admin-only room settings. */
export class RoomService {
  constructor(
    private readonly roomStore: RoomStore,
    private readonly hub: SocketHub,
    private readonly coordinator: PlaybackCoordinator,
    private readonly sync: SyncService,
  ) {}

  async handleJoin(_payload: SocketPayload<'room.join'>, ctx: SocketContext) {
    this.roomStore.addMember(
      {
        userId: ctx.userId,
        username: ctx.username,
        status: 'buffering',
        position: 0,
        pingQuality: 0,
        controlsLocked: false,
        party: { isJoined: false, micMuted: true, videoMuted: true },
      },
      ctx.socketId,
    );

    this.sync.reconcileRoomBufferingState();
    this.broadcastRoomState();
    this.hub.broadcast({ event: 'user.joined', payload: { userId: ctx.userId, username: ctx.username } });
  }

  async handleLeave(_payload: SocketPayload<'room.leave'>, ctx: SocketContext) {
    const wasAsync = this.roomStore.getMember(ctx.userId)?.status === 'async';
    if (!this.roomStore.removeMember(ctx.userId, ctx.socketId)) return;

    if (wasAsync) {
      this.coordinator.removeAsyncPlayhead(ctx.userId);
    } else {
      this.coordinator.removeSyncPlayhead(ctx.userId);
    }

    // NOTE: Pauses an emptied room, or resumes it if the departing member was the only one buffering.
    this.sync.reconcileRoomBufferingState();
    this.hub.broadcast({ event: 'user.left', payload: { userId: ctx.userId, username: ctx.username } });
  }

  async handleSetControlLock(payload: SocketPayload<'room.set_control_lock'>) {
    this.roomStore.setControlLock(payload.userId, payload.locked);
    this.broadcastRoomState();
  }

  async handleUpdateSettings(payload: SocketPayload<'room.update_settings'>) {
    this.roomStore.updateSettings(payload.settings);

    // Disabling async mode forces every async member back to room sync.
    if (payload.settings.allowAsyncMode === false) {
      const state = this.roomStore.getState();
      const asyncMembers = state.members.filter((m) => m.status === 'async');
      for (const member of asyncMembers) {
        this.coordinator.removeAsyncPlayhead(member.userId);
        this.roomStore.updateMember(member.userId, { status: 'ready', asyncSession: undefined });

        // Reset their player back to the room-scoped HLS stream — without this, the client keeps
        // pointing at the now-torn-down async transcode session and buffers forever.
        this.hub.sendToUser(member.userId, { event: 'media.changed', payload: mediaChangedFor(state, 'room', state.transcodeOffset) });
        this.hub.broadcast({ event: 'user.status_changed', payload: { userId: member.userId, status: 'ready' } });
      }

      if (asyncMembers.length > 0) this.sync.reconcileRoomBufferingState();
    }

    this.broadcastRoomState();
  }

  private broadcastRoomState(): void {
    this.hub.broadcast({ event: 'room.state', payload: { room: this.roomStore.getState() } });
  }
}
