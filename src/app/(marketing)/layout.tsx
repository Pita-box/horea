import { PublicFooter } from '@/components/landing/PublicFooter';
import { PublicHeader } from '@/components/landing/PublicHeader';

/**
 * Layout veřejných (marketingových) stránek Horea — homepage a budoucí stránky
 * jako Obchodní podmínky, Kontakt, Blog. Poskytuje sdílený plovoucí header
 * a patičku. Auth stránky, veřejná stránka podniku ([slug]) ani dashboard tento
 * layout NEPOUŽÍVAJÍ (leží mimo skupinu (marketing)).
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-cloud-mist)] text-[var(--color-slate-text)]">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
