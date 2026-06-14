import { revalidatePath } from 'next/cache';

import { log } from './log';

function publicPathForSlug(slug: string): string {
  const normalizedSlug = slug.trim().replace(/^\/+/, '');
  return `/${normalizedSlug}`;
}

export function revalidatePublicPage(slug: string): void {
  try {
    revalidatePath(publicPathForSlug(slug));
  } catch (error) {
    log.warn('public_page_revalidate_failed', { error, slug });
  }
}
