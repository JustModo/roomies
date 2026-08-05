import { z } from 'zod';

export const ServerAuthKickedSchema = z.object({
  event: z.literal('auth.kicked'),
  payload: z.object({
    reason: z.literal('logged_in_elsewhere'),
  }),
});

export const ServerAuthUnauthorizedSchema = z.object({
  event: z.literal('auth.unauthorized'),
  payload: z.object({
    reason: z.literal('invalid_or_expired_token'),
  }),
});
