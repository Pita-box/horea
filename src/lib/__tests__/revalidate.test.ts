import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

import { revalidatePublicPage } from '../revalidate';

let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  revalidatePathMock.mockReset();
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  writeSpy.mockRestore();
});

describe('revalidatePublicPage', () => {
  it('revalidates the public slug path', () => {
    revalidatePublicPage('barber-abc');

    expect(revalidatePathMock).toHaveBeenCalledWith('/barber-abc');
  });

  it('normalizes an accidentally prefixed slash', () => {
    revalidatePublicPage('/barber-abc');

    expect(revalidatePathMock).toHaveBeenCalledWith('/barber-abc');
  });

  it('logs and does not throw when revalidation fails', () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('cache failed');
    });

    expect(() => revalidatePublicPage('barber-abc')).not.toThrow();
    expect(writeSpy).toHaveBeenCalled();
    expect(String(writeSpy.mock.calls[0][0])).toContain('public_page_revalidate_failed');
  });
});
