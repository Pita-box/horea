import { Card } from '@/components/ui/card';
import { FaqAccordion } from '@/components/landing/FaqAccordion';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nápověda | Horea',
  description: 'Často kladené otázky a nápověda k dashboardu Horea.',
};

const DASHBOARD_FAQ = [
  {
    question: 'Jak schvaluji rezervace?',
    answer:
      'V sekci Rezervace vidíte čekající rezervace a můžete je schválit nebo odmítnout. V Nastavení lze zapnout automatické schvalování, pak se rezervace potvrzují samy.',
  },
  {
    question: 'Jak zveřejním svůj veřejný profil?',
    answer:
      'Profil se zveřejní po aktivaci předplatného. Po publikaci je dostupný na adrese horea.cz/váš-slug a můžete ji sdílet s klienty.',
  },
  {
    question: 'Kde upravím otevírací dobu a služby?',
    answer:
      'Otevírací dobu spravujete v sekci Otevírací doba, služby a jejich ceny v sekci Služby. Změny se projeví na veřejném profilu i v rezervačním formuláři.',
  },
  {
    question: 'Jak fungují platby a předplatné?',
    answer:
      'Předplatné a faktury najdete v sekci Předplatné. Platby probíhají přes platební bránu GoPay; detail tarifů je na stránce Předplatné.',
  },
  {
    question: 'Jak najdu konkrétního klienta?',
    answer:
      'Použijte vyhledávání v horní liště — hledá podle jména, e-mailu i telefonu. Kompletní seznam klientů je v sekci Klienti.',
  },
  {
    question: 'Potřebuji další pomoc.',
    answer:
      'Napište nám přes kontaktní formulář na stránce Kontakt — rádi pomůžeme s nastavením i provozem.',
  },
];

export default function DashboardFaqPage() {
  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <FaqAccordion items={DASHBOARD_FAQ} />
      </Card>
    </div>
  );
}
