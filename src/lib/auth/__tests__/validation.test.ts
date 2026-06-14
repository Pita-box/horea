import { describe, expect, it } from 'vitest';

import { validateEmail } from '../email';
import { validatePassword } from '../password';

describe('validateEmail', () => {
  it('accepts a simple valid email', () => {
    expect(validateEmail('podnikatel@example.cz')).toBe(true);
  });

  it.each([
    'podnikatel',
    'podnikatel@',
    '@example.cz',
    'podnikatel@example',
    'podnikatel @example.cz',
  ])('rejects %s', (email) => {
    expect(validateEmail(email)).toBe(false);
  });
});

describe('validatePassword', () => {
  it('accepts a password with length, uppercase and digit', () => {
    expect(validatePassword('Heslo123')).toEqual({ ok: true });
  });

  it('rejects short password first', () => {
    expect(validatePassword('A1aaaa')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rejects password without uppercase letter', () => {
    expect(validatePassword('heslo123')).toEqual({ ok: false, reason: 'no_uppercase' });
  });

  it('rejects password without digit', () => {
    expect(validatePassword('Heslooooo')).toEqual({ ok: false, reason: 'no_digit' });
  });
});
