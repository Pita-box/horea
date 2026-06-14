import { Badge, Button, Card, Checkbox, Input, Notice } from '@/components/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Komponenty | Horea',
  description: 'Interní přehled UI komponent Horea.',
};

const swatches = [
  ['Canvas White', 'var(--color-canvas-white)'],
  ['Cloud Mist', 'var(--color-cloud-mist)'],
  ['Slate Text', 'var(--color-slate-text)'],
  ['Rich Violet', 'var(--color-rich-violet)'],
  ['Action Violet', 'var(--color-action-violet)'],
  ['Air Blue', 'var(--color-air-blue)'],
  ['Lush Green', 'var(--color-lush-green)'],
  ['Sunset Pink', 'var(--color-sunset-pink)'],
  ['Neon Pink', 'var(--color-neon-pink)'],
  ['Aqua Blue', 'var(--color-aqua-blue)'],
  ['Electric Green', 'var(--color-electric-green)'],
  ['Soft Gray Fill', 'var(--color-soft-gray-fill)'],
] as const;

function ComponentBlock({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 border-t border-[var(--color-border-vychozi)] pt-[var(--section-gap)]">
      <h2 className="font-[var(--font-polysans)] text-[var(--text-heading-sm)] font-semibold leading-[var(--leading-heading-sm)] text-[var(--color-rich-violet)]">
        {name}
      </h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-[var(--color-slate-text)]">{children}</p>;
}

export default function ComponentsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas-white)] px-5 py-12 text-[var(--color-slate-text)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--section-gap)]">
        <header className="space-y-5">
          <Badge>UI katalog</Badge>
          <div className="max-w-3xl space-y-5">
            <h1 className="font-[var(--font-polysans)] text-[58px] font-semibold leading-[1.1] text-[var(--color-rich-violet)] max-sm:text-[38px]">
              Komponenty Horea
            </h1>
            <p className="text-[var(--text-body)] leading-[1.6]">
              Přehled aktuálních komponent a jejich tokenů podle lokálního design systému. Každý
              blok má název komponenty pro snadné reportování UI připomínek.
            </p>
          </div>
        </header>

        <ComponentBlock name="Design Tokens: Color Swatches">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {swatches.map(([name, color]) => (
              <div key={name} className="space-y-[var(--element-gap)]">
                <div
                  className="h-[80px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)]"
                  style={{ background: color }}
                />
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-sm text-[var(--color-slate-text)]">{color}</p>
              </div>
            ))}
          </div>
        </ComponentBlock>

        <ComponentBlock name="Typography">
          <div className="grid gap-[var(--section-gap)] lg:grid-cols-2">
            <div className="space-y-5">
              <Label>PolySans / headline</Label>
              <p className="font-[var(--font-polysans)] text-[38px] font-semibold leading-[1.1] text-[var(--color-rich-violet)]">
                Rezervace bez zmatku
              </p>
              <p className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] text-[var(--color-rich-violet)]">
                Rychlý přehled dne
              </p>
            </div>
            <div className="space-y-5">
              <Label>Plus Jakarta Sans / body</Label>
              <p className="text-[var(--text-body-lg)] leading-[1.6]">
                Ukázkový odstavec pro kontrolu čitelnosti, rytmu a šířky řádku v aplikačním UI.
              </p>
              <p className="text-[var(--text-body-sm)] leading-[1.6]">
                Menší text pro formuláře, popisky a sekundární informace.
              </p>
            </div>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Button">
          <div className="flex flex-wrap items-center gap-[var(--element-gap)]">
            <Button>Primary Action Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="outline">Outline Nav Button</Button>
            <Button variant="icon" aria-label="Icon Button">
              ?
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Call-to-Action Link">
          <a
            href="#"
            className="text-base font-medium text-[var(--color-action-violet)] hover:underline"
          >
            Zobrazit detail rezervace
          </a>
        </ComponentBlock>

        <ComponentBlock name="Badge">
          <div className="flex flex-wrap gap-[var(--element-gap)]">
            <Badge>Outline Badge</Badge>
            <Badge className="text-[var(--color-aqua-blue)]">Aqua Badge</Badge>
            <Badge className="text-[var(--color-electric-green)]">Success Badge</Badge>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Input">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
              Text input
              <Input className="mt-2" placeholder="Salon Růženka" />
            </label>
            <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
              Email input
              <Input className="mt-2" type="email" placeholder="jmeno@firma.cz" />
            </label>
            <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
              Password input
              <Input className="mt-2" type="password" placeholder="Alespoň 8 znaků" />
            </label>
            <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
              Disabled input
              <Input className="mt-2" disabled placeholder="Nelze upravit" />
            </label>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Checkbox">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex gap-[var(--spacing-12)] text-sm leading-6 text-[var(--color-slate-text)]">
              <Checkbox defaultChecked />
              <span>Souhlasím se zpracováním dat.</span>
            </label>
            <label className="flex gap-[var(--spacing-12)] text-sm leading-6 text-[var(--color-slate-text)]">
              <Checkbox />
              <span>Zůstat přihlášen.</span>
            </label>
            <label className="flex gap-[var(--spacing-12)] text-sm leading-6 text-[var(--color-slate-text)]">
              <Checkbox disabled />
              <span>Zakázaný checkbox.</span>
            </label>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Notice">
          <div className="grid gap-5 md:grid-cols-2">
            <Notice role="status">Pokud účet existuje, poslali jsme email s odkazem.</Notice>
            <Notice role="alert" variant="error">
              Zadejte platný email.
            </Notice>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Card: Feature Card">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="overflow-hidden border border-[var(--color-border-vychozi)]">
              <div className="aspect-[4/3] bg-[var(--color-air-blue)]" />
              <div className="space-y-5 p-[var(--card-padding)]">
                <Badge>New Feature</Badge>
                <h3 className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] text-[var(--color-rich-violet)]">
                  Kalendář dne
                </h3>
                <p className="text-base leading-[1.6]">
                  Placeholder obsah pro informační kartu s produktem nebo vizuálem.
                </p>
              </div>
            </Card>
            <Card className="overflow-hidden border border-[var(--color-border-vychozi)]">
              <div className="aspect-[4/3] bg-[var(--color-lush-green)]" />
              <div className="space-y-5 p-[var(--card-padding)]">
                <Badge className="text-[var(--color-aqua-blue)]">Náhled</Badge>
                <h3 className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] text-[var(--color-rich-violet)]">
                  Profil podniku
                </h3>
                <p className="text-base leading-[1.6]">
                  Placeholder text pro veřejnou stránku podniku a základní metadata.
                </p>
              </div>
            </Card>
            <Card className="overflow-hidden border border-[var(--color-border-vychozi)]">
              <div className="aspect-[4/3] bg-[var(--color-sunset-pink)]" />
              <div className="space-y-5 p-[var(--card-padding)]">
                <Badge className="text-[var(--color-electric-green)]">Active</Badge>
                <h3 className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] text-[var(--color-rich-violet)]">
                  Služby
                </h3>
                <p className="text-base leading-[1.6]">
                  Ukázka karty s placeholder obsahem pro opakované položky v UI.
                </p>
              </div>
            </Card>
          </div>
        </ComponentBlock>

        <ComponentBlock name="Gradient Accent Card">
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-[var(--radius-full-2)] bg-[var(--color-air-blue)] p-[var(--spacing-48)]">
              <p className="font-[var(--font-polysans)] text-[28px] font-semibold text-[var(--color-rich-violet)]">
                Air Blue
              </p>
            </div>
            <div className="rounded-[var(--radius-full-2)] bg-[var(--color-lush-green)] p-[var(--spacing-48)]">
              <p className="font-[var(--font-polysans)] text-[28px] font-semibold text-[var(--color-rich-violet)]">
                Lush Green
              </p>
            </div>
            <div className="rounded-[var(--radius-full-2)] bg-[var(--color-sunset-pink)] p-[var(--spacing-48)]">
              <p className="font-[var(--font-polysans)] text-[28px] font-semibold text-[var(--color-rich-violet)]">
                Sunset Pink
              </p>
            </div>
          </div>
        </ComponentBlock>

        <ComponentBlock name="DpaModal">
          <div className="rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-soft-gray-fill)] p-5">
            <div className="mx-auto flex w-full max-w-[680px] flex-col rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)]">
              <div className="space-y-[var(--element-gap)] border-b border-[var(--color-border-vychozi)] px-[var(--card-padding)] py-6">
                <p className="text-sm font-semibold text-[var(--color-action-violet)]">
                  Aktualizace DPA
                </p>
                <h3 className="font-[var(--font-polysans)] text-2xl font-semibold text-[var(--color-rich-violet)]">
                  Potvrďte aktuální smlouvu o zpracování dat
                </h3>
                <p className="text-sm leading-6">
                  Bez potvrzení nové verze nelze pokračovat v dashboardu ani onboardingu.
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-[var(--card-padding)] py-6 text-sm leading-6">
                Data Processing Agreement Horea
                {'\n\n'}Placeholder text smlouvy pro vizuální kontrolu modalu.
              </div>
              <div className="flex flex-col gap-[var(--element-gap)] border-t border-[var(--color-border-vychozi)] px-[var(--card-padding)] py-6 sm:flex-row sm:justify-end">
                <Button variant="ghost">Odmítnout</Button>
                <Button>Akceptuji</Button>
              </div>
            </div>
          </div>
        </ComponentBlock>
      </div>
    </main>
  );
}
