import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  CreateGuestSchema,
  ChangeMediaRequestSchema,
} from '@roomies/contracts';

describe('Contracts & Schemas', () => {
  it('validates correct login request payload', () => {
    const valid = LoginSchema.safeParse({ username: 'admin', password: 'password123' });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid login request payload missing password', () => {
    const invalid = LoginSchema.safeParse({ username: 'admin' });
    expect(invalid.success).toBe(false);
  });

  it('validates guest user creation payload', () => {
    const valid = CreateGuestSchema.safeParse({ username: 'guest1', password: 'guestpassword' });
    expect(valid.success).toBe(true);
  });

  it('validates change media request payload', () => {
    const valid = ChangeMediaRequestSchema.safeParse({ mediaFileId: '123e4567-e89b-12d3-a456-426614174000' });
    expect(valid.success).toBe(true);
  });
});
