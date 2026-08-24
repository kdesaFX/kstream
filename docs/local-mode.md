# Local mode

Run kstream without hitting `kdesa.stream` / Cloudflare for the UI shell.

## Desktop app (recommended)

Release builds of [kstream-desktop](https://github.com/kdesaFX/kstream-desktop) embed this repo's `dist/` and serve it from `http://127.0.0.1`. Scraping uses Electron IPC; `/api/proxy` is available locally for MangaDex covers.

Dev against Vite:

```bash
# terminal 1
pnpm dev

# terminal 2
cd ../kstream-desktop
set KSTREAM_URL=http://localhost:5173
pnpm start
```

## Browser / PWA on localhost

```bash
pnpm serve:local
```

Opens the Worker + static assets on `http://127.0.0.1:8787` (see `wrangler.toml`). Install as a PWA from Chromium if desired — the install is pinned to that localhost origin and only works while the local server is running.

See [example.local.env](../example.local.env) for suggested env values.
