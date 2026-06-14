// Empty stub for the `server-only` package under Vitest.
// `server-only` is a build-time marker provided by Next.js bundlers and is not
// resolvable in the Vitest (node/jsdom) environment. Aliasing it here lets unit
// tests import server-only modules (e.g. onboarding/commit.ts) without bundling.
export {};
