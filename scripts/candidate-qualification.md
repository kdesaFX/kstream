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
