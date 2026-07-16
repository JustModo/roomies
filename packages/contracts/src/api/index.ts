import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const SetupRootSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const CreateGuestSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export type LoginRequest = z.infer<typeof LoginSchema>;
export type SetupRootRequest = z.infer<typeof SetupRootSchema>;
export type CreateGuestRequest = z.infer<typeof CreateGuestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    role: z.string(),
  })
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const SubtitleSchema = z.object({
  id: z.string(),
  mediaFileId: z.string(),
  path: z.string(),
  language: z.string().nullable(),
});
export type Subtitle = z.infer<typeof SubtitleSchema>;

export const MediaFileSchema = z.object({
  id: z.string(),
  movieId: z.string(),
  title: z.string(),
  path: z.string(),
  duration: z.number(),
  number: z.number().nullable(),
  createdAt: z.string(),
  subtitles: z.array(SubtitleSchema),
});
export type MediaFile = z.infer<typeof MediaFileSchema>;

export const MovieSchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  type: z.enum(['movie', 'show']),
  name: z.string(),
  path: z.string(),
  mediaFiles: z.array(MediaFileSchema),
});
export type Movie = z.infer<typeof MovieSchema>;

export const LibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  movies: z.array(MovieSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const ScanLibraryRequestSchema = z.object({});
export type ScanLibraryRequest = z.infer<typeof ScanLibraryRequestSchema>;

export const ChangeMediaRequestSchema = z.object({
  mediaFileId: z.string(),
});
export type ChangeMediaRequest = z.infer<typeof ChangeMediaRequestSchema>;

export const SubtitleTrackSchema = z.object({
  id: z.string(),
  language: z.string().nullable(),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;

export const ChangeMediaResponseSchema = z.object({
  hlsUrl: z.string(),
  mediaFileId: z.string(),
  title: z.string(),
  subtitles: z.array(SubtitleTrackSchema).optional(),
});
export type ChangeMediaResponse = z.infer<typeof ChangeMediaResponseSchema>;

export const ActivePlaybackResponseSchema = z.object({
  mediaFileId: z.string().optional(),
  mediaTitle: z.string().optional(),
  viewersCount: z.number().optional(),
  state: z.string().optional(),
  hlsUrl: z.string().optional(),
  subtitles: z.array(SubtitleTrackSchema).optional(),
});
export type ActivePlaybackResponse = z.infer<typeof ActivePlaybackResponseSchema>;

export const ChatMessageResponseSchema = z.object({
  userId: z.string(),
  username: z.string().optional(),
  message: z.string(),
  timestamp: z.string(),
});
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>;

export const ChatHistoryResponseSchema = z.array(ChatMessageResponseSchema);
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
}

