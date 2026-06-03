import { describe, expect, it } from 'vitest';

import { wrapEmail } from '../base';

describe('wrapEmail', () => {
  it('wraps html body with Czech Horea footer', () => {
    const html = wrapEmail({
      subject: 'Potvrzení rezervace',
      body: '<p>Rezervace byla přijata.</p>',
    });

    expect(html).toContain('<html lang="cs">');
    expect(html).toContain('Potvrzení rezervace');
    expect(html).toContain('<p>Rezervace byla přijata.</p>');
    expect(html).toContain('podpora@horea.cz');
    expect(html).toContain('GDPR a zpracování osobních údajů');
  });

  it('escapes subject in title and heading', () => {
    const html = wrapEmail({ subject: '<Test>', body: '<p>Obsah</p>' });

    expect(html).toContain('&lt;Test&gt;');
    expect(html).not.toContain('<title><Test></title>');
  });
});
