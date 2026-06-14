'use client';

import { IconUpload, IconX } from '@tabler/icons-react';
import Image from 'next/image';
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';

import {
  removeProfileImageAction,
  updateCoverPositionAction,
  uploadProfileImageAction,
  type ProfileImageKind,
  type ProfileImages,
} from './profile-actions';

type ProfileImagesFormProps = {
  initialImages: ProfileImages;
  businessName: string;
};

const HINT = 'JPG, PNG nebo WebP, max 5 MB. Obrázek se převede na WebP a zmenší.';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export function ProfileImagesForm({ initialImages, businessName }: ProfileImagesFormProps) {
  const { showToast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string | null>(initialImages.logoUrl);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialImages.coverUrl);
  const [coverPos, setCoverPos] = useState<number>(initialImages.coverPosition);
  const [error, setError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<ProfileImageKind | null>(null);
  const [, startTransition] = useTransition();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null);

  function setUrl(kind: ProfileImageKind, url: string | null) {
    if (kind === 'logo') {
      setLogoUrl(url);
    } else {
      setCoverUrl(url);
    }
  }

  function handleFile(kind: ProfileImageKind, file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    setPendingKind(kind);
    const formData = new FormData();
    formData.append('file', file);
    startTransition(() => {
      void uploadProfileImageAction(kind, formData).then((result) => {
        setPendingKind(null);
        if (result.ok) {
          setUrl(kind, result.url);
          showToast(kind === 'logo' ? 'Logo nahráno.' : 'Úvodní fotka nahrána.');
        } else {
          setError(result.message);
        }
      });
    });
  }

  function handleRemove(kind: ProfileImageKind) {
    setError(null);
    setPendingKind(kind);
    startTransition(() => {
      void removeProfileImageAction(kind).then((result) => {
        setPendingKind(null);
        if (result.ok) {
          setUrl(kind, null);
          showToast(kind === 'logo' ? 'Logo smazáno.' : 'Úvodní fotka smazána.');
        } else {
          setError(result.message);
        }
      });
    });
  }

  // --- Drag pozice coveru (object-position Y) ---
  function onCoverPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!coverUrl) {
      return;
    }
    dragRef.current = { startY: event.clientY, startPos: coverPos };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCoverPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const box = coverBoxRef.current;
    if (!drag || !box) {
      return;
    }
    const height = box.clientHeight || 1;
    const deltaY = event.clientY - drag.startY;
    // Táhnutí dolů odhalí horní část → pozice klesá.
    const next = Math.max(0, Math.min(100, drag.startPos - (deltaY / height) * 100));
    setCoverPos(next);
  }

  function onCoverPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    const rounded = Math.round(coverPos);
    startTransition(() => {
      void updateCoverPositionAction(rounded).then((result) => {
        if (result.ok) {
          showToast('Pozice fotky uložena.');
        } else {
          setError(result.message);
        }
      });
    });
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-24)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">Vzhled profilu</h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Logo (avatar) a cover obrázek se zobrazují na vašem veřejném profilu.
        </p>
      </div>

      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      {/* Avatar / logo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 shrink-0">
          <div className="h-24 w-24 overflow-hidden rounded-full border border-[var(--color-input-border)] bg-[var(--color-air-blue)]">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo podniku"
                width={96}
                height={96}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[24px] font-semibold text-[var(--color-rich-violet)]">
                {initials(businessName)}
              </span>
            )}
          </div>
          {logoUrl ? (
            <button
              type="button"
              aria-label="Smazat logo"
              onClick={() => handleRemove('logo')}
              disabled={pendingKind !== null}
              className="absolute -right-1 -top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)] shadow-sm transition-colors hover:text-[var(--color-neon-pink)]"
            >
              <IconX size={16} stroke={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-slate-text)]">Logo vašeho podniku (profilová fotka)</span>
          <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
            {HINT}
          </span>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => handleFile('logo', event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="ghost"
            className="w-fit"
            onClick={() => logoInputRef.current?.click()}
            disabled={pendingKind !== null}
          >
            <IconUpload size={18} stroke={2} aria-hidden="true" />
            {pendingKind === 'logo' ? 'Nahrávám…' : logoUrl ? 'Změnit' : 'Nahrát'}
          </Button>
        </div>
      </div>

      {/* Cover */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-[var(--color-slate-text)]">Úvodní fotka</span>
        <div className="relative">
          <div
            ref={coverBoxRef}
            onPointerDown={onCoverPointerDown}
            onPointerMove={onCoverPointerMove}
            onPointerUp={onCoverPointerUp}
            className={[
              'h-40 w-full overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-input-border)] bg-[var(--color-soft-gray-fill)]',
              coverUrl ? 'cursor-ns-resize touch-none select-none' : '',
            ].join(' ')}
          >
            {coverUrl ? (
              // Náhled s živou pozicí (object-position Y) — drag ji upravuje.
              // eslint-disable-next-line @next/next/no-img-element -- živý náhled s dynamickým object-position
              <img
                src={coverUrl}
                alt="Cover obrázek"
                draggable={false}
                className="h-full w-full object-cover"
                style={{ objectPosition: `center ${coverPos}%` }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                Začněte nahrávat úvodní fotku.
              </span>
            )}
          </div>
          {coverUrl ? (
            <button
              type="button"
              aria-label="Smazat cover"
              onClick={() => handleRemove('cover')}
              disabled={pendingKind !== null}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)] shadow-sm transition-colors hover:text-[var(--color-neon-pink)]"
            >
              <IconX size={16} stroke={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          {coverUrl ? 'Kliknutím a přetážením v náhledu nahoru/dolů pro úpravu pozice (vhodné pro fotky na výšku). ' : ''}
          {HINT}
        </span>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => handleFile('cover', event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="ghost"
          className="w-fit"
          onClick={() => coverInputRef.current?.click()}
          disabled={pendingKind !== null}
        >
          <IconUpload size={18} stroke={2} aria-hidden="true" />
          {pendingKind === 'cover' ? 'Nahrávám…' : coverUrl ? 'Změnit' : 'Nahrát'}
        </Button>
      </div>
    </div>
  );
}
