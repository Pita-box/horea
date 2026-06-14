import { describe, expect, it } from 'vitest';

import { renderPasswordResetEmail } from '../password-reset';

describe('renderPasswordResetEmail', () => {
  it('renders Czech password reset email with html and text links', () => {
    const email = renderPasswordResetEmail({
      resetUrl: 'https://horea.test/reset-password?code=abc',
    });

    expect(email.subject).toBe('Obnovení hesla — Horea');
    expect(email.html).toContain('<html lang="cs">');
    expect(email.html).toContain('Nastavit nové heslo');
    expect(email.html).toContain('https://horea.test/reset-password?code=abc');
    expect(email.text).toContain('https://horea.test/reset-password?code=abc');
  });

  it('escapes the reset url in html output', () => {
    const email = renderPasswordResetEmail({ resetUrl: 'https://horea.test/?x=<script>' });

    expect(email.html).toContain('https://horea.test/?x=&lt;script&gt;');
    expect(email.html).not.toContain('https://horea.test/?x=<script>');
  });
});
