import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureTabs } from '../FeatureTabs';

const playMock = vi.fn().mockResolvedValue(undefined);
const pauseMock = vi.fn();

class VisibleIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.35];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  private readonly callback: IntersectionObserverCallback;

  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
  }

  disconnect() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

function setMotionPreference(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setMotionPreference(false);
  vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(playMock);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pauseMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FeatureTabs videa', () => {
  it('přepne zdroj videa a nový klip spustí od začátku', async () => {
    render(<FeatureTabs />);

    const publicVideo = screen.getByLabelText('Veřejná webová stránka a online rezervace');
    expect(publicVideo.getAttribute('src')).toBe('/media/horea-motion/horea-public-motion.mp4');
    await waitFor(() => expect(playMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('tab', { name: 'Správa rezervací' }));

    const reservationVideo = screen.getByLabelText('Správa a úprava rezervací v kalendáři');
    expect(reservationVideo.getAttribute('src')).toBe(
      '/media/horea-motion/horea-reservations-motion.mp4',
    );
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2));
    expect(pauseMock).toHaveBeenCalled();
  });

  it('při preferenci omezeného pohybu video automaticky nespustí', async () => {
    setMotionPreference(true);
    render(<FeatureTabs />);

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Veřejná webová stránka' })).toBeTruthy());
    expect(playMock).not.toHaveBeenCalled();
  });
});
