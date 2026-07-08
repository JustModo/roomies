import { z } from 'zod';

export const ServerErrorSchema = z.object({
  event: z.literal('error'),
  payload: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});
