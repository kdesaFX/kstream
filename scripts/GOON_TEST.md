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
