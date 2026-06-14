import 'server-only';

import sharp from 'sharp';

/**
 * Serverové zpracování nahraného obrázku: převod na WebP + zmenšení.
 *  - `logo` (avatar): vejde se do 512×512.
 *  - `cover`: max šířka 1600 px (výška dle poměru).
 * Cíl: malé soubory pro rychlý profil a úsporu úložiště/egressu.
 */
export type ImageKind = 'logo' | 'cover';

const MAX = {
  logo: { width: 512, height: 512 },
  cover: { width: 1600, height: 1600 },
} as const;

const WEBP_QUALITY = 82;

export async function processImageToWebp(
  input: ArrayBuffer | Uint8Array | Buffer,
  kind: ImageKind,
): Promise<ArrayBuffer> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer);
  const { width, height } = MAX[kind];

  const output = await sharp(buffer)
    .rotate() // respektovat EXIF orientaci
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  // Vrátíme čistý ArrayBuffer (validní BodyInit pro fetch/R2).
  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  ) as ArrayBuffer;
}
