import { roomStore } from '../room/store';
import { TranscodeSessionManager } from '@roomies/transcoding';

export class CacheManager {
  private static cacheInterval?: NodeJS.Timeout;

  static start() {
    if (this.cacheInterval) return;

    // NOTE: Periodically trigger transcoding cache management based on playhead position.
    this.cacheInterval = setInterval(() => {
      const state = roomStore.getState();
      const sessionPlayheads: Record<string, { activeOffsets: Set<number>, playheads: { position: number, resolution?: string }[] }> = {};
      
      // Sync session: collect playheads from all non-async members.
      const syncPlayheads: { position: number, resolution?: string }[] = [{ position: roomStore.getCurrentPosition() }];
      for (const member of state.members) {
        if (member.status !== 'async') {
          syncPlayheads.push({ position: member.position, resolution: member.activeResolution });
        }
      }
      sessionPlayheads['sync'] = { activeOffsets: new Set([state.transcodeOffset]), playheads: syncPlayheads };
      
      // Async sessions: pool all async members into a single 'async' session
      const asyncPlayheads: { position: number, resolution?: string }[] = [];
      const asyncActiveOffsets = new Set<number>();
      
      for (const member of state.members) {
        if (member.status === 'async' && member.asyncSession) {
          asyncActiveOffsets.add(member.asyncSession.transcodeOffset);
          asyncPlayheads.push({ position: member.position, resolution: member.activeResolution });
        }
      }
      
      if (asyncPlayheads.length > 0) {
        sessionPlayheads['async'] = {
          activeOffsets: asyncActiveOffsets,
          playheads: asyncPlayheads,
        };
      }
      
      TranscodeSessionManager.manageActiveCaches(sessionPlayheads);
    }, 1000);
  }

  static stop() {
    if (this.cacheInterval) {
      clearInterval(this.cacheInterval);
      this.cacheInterval = undefined;
    }
  }
}
