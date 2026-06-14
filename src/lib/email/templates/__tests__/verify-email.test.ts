import { describe, expect, it } from 'vitest';

import { renderVerifyEmail } from '../verify-email';

describe('renderVerifyEmail', () => {
  it('renders Czech verification email with html and text links', () => {
    const email = renderVerifyEmail({
      verifyUrl: 'https://horea.test/verify-email?token_hash=abc',
    });

    expect(email.subject).toBe('Ověřte svůj email — Horea');
    expect(email.html).toContain('<html lang="cs">');
    expect(email.html).toContain('Ověřit email');
    expect(email.html).toContain('https://horea.test/verify-email?token_hash=abc');
    expect(email.text).toContain('https://horea.test/verify-email?token_hash=abc');
  });

  it('escapes the verification url in html output', () => {
    const email = renderVerifyEmail({ verifyUrl: 'https://horea.test/?x=<script>' });

    expect(email.html).toContain('https://horea.test/?x=&lt;script&gt;');
    expect(email.html).not.toContain('https://horea.test/?x=<script>');
  });
});
