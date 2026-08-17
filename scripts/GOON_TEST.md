# Goon test

Large source hit-rate benchmark. Agent skill: say **"goon test"** in chat.

```bash
node scripts/goon-test.mjs          # full
node scripts/goon-test.mjs --quick  # smoke
```

Writes:

- `scripts/goon-test-results.json` (gitignored)
- `src/utils/media/sourcePerformance.generated.ts` (committed — drives scrape order)

Scrape order uses env (`browser` / `extension` / `desktop`) × media (`movie` / `show` / `anime`).

## Wrong-media checks

A source can hit and still serve a different title. These compare the runtime
TMDB reports with the duration the returned playlist actually holds:

```bash
node scripts/goon-wrongmedia.mjs --tv 86836 --season 1 --episode 1 --urls
node scripts/goon-duration-audit.mjs            # spread of titles, per-source rate
```
