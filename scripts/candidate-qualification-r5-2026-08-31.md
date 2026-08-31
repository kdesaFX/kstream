# Source hunt round 5 — 2026-08-31

## Shipped: CastleTV

- API: `https://api.hlowb.com` (AES-128-CBC, key+IV derived from security key + `T!BgJB`)
- Validated playable HLS for Inception / Dark Knight / Interstellar / Dune Part Two
- **Quirk:** `resolution=3` often returns `permissionDenied`; `resolution=2` succeeds and still includes **FHD 1080P** entries in `videos[]`
- Prefer English tracks first; also try dubbed tracks with `existIndividualVideo`
- Scraper: `.providers-src/src/providers/sources/castletv.ts`, rank **410**, registered in `all.ts`

## Not shipped

| Lead | Result |
|------|--------|
| DahmerMovies (`a.111477.xyz`) | Directory lists Remux/2160p; **file bytes CF-blocked** via proxy; browser link click does not stream; MKV not browser-native |
| OneTouchTV (`api3.devcorp.me`) | Decrypt works, returns HLS — but catalog match for Inception is a **fake 2001** entry; year/IMDB matching would reject real hits often |
| StreamFlix / VaPlayer / CinemaOS | Still dead or CDN 1016 |
| Vidrock | Still same stub playlist per title (keep disabled) |
| VidCore / Flicky / 2embed embeds | HTML shells only (need full scrape chain; not godly API) |
| PrimeSrc | Already shipped prior round |

## r5 matrix notables

- `primesrc-list` still strongest open list API (85)
- `vidrock` JSON responds but known-stub
- Embed shells (`vixsrc`, `multiembed`, `2embed-skin`) alive as HTML, not direct streams

## Artifacts

- `scripts/source-hunt-r5.mjs` / `source-hunt-r5-results.json`
- `scripts/source-hunt-r5-validate.mjs` / `source-hunt-r5-validate.json`
- `scripts/probe-castle-onetouch.mjs`
