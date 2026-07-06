import { z } from 'zod';

// Server -> Client
export const ServerErrorSchema = z.object({
  event: z.literal('error'),
  payload: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});
