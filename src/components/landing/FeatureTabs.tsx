'use client';

import { useState } from 'react';

import { Icon, type IconName } from './Icon';

type Tab = {
  tabIcon: IconName;
  tabIconClass: string;
  /** Pozadí aktivního tabu = barva ikonky daného tabu. */
  activeBgClass: string;
  /** Barva ikonky + textu aktivního tabu (kontrast vůči activeBgClass). */
  activeFgClass: string;
  tabLabel: string;
  panelIcon: IconName;
  panelIconClass: string;
  panelBgClass: string;
  title: string;
  body: string;
};

const TABS: Tab[] = [
  {
    tabIcon: 'globe',
    tabIconClass: 'text-[var(--color-action-violet)]',
    activeBgClass: 'bg-[var(--color-action-violet)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Veřejná webová stránka',
    panelIcon: 'web',
    panelIconClass: 'text-[var(--color-action-violet)]',
    panelBgClass: 'bg-[color-mix(in_srgb,var(--color-action-violet)_10%,white)]',
    title: 'Vaše vizitka online',
    body: 'Krásný, responzivní profil, který reprezentuje váš podnik a přijímá rezervace nonstop.',
  },
  {
    tabIcon: 'calendar',
    tabIconClass: 'text-[var(--color-neon-pink)]',
    activeBgClass: 'bg-[var(--color-neon-pink)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Správa rezervací',
    panelIcon: 'edit-calendar',
    panelIconClass: 'text-[var(--color-neon-pink)]',
    panelBgClass: 'bg-[color-mix(in_srgb,var(--color-sunset-pink)_10%,white)]',
    title: 'Převezměte kontrolu nad kalendářem',
    body: 'Snadno spravujte, přesouvejte a potvrzujte rezervace v intuitivním rozhraní.',
  },
  {
    tabIcon: 'users',
    tabIconClass: 'text-[var(--color-aqua-blue)]',
    activeBgClass: 'bg-[var(--color-aqua-blue)]',
    activeFgClass: 'text-[var(--color-rich-violet)]',
    tabLabel: 'Správa klientů',
    panelIcon: 'contact-page',
    panelIconClass: 'text-[var(--color-aqua-blue)]',
    panelBgClass: 'bg-[color-mix(in_srgb,var(--color-air-blue)_10%,white)]',
    title: 'Poznejte své zákazníky',
    body: 'Uchovávejte historii návštěv, poznámky a preference pro personalizovaný přístup ke každému klientovi.',
  },
  {
    tabIcon: 'badge',
    tabIconClass: 'text-[var(--color-electric-green)]',
    activeBgClass: 'bg-[var(--color-electric-green)]',
    activeFgClass: 'text-[var(--color-rich-violet)]',
    tabLabel: 'Správa zaměstnanců',
    panelIcon: 'manage-accounts',
    panelIconClass: 'text-[var(--color-electric-green)]',
    panelBgClass: 'bg-[color-mix(in_srgb,var(--color-lush-green)_20%,white)]',
    title: 'Tým v dokonalé harmonii',
    body: 'Přiřaďte služby konkrétním zaměstnancům a spravujte jejich individuální pracovní dobu.',
  },
  {
    tabIcon: 'bar-chart',
    tabIconClass: 'text-[var(--color-action-violet)]',
    activeBgClass: 'bg-[var(--color-action-violet)]',
    activeFgClass: 'text-[var(--color-canvas-white)]',
    tabLabel: 'Statistika uskutečněných návštěv',
    panelIcon: 'line-chart',
    panelIconClass: 'text-[var(--color-action-violet)]',
    panelBgClass: 'bg-[color-mix(in_srgb,var(--color-action-violet)_10%,white)]',
    title: 'Sledujte svůj růst',
    body: 'Získejte přehled o svých nejlepších službách, vytíženosti a finančních výsledcích v reálném čase.',
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const activeTab = TABS[active];

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
        id={`feature-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`feature-tab-${active}`}
        className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] p-[32px] lg:aspect-auto lg:h-[500px] lg:w-2/3 ${activeTab.panelBgClass}`}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-[16px] text-center">
          <Icon
            name={activeTab.panelIcon}
            className={`mb-[16px] h-[64px] w-[64px] ${activeTab.panelIconClass}`}
          />
          <h3 className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]">
            {activeTab.title}
          </h3>
          <p className="max-w-md font-[var(--font-plus-jakarta-sans)] text-lg text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
            {activeTab.body}
          </p>
        </div>
      </div>
    </div>
  );
}
