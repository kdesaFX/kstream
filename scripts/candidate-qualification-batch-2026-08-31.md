# Source hunt batch 2026-08-31

Run: `node scripts/source-hunt.mjs` (full) or `--quick`

Probed through `https://kdesa.stream/api/proxy` on Inception + Breaking Bad S1E1.

| Candidate | Qualify? | Why |
|-----------|----------|-----|
| **cornclick** | **Yes** (shipped) | JSON `/player/movie\|tv/{tmdb}` → Vaplayer HLS, ~800ms |
| **enc-dec-vidlink** | **Yes — re-enabled** | VidLink API: **360/480/1080** MP4 (TV also **720**) in **~300–850ms** |
| nova | Partial | Movies OK; TV API `type=tv` returns 400 (wrong param) |
| dulo.cx | No | `session_required` / Turnstile |
| embed.su / vidsrc.rip / ridomovies | No | CF 1016 / 403 / anti-bot |
| videasy (enc-dec) | No | encrypt endpoint returns Not-Found |
| vidzee core | No | needs player server index |
| dahmer / streamflix / zxc | No | CF 1016 |

**Shipped in providers:** `vidlink` rank 420, CORS_ALLOWED, skipValidation for hakunaymatata CDN. Debrid no longer disabled at module load.

## Round 2 (2026-08-31 evening) — 20+ candidate probe

All dead via datacenter proxy: reyna, embedsu, moviesapi, lordflix, nunflix, hexa, dahmer, rgshows, autoembed-tom (CF 1016). HTML-only shells: vidjoy, hydrahd, pressplay, embedflix. **vidsrcvip** API returns empty through proxy. No new qualify targets beyond VidLink.
