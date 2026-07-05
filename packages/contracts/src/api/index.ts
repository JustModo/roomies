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
