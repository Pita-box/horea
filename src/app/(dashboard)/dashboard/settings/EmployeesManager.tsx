'use client';

import { IconPencil, IconPlus, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

import {
  createEmployeeAction,
  deleteEmployeeAction,
  setTeamSettingAction,
  updateEmployeeAction,
  uploadEmployeePhotoAction,
  type Employee,
  type TeamSettings,
} from './employee-actions';

type EmployeesManagerProps = {
  initialEmployees: Employee[];
  initialSettings: TeamSettings;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export function EmployeesManager({ initialEmployees, initialSettings }: EmployeesManagerProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [showTeam, setShowTeam] = useState(initialSettings.showTeamPublic);
  const [allowSelect, setAllowSelect] = useState(initialSettings.allowEmployeeSelection);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const employees = initialEmployees;
  const hasEmployees = employees.length >= 1;

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    after?: () => void,
    successMsg?: string,
  ) {
    setError(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.ok) {
          after?.();
          if (successMsg) {
            showToast(successMsg);
          }
          router.refresh();
        } else {
          setError(result.message ?? 'Operaci se nepodařilo dokončit.');
        }
      });
    });
  }

  function handleAdd() {
    if (!newName.trim()) {
      setError('Zadejte jméno zaměstnance.');
      return;
    }
    const fd = new FormData();
    fd.append('name', newName);
    fd.append('role', newRole);
    run(
      () => createEmployeeAction(fd),
      () => {
        setNewName('');
        setNewRole('');
      },
      'Zaměstnanec přidán.',
    );
  }

  function handleSaveEdit(id: string) {
    const fd = new FormData();
    fd.append('name', editName);
    fd.append('role', editRole);
    run(
      () => updateEmployeeAction(id, fd),
      () => setEditingId(null),
      'Změny uloženy.',
    );
  }

  function handlePhoto(id: string, file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    run(() => uploadEmployeePhotoAction(id, fd), undefined, 'Fotka nahrána.');
  }

  /** Nejdřív přehraje leave animaci řádku, teprve pak provede skutečné smazání. */
  function handleDelete(id: string) {
    if (isPending || removingId) return;
    setRemovingId(id);
    window.setTimeout(() => {
      setError(null);
      startTransition(() => {
        void deleteEmployeeAction(id).then((result) => {
          if (result.ok) {
            // Po refreshi řádek z dat zmizí (zůstává schovaný díky animaci).
            showToast('Zaměstnanec smazán.');
            router.refresh();
          } else {
            // Chyba → vrátíme řádek zpět a ukážeme hlášku.
            setRemovingId(null);
            setError(result.message ?? 'Operaci se nepodařilo dokončit.');
          }
        });
      });
    }, 240);
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-24)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">Zaměstnanci</h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Spravujte tým podniku. Více zaměstnanců odemkne zobrazení na profilu a výběr při rezervaci.
        </p>
      </div>

      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      {/* Seznam zaměstnanců */}
      {employees.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {employees.map((emp) => {
            const editing = editingId === emp.id;
            return (
              <li
                key={emp.id}
                className={[
                  'flex flex-col gap-3 rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] p-4 sm:flex-row sm:items-center',
                  removingId === emp.id ? 'animate-row-leave' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[var(--color-input-border)] bg-[var(--color-air-blue)]">
                    {emp.photoUrl ? (
                      <Image
                        src={emp.photoUrl}
                        alt={emp.name}
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--color-rich-violet)]">
                        {initials(emp.name)}
                      </span>
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      photoRefs.current[emp.id] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handlePhoto(emp.id, e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => photoRefs.current[emp.id]?.click()}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-action-violet)] hover:underline"
                  >
                    <IconUpload size={16} stroke={2} aria-hidden="true" />
                    Foto
                  </button>
                </div>

                {editing ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Jméno a příjmení"
                      disabled={isPending}
                    />
                    <Input
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      placeholder="Pozice"
                      disabled={isPending}
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="font-medium text-[var(--color-slate-text)]">{emp.name}</p>
                    {emp.role ? (
                      <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                        {emp.role}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(emp.id)}
                        disabled={isPending}
                      >
                        Uložit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        disabled={isPending}
                      >
                        <IconX size={18} stroke={2} aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="Upravit"
                        onClick={() => {
                          setEditingId(emp.id);
                          setEditName(emp.name);
                          setEditRole(emp.role ?? '');
                        }}
                        disabled={isPending}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
                      >
                        <IconPencil size={18} stroke={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Smazat"
                        onClick={() => handleDelete(emp.id)}
                        disabled={isPending || removingId !== null}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-slate-text)] transition-colors hover:text-[var(--color-neon-pink)]"
                      >
                        <IconTrash size={18} stroke={2} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Zatím nemáte žádné zaměstnance.
        </p>
      )}

      {/* Přidat zaměstnance */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-buttons)] border border-dashed border-[var(--color-input-border)] p-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Jméno a příjmení"
            disabled={isPending}
          />
          <Input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Pozice (např. Kadeřník)"
            disabled={isPending}
          />
        </div>
        <Button type="button" onClick={handleAdd} disabled={isPending}>
          <IconPlus size={18} stroke={2} aria-hidden="true" />
          Přidat
        </Button>
      </div>

      {/* Přepínače — dostupné, jakmile je aspoň jeden zaměstnanec */}
      {hasEmployees ? (
        <div className="flex flex-col gap-4 border-t border-[var(--color-border-vychozi)] pt-[var(--spacing-24)]">
          <label className="flex items-start justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Zobrazit tým na veřejném profilu
              </span>
              <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                Sekce Náš tým s fotkou, jménem a pozicí.
              </span>
            </span>
            <Switch
              checked={showTeam}
              disabled={isPending}
              onChange={(e) => {
                const value = e.target.checked;
                setShowTeam(value);
                run(
                  () => setTeamSettingAction('showTeamPublic', value),
                  undefined,
                  'Nastavení uloženo.',
                );
              }}
            />
          </label>

          <label className="flex items-start justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Výběr zaměstnance při rezervaci
              </span>
              <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                Klient si při rezervaci může vybrat konkrétního zaměstnance.
              </span>
            </span>
            <Switch
              checked={allowSelect}
              disabled={isPending}
              onChange={(e) => {
                const value = e.target.checked;
                setAllowSelect(value);
                run(
                  () => setTeamSettingAction('allowEmployeeSelection', value),
                  undefined,
                  'Nastavení uloženo.',
                );
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
