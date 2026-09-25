export type { Movie, MediaFile, UserProfile, RoomState, MemberState, MediaInfo } from '@roomies/contracts';

export interface AdminOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mediaTitle?: string | null;
}

export type AdminTab = 'USERS' | 'MEDIA';
