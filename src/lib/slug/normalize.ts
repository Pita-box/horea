import { RESERVED_SLUGS } from './reserved';

export type SlugResult =
  | { kind: 'ok'; value: string }
  | { kind: 'invalid_format'; reason: 'charset' | 'length' | 'hyphens' | 'empty' }
  | { kind: 'reserved' };

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

function canonicalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{Mn}/gu, '')
    .replaceAll(/\s+/g, '-');
}

export function normalizeSlug(input: string): SlugResult {
  const value = canonicalize(input);

  if (!value) {
    return { kind: 'invalid_format', reason: 'empty' };
  }

  if (value.length < MIN_SLUG_LENGTH || value.length > MAX_SLUG_LENGTH) {
    return { kind: 'invalid_format', reason: 'length' };
  }

  if (!SLUG_PATTERN.test(value)) {
    return { kind: 'invalid_format', reason: 'charset' };
  }

  if (value.startsWith('-') || value.endsWith('-') || value.includes('--')) {
    return { kind: 'invalid_format', reason: 'hyphens' };
  }

  if (RESERVED_SLUGS.includes(value as (typeof RESERVED_SLUGS)[number])) {
    return { kind: 'reserved' };
  }

  return { kind: 'ok', value };
}
