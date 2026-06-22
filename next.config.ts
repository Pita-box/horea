import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pin the workspace root to this project directory. The home directory (~)
// contains a stray package.json + pnpm-lock.yaml, which makes Next.js infer
// the wrong workspace root and warn about multiple lockfiles.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Host Supabase Storage pro `next/image` (logo podniku na veřejné stránce, R1.2).
// Odvozujeme z NEXT_PUBLIC_SUPABASE_URL; pokud env chybí (např. při některých
// build krocích), zůstane bez remote patternu a build se kvůli tomu nezhroutí.
const supabaseImageHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

// Host veřejného R2 bucketu (r2.dev nebo vlastní doména) pro `next/image`.
const r2ImageHostname = (() => {
  try {
    const url = process.env.R2_PUBLIC_BASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

const remoteImagePatterns = [
  supabaseImageHostname
    ? {
        protocol: 'https' as const,
        hostname: supabaseImageHostname,
        pathname: '/storage/v1/object/public/**',
      }
    : null,
  r2ImageHostname
    ? { protocol: 'https' as const, hostname: r2ImageHostname, pathname: '/**' }
    : null,
].filter((pattern): pattern is NonNullable<typeof pattern> => pattern !== null);

const nextConfig: NextConfig = {
  // Standalone build pro produkční Docker image (samostatný server.js + jen
  // potřebné node_modules). Nasazení: VPS Docker (viz docker/ a plans/build-journal.md).
  output: 'standalone',
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // Tree-shaking / rychlejší dev kompilace pro icon balíček (jinak barrel import
  // tahá tisíce modulů). Next přepíše importy na přímé cesty k jednotlivým ikonám.
  experimental: {
    optimizePackageImports: ['@tabler/icons-react'],
  },
  images: remoteImagePatterns.length > 0 ? { remotePatterns: remoteImagePatterns } : undefined,
};

export default nextConfig;
