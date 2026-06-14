'use client';

import { IconSend } from '@tabler/icons-react';
import { useState } from 'react';

import { Notice } from '@/components/ui/notice';

/**
 * Kontaktní formulář marketingové stránky. Odesílá data na `POST /api/contact`,
 * který je server-side zvaliduje a přepošle podpoře e-mailem přes Resend.
 */
const labelClass = 'font-[var(--font-plus-jakarta-sans)] text-sm font-semibold text-[var(--color-rich-violet)]';
const fieldClass =
  'w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-3 py-3 font-[var(--font-plus-jakarta-sans)] text-base text-[var(--color-slate-text)] transition-colors focus:border-[var(--color-action-violet)] focus:outline-none focus:ring-1 focus:ring-[var(--color-action-violet)] disabled:opacity-60';

type Status = 'idle' | 'sending' | 'success' | 'error';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const sending = status === 'sending';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(data?.message ?? 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu.');
        return;
      }

      setStatus('success');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      setStatus('error');
      setErrorMessage('Zprávu se nepodařilo odeslat. Zkontrolujte připojení a zkuste to znovu.');
    }
  }

  return (
    <form className="flex flex-col gap-[16px]" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor="contact-name">
          Celé jméno
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          required
          maxLength={120}
          disabled={sending}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jan Novák"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor="contact-email">
          Emailová adresa
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={200}
          disabled={sending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jan@priklad.cz"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor="contact-subject">
          Předmět
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          required
          maxLength={200}
          disabled={sending}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="S čím potřebujete poradit?"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor="contact-message">
          Vaše zpráva
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          maxLength={5000}
          rows={4}
          disabled={sending}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Popište nám svůj problém detailněji…"
          className={`${fieldClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={sending}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-[5px] rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-3 font-[var(--font-plus-jakarta-sans)] text-base font-semibold text-[var(--color-canvas-white)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sending ? 'Odesílám…' : 'Odeslat zprávu'}
        {sending ? null : <IconSend size={20} stroke={2} aria-hidden="true" />}
      </button>

      {status === 'success' ? (
        <Notice role="status" variant="neutral">
          Děkujeme! Vaše zpráva byla odeslána, ozveme se co nejdříve.
        </Notice>
      ) : null}
      {status === 'error' ? (
        <Notice role="alert" variant="error">
          {errorMessage}
        </Notice>
      ) : null}
    </form>
  );
}
