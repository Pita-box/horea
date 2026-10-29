'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon, type IconName } from './Icon';

type Tab = {
  tabIcon: IconName;
  tabIconClass: string;
  /** Pozadí aktivního tabu = barva ikonky daného tabu. */
  activeBgClass: string;
  /** Barva ikonky + textu aktivního tabu (kontrast vůči activeBgClass). */
  activeFgClass: string;
  tabLabel: string;
  videoSrc: string;
  posterSrc: string;
  videoLabel: string;
};

const TABS: Tab[] = [
  {
    tabIcon: 'globe',
    tabIconClass: 'text-[var(--color-action-violet)]',
    activeBgClass: 'bg-[var(--color-action-violet)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Veřejná webová stránka',
    videoSrc: '/media/horea-motion/horea-public-motion.mp4',
    posterSrc: '/media/horea-motion/horea-public-poster.jpg',
    videoLabel: 'Veřejná webová stránka a online rezervace',
  },
  {
    tabIcon: 'calendar',
    tabIconClass: 'text-[var(--color-neon-pink)]',
    activeBgClass: 'bg-[var(--color-neon-pink)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Správa rezervací',
    videoSrc: '/media/horea-motion/horea-reservations-motion.mp4',
    posterSrc: '/media/horea-motion/horea-reservations-poster.jpg',
    videoLabel: 'Správa a úprava rezervací v kalendáři',
  },
  {
    tabIcon: 'users',
    tabIconClass: 'text-[var(--color-aqua-blue)]',
    activeBgClass: 'bg-[var(--color-aqua-blue)]',
    activeFgClass: 'text-[var(--color-rich-violet)]',
    tabLabel: 'Správa klientů',
    videoSrc: '/media/horea-motion/horea-clients-motion.mp4',
    posterSrc: '/media/horea-motion/horea-clients-poster.jpg',
    videoLabel: 'Správa klientů a historie rezervací',
  },
  {
    tabIcon: 'badge',
    tabIconClass: 'text-[var(--color-electric-green)]',
    activeBgClass: 'bg-[var(--color-electric-green)]',
    activeFgClass: 'text-[var(--color-rich-violet)]',
    tabLabel: 'Správa zaměstnanců',
    videoSrc: '/media/horea-motion/horea-team-motion.mp4',
    posterSrc: '/media/horea-motion/horea-team-poster.jpg',
    videoLabel: 'Správa zaměstnanců a přiřazení služeb',
  },
  {
    tabIcon: 'bar-chart',
    tabIconClass: 'text-[var(--color-action-violet)]',
    activeBgClass: 'bg-[var(--color-action-violet)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Statistika uskutečněných návštěv',
    videoSrc: '/media/horea-motion/horea-analytics-motion.mp4',
    posterSrc: '/media/horea-motion/horea-analytics-poster.jpg',
    videoLabel: 'Statistiky uskutečněných návštěv a nejvýdělečnějších služeb',
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeTab = TABS[active];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);
    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
    if (isVisible && !reduceMotion) {
      void video.play().catch(() => undefined);
    }
  }, [active, isVisible, reduceMotion]);

  return (
    <div className="flex flex-col items-start gap-[var(--section-gap)] lg:flex-row">
      {/* Tabs list */}
      <div
        className="flex w-full flex-col gap-2 lg:w-1/3"
        role="tablist"
        aria-label="Funkce platformy"
      >
        {TABS.map((tab, index) => {
          const isActive = index === active;
          return (
            <button
              key={tab.tabLabel}
              type="button"
              role="tab"
              id={`feature-tab-${index}`}
              aria-selected={isActive}
              aria-controls={`feature-panel-${index}`}
              onClick={() => setActive(index)}
              className={`flex min-h-[44px] items-center gap-2 rounded-[var(--radius-buttons)] border border-transparent p-[16px] text-left transition-all duration-200 ${
                isActive
                  ? `${tab.activeBgClass} shadow-sm`
                  : 'hover:bg-[var(--color-cloud-mist)]'
              }`}
            >
              <Icon
                name={tab.tabIcon}
                className={`h-6 w-6 shrink-0 ${isActive ? tab.activeFgClass : tab.tabIconClass}`}
              />
              <span
                className={`font-[var(--font-plus-jakarta-sans)] text-xl font-semibold ${
                  isActive ? tab.activeFgClass : 'text-[var(--color-rich-violet)]'
                }`}
              >
                {tab.tabLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      <div
        ref={panelRef}
        id={`feature-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`feature-tab-${active}`}
        className="aspect-video w-full overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-rich-violet)] lg:w-2/3"
      >
        <video
          key={activeTab.videoSrc}
          ref={videoRef}
          src={activeTab.videoSrc}
          poster={activeTab.posterSrc}
          aria-label={activeTab.videoLabel}
          className="h-full w-full object-cover"
          controls
          loop
          muted
          playsInline
          preload="metadata"
        >
          Váš prohlížeč nepodporuje přehrávání videa.
        </video>
      </div>
    </div>
  );
}
