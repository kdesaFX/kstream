# Source hunt — godly round 2026-08-31 (evening)

Probed ~30 fresh hosts via `scripts/source-hunt-godly.mjs` + browser CF bypass research.

## Winners

| Candidate | Verdict | Notes |
|-----------|---------|-------|
| **PrimeSrc** | **SHIP** | 23 hosts / title, real **1080p** Filemoon/Voe filenames. List API open; link API needs Turnstile `0x4AAAAAACox-LngVREu55Y4`. Was implemented but **never registered**. |
| vidrock | Keep disabled | Same stub b-cdn playlist for every title |
| 111movies | False positive | HTML shell only |
| streambox/vidjoy | Dead | Domain for sale |
| slidemovies | Dead | worker 404 |
| cinemaos vercel | Dead | DEPLOYMENT_NOT_FOUND |
| vidsrc.cc / smashy / etc. | Dead | CF 403/526/530 |

## Shipped

- Rewrite `primesrc.ts`: Turnstile → prefer 1080p → resolve `/l?key&token` → Filemoon/Voe/etc embeds
- Register `primesrcScraper` in `all.ts` at rank 430

## Audience quality path (unchanged)

No free site-wide Remux/4K CDN. Best free levers: PrimeSrc + existing scrapers + Febbox BYOK for users who opt in.
