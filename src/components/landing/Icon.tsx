import {
  IconAddressBook,
  IconArrowRight,
  IconBrowser,
  IconCalendar,
  IconCalendarCheck,
  IconCalendarEvent,
  IconChartBar,
  IconChartLine,
  IconCircleCheck,
  IconClock,
  IconDroplet,
  IconHandStop,
  IconHourglass,
  IconId,
  IconLayoutGrid,
  IconLeaf,
  IconMinus,
  type IconProps as TablerIconProps,
  IconPlus,
  IconRocket,
  IconScissors,
  IconSparkles,
  IconToolsKitchen2,
  IconUser,
  IconUserCog,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';

/**
 * Tenká fasáda nad Tabler icons (`@tabler/icons-react`). Drží stabilní API
 * (`name`), aby volání na landing page zůstala beze změny. Ikony jsou 24×24,
 * stroke="currentColor"; barvu i velikost řiď přes `className` (např. h-6 w-6).
 *
 * Klíče zachovávají původní názvy; hodnota je konkrétní Tabler komponenta.
 */
export type IconName =
  | 'timer'
  | 'user'
  | 'grid'
  | 'globe'
  | 'calendar'
  | 'users'
  | 'badge'
  | 'bar-chart'
  | 'web'
  | 'edit-calendar'
  | 'contact-page'
  | 'manage-accounts'
  | 'line-chart'
  | 'scissors'
  | 'hand'
  | 'leaf'
  | 'restaurant'
  | 'droplet'
  | 'sparkles'
  | 'hourglass'
  | 'calendar-check'
  | 'check-circle'
  | 'arrow-right'
  | 'rocket'
  | 'plus'
  | 'minus';

const ICONS: Record<IconName, ComponentType<TablerIconProps>> = {
  timer: IconClock,
  user: IconUser,
  grid: IconLayoutGrid,
  globe: IconWorld,
  calendar: IconCalendar,
  users: IconUsers,
  badge: IconId,
  'bar-chart': IconChartBar,
  web: IconBrowser,
  'edit-calendar': IconCalendarEvent,
  'contact-page': IconAddressBook,
  'manage-accounts': IconUserCog,
  'line-chart': IconChartLine,
  scissors: IconScissors,
  hand: IconHandStop,
  leaf: IconLeaf,
  restaurant: IconToolsKitchen2,
  droplet: IconDroplet,
  sparkles: IconSparkles,
  hourglass: IconHourglass,
  'calendar-check': IconCalendarCheck,
  'check-circle': IconCircleCheck,
  'arrow-right': IconArrowRight,
  rocket: IconRocket,
  plus: IconPlus,
  minus: IconMinus,
};

type IconComponentProps = {
  name: IconName;
  className?: string;
  title?: string;
} & TablerIconProps;

export function Icon({ name, className, title, ...props }: IconComponentProps) {
  const TablerIcon = ICONS[name];

  return (
    <TablerIcon
      className={className}
      title={title}
      aria-hidden={title ? undefined : true}
      {...props}
    />
  );
}
