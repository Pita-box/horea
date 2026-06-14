import 'server-only';

import { AwsClient } from 'aws4fetch';

/**
 * Tenký klient pro Cloudflare R2 (S3-kompatibilní) přes `aws4fetch`.
 *
 * R2 = zero egress fees + CDN; veřejné čtení přes `R2_PUBLIC_BASE_URL`
 * (r2.dev nebo vlastní doména). Zápis/smazání běží server-side přes S3 API
 * s podpisem SigV4. Klíče jsou jen v server-only modulu.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function endpoint(): string {
  // S3 API endpoint účtu R2.
  return `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  });
}

/** Veřejný URL objektu (bez cache-busting query). */
export function r2PublicUrl(key: string): string {
  const base = requireEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
  return `${base}/${key}`;
}

/** Host veřejné R2 domény (pro `next/image` remotePatterns). */
export function r2PublicHost(): string | null {
  try {
    return new URL(requireEnv('R2_PUBLIC_BASE_URL')).hostname;
  } catch {
    return null;
  }
}

export async function r2PutObject(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const bucket = requireEnv('R2_BUCKET');
  const url = `${endpoint()}/${bucket}/${key}`;
  const response = await client().fetch(url, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': contentType,
      // Dlouhá cache; měníme verzi přes ?v= v uložené URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  if (!response.ok) {
    throw new Error(`R2 PUT failed (${response.status})`);
  }
}

export async function r2DeleteObject(key: string): Promise<void> {
  const bucket = requireEnv('R2_BUCKET');
  const url = `${endpoint()}/${bucket}/${key}`;
  const response = await client().fetch(url, { method: 'DELETE' });

  // 204 = smazáno, 404 = už neexistuje (idempotentní) — obojí OK.
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE failed (${response.status})`);
  }
}

/** Minimální dekódování XML entit v klíčích z ListObjectsV2 odpovědi. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Smaže všechny objekty pod daným prefixem (= „složka" jednoho podniku, např.
 * `{businessId}/`). R2 je plochý storage, prefix funguje jako složka. Použito při
 * smazání podniku — odstraní logo, cover i fotky zaměstnanců jedním voláním.
 *
 * Listuje přes S3 ListObjectsV2 (s paginací) a maže objekty po jednom (počty na
 * podnik jsou malé → bez potřeby batch DeleteObjects + Content-MD5).
 */
export async function r2DeleteByPrefix(prefix: string): Promise<void> {
  const bucket = requireEnv('R2_BUCKET');
  const aws = client();
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({ 'list-type': '2', prefix });
    if (continuationToken) {
      params.set('continuation-token', continuationToken);
    }
    const listUrl = `${endpoint()}/${bucket}?${params.toString()}`;
    const response = await aws.fetch(listUrl, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`R2 LIST failed (${response.status})`);
    }

    const xml = await response.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) =>
      decodeXmlEntities(match[1]),
    );

    for (const key of keys) {
      await r2DeleteObject(key);
    }

    const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
    continuationToken = truncated
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (continuationToken);
}
