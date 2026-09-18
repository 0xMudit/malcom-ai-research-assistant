// Stand-in for the `server-only` marker package, aliased in vitest.config.ts.
//
// The real package throws when imported outside a React Server Component graph,
// which is the point of it in a Next.js build. Tests run server-side code
// directly, so the marker has no meaning there and is replaced with nothing.
export {};
