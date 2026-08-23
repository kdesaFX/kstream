# Candidate site qualification (pre-goon)

| Site | Qualify? | Why |
|------|----------|-----|
| https://meowtv.ru/ | No | SPA; playback via `vidsrc-embed.ru` iframes; `api.meowtv.ru` needs auth and has no open stream routes |
| https://fireflix.pages.dev/ | No | Frontend only (peachify / videasy / vidsrc iframes); no scrapable stream API found |
| https://hydrahd.com/ | No* | Aggregates third-party embeds; first-party `ajax/1_m1.php` 404; many listed hosts are dead/for-sale |
| https://anixx.fun/ | No | Anime catalog UI only; no stream/API surface |
| https://www.primeshows.org/ | No | TMDB catalog UI; no player/stream backend found |
| https://zetmoon.live/ | No | Hard 403 |
| https://7movies.in/ | **Yes** | Playback token + `embed.animecurx.tech` HLS API → source `sevenmovies` |
| https://www.aurorascreen.org/ | No | `soapy.to` embed returns "Failed to retrieve embed URL" |
| https://cinemaos.live/ | No | Catalog UI; `/api/video/stream/get` 404; old cinemaos-v3 API dead |
| https://www.1shows.org/ | No | Viduki iframe provider list only; no direct stream API |
| https://vyla.cc/ | No | `api.vyla.cc` requires API key (`docs.vyla.cc/authentication`) |
| https://toustream.xyz/ | No | Cloudflare Turnstile gate; no open scrape path |
| https://shuttletv.su/ | No | Watch UI / TMDB only; no stream API |
| https://bcine.ru/ | **Yes** (same backend) | Wraps `1embed.cc` → source `oneembed` |

\*HydraHD could be revisited later as an aggregator if we add scrapers for its live child players (vidlink / videasy / etc.).

## Batch 2026-08-11

| Site | Qualify? | Why |
|------|----------|-----|
| https://67movies.nl/ | No | Catalog SPA; watch page iframes `player.vidlove.cc` (no JSON stream API) |
| https://flixer.gd/ | No | Catalog UI + `/api/progress` only |
| https://movienig.ht/ | No | `player.videasy.to` iframe wrapper |
| https://arrowtv.net/ | No | `player.cinezo.live` iframe wrapping p-stream (`pstream.mov` / flikhub) |
| https://neonflix.st/ | No | `player.videasy.net` iframe |
| https://moovie.fun/ | No | Aggregates videasy / smashystream / autoembed / peestream iframes; `/scrape/source` wants provider ids, not TMDB HLS |
| https://watch.spencerdevs.xyz/ | No | TMDB catalog + Firebase auth; no stream API |
| https://cinetaro.to/ | No | Catalog HTML; no stream API |
| https://opstream.fun/ | No | Embed SPA (`/embed/movie/`); no stream JSON |
| https://shiopa.com/ | No | Turnstile + TMDB proxy; `/api/noads` token-gated |
| https://vidplay.to/ | No | Catalog SPA + `embeda.vercel.app`; no stream API |
| https://moonflix.website/ | No | Dedicated player, but `hdhub-server-production.up.railway.app` is dead |
| https://moviebite.cc/ | No | Metadata API only; watch page has no stream routes |
| https://cinegram.tv/ | No | Static catalog; no player backend |
| https://movish.to/ | No | Vidstack shell; no source API |
| https://chillflix.lol/ | No | `/player-api` is an HTML docs page; `chillflix.pw` backend 503 |
| https://cinemove.cc/ | No | Hard 403 |
| https://overlook.cx/ | No | Videasy.net iframe + catalog `/api/streaming` |
| https://www.1flex.org/ | No | Catalog SPA; iframes Videasy / Vidzee / Viduki — no first-party stream JSON |
| https://www.1tube.org/ | No | Catalog + YouTube trailers; same Viduki wrapper; `db.1tube.org` has no stream routes |

## Batch 2026-08-11 (anime)

| Site | Qualify? | Why |
|------|----------|-----|
| https://www.miruro.com/ | No | SPA + encrypted `/api/secure/pipe` (CF 403); no open HLS JSON |
| https://mkissa.to/ | No | AllAnime GraphQL wrapper (`api.mkissa.net` / `acapi.allanime.day`); CF + query-string API, not a simple first-party stream |
| https://animepahe.pw/ | No | Cloudflare 403; Animetsu already covers pahe |
| https://kaa.lt/ | No* | Real KickAssAnime JSON (search/show/episode) but playback is krussdomi cat-player (Vid/Bird), not extractable HLS |
| https://animex.one/ | No | Same stream stack as Anidap (`zaza.animex.one` / `prox.animex.one`); skip duplicate |
| https://yenime.net/ | No | Jikan catalog + megaplay/vidbolt/tryembed iframes |
| https://anidap.lol/ | **Yes** | Anilist catalog + `chad.anidap.lol` HLS JSON (1080p yuki) → source `anidap` (anime-only) |
| https://kuroiru.co/ | No | Anime *tracker* (“30+ websites”), not a stream source |
| https://seanime.app/ | No | Docs site for a self-hosted desktop app |

\*KAA could be revisited if we add a krussdomi/BirdStream extractor.

## Batch 2026-08-23 (Gemini Type-A shortlist — live proxy probe)

Probed through `https://kdesa.stream/api/proxy` with TMDB `27205` / IMDb `tt1375666` where applicable. None qualify for a new free public source.

| Site | Qualify? | Why |
|------|----------|-----|
| https://voidboost.net/embed/… | No | Hard 403 via proxy (empty body) |
| https://voidboost.cc / .link | No | Cloudflare 1016 (origin down / unreachable) |
| https://hdrezka.ag / .me | No | Access error 105 (geo / IP block) |
| https://api.collaps.org/embed/… | No | 200 but JS “Redirecting…” anti-bot shell — no scrapable JSON/m3u8 |
| https://kodikapi.com / kodik.biz | No | Cloudflare 1016; search without token fails |
| https://kisskh.co | No | Cloudflare “Just a moment” on home + API |
| https://api.anify.tv | No | 522 origin down; public Anify API unmaintained |
| https://kinobox.tv/api/players | No | Timeout via proxy |
| https://api.alloha.tv | No | Alive but `not valid token` — paid/dev token required |
| https://lookmovie2.to | No | Hard 403 |
| https://ridomovies.tv | No | 403 “connection denied”; already marked known/implemented in goon scripts |
| HiAnime / Consumet-style MegaCloud unwrap | No | Wrapper of stacks we already cover, not a new CDN |

**Takeaway:** CIS CDNs (VoidBoost / HDRezka / Collaps / Kodik / Alloha) are the right *class*, but none are open through our current proxy path without geo/token/anti-bot. Keep hunting 7Movies/Anidap-style first-party JSON backends instead of Western embed resolvers.

## Batch 2026-08-23b (Gemini retry — Rive / AutoEmbed / Embed.su / AllAnime)

| Site | Qualify? | Why |
|------|----------|-----|
| https://api.rive.stream / rive.stream | No | Cloudflare 1016 origin down on root + claimed `/media/v2/tmdb/...` paths |
| https://autoembed.cc `/api/getVideoSource` | No | 1016; also rejected class (embed resolver family) |
| https://embed.su `/api/e/...` | No | 1016; VidSrc-family |
| https://api.allanime.day | No | Cloudflare “Just a moment”; home timed out |

**Takeaway:** Gemini is inventing or recycling dead/wrapped endpoints. Prefer GitHub code-search for *recent* commits with real `m3u8` extractors over LLM candidate lists.
