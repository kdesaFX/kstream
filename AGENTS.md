# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Single-product, client-only web app: **P-Stream / "Z-Stream"** — a movie & TV streaming SPA (Vite 5 + React 18 + TypeScript, Zustand, i18next, Tailwind). There is no backend service in this repo; `src/backend/` is the browser-side data-access layer. All server dependencies (TMDB, CORS proxy, accounts backend) are external. Package manager is **pnpm** (enforced by a `preinstall` `only-allow pnpm` hook).

### Commands (see `package.json` scripts)
- Dev server: `pnpm dev` → http://localhost:5173
- Lint: `pnpm lint` (ESLint; expect 0 errors, a few pre-existing unused-var warnings)
- Test: `pnpm test` (vitest)
- Build: `pnpm build`

`pnpm dev` also runs `vite-plugin-checker`, which prints inline TypeScript/ESLint results in the terminal — those are informational and do not stop the dev server.

### REQUIRED for local dev: switch the SDK shim to the mock (do NOT commit)
The 4 player-settings files (`Downloads.tsx`, `VariantView.tsx`, `SettingsMenu.tsx`) import newer variant/download symbols (`fetchGridData`, `getVariantMeta`, `resolveVariant`, `getArtemisVariantMeta`, …) from `@/sdk`. Those symbols only exist in the **private** providers package used in production (`deploy.sh` swaps to `github:xp-technologies-dev/private-providers`). The public `@p-stream/providers` pinned in the lockfile (v3.2.0) does **not** export them.

Because of this, out of the box the dev server renders a **blank page** with a runtime error like `The requested module '/src/sdk/index.ts' does not provide an export named 'fetchGridData'` and ~26 TypeScript errors.

Fix for local dev: in `src/sdk/index.ts`, comment the providers line and use the local mock (`src/sdk/mock.ts`) instead:
```ts
// export * from "@p-stream/providers";
export * from "./mock";
```
After this switch the TS error count drops to 0 and the app renders. **Do not commit this switch** — committing it would replace the real private-providers implementations (downloads/file-variant features) with empty stubs in production. Leave it as an uncommitted working-tree change while developing. The rest of the app imports `@p-stream/providers` directly, so only these player-settings features become stubs locally.

### Required config for content (TMDB) — a secret, not a code change
Browsing/searching/any content requires a TMDB read API key. Without it the UI shell still renders, but every content fetch throws `TMDB API key not set` (see `src/backend/metadata/tmdb.ts`). Provide it via the `VITE_TMDB_READ_API_KEY` environment variable — Vite picks up prefixed shell env vars automatically (verified), so an injected secret works without editing files. It may be a TMDB v4 read token (sent as `Bearer`) or a v3 api key. A local `.env` (copied from `example.env`, gitignored) also works.

Other optional external config (all in `example.env`): `VITE_CORS_PROXY_URL` (needed for actual stream playback), `VITE_M3U8_PROXY_URL`, `VITE_BACKEND_URL` (accounts/sync), Trakt/Simkl OAuth. `VITE_NORMAL_ROUTER=true` uses path routing instead of the default hash router.

### Notes
- The public providers tarball (`github:xp-technologies-dev/providers#production`) is fetched over HTTPS during `pnpm install` and is publicly downloadable — no auth/token needed for install.
- `src/stores/__old/` and deliberate on/off toggles (ads, commented-out parts) should not be "cleaned up" — see `src/ARCHITECTURE.md`.
