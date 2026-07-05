import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(6),
});

export type LoginRequest = z.infer<typeof LoginSchema>;
export type RegisterRequest = z.infer<typeof RegisterSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    username: z.string(),
  })
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// --- User Profile & Settings ---
export const UserSettingsSchema = z.object({
  theme: z.string(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  settings: UserSettingsSchema.nullable(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

// --- Library & Media ---
export const MediaFileSchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  title: z.string(),
  path: z.string(),
  duration: z.number(),
  createdAt: z.string(),
});
export type MediaFile = z.infer<typeof MediaFileSchema>;

export const LibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  mediaFiles: z.array(MediaFileSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const ScanLibraryRequestSchema = z.object({
  name: z.string(),
  path: z.string(),
});
export type ScanLibraryRequest = z.infer<typeof ScanLibraryRequestSchema>;
