# melissa-travel

Jason's 12-month travel schedule, generated monthly for Melissa.

## Generate

This repo is a pure static Netlify site. The generator has no npm dependencies; it uses Node 22+ `fetch` and Jason's existing OpenClaw Google OAuth token.

```bash
npm run review
npm run refresh
```

Useful options/environment:

```bash
node scripts/generate.mjs --today=2026-05-04 --review-only
GOOGLE_CALENDAR_ID=jshanks@eucharisticcongress.org node scripts/generate.mjs --review-only
GOOGLE_TOKEN_PATH=$HOME/.openclaw/secrets/daily-briefing-google-token.json node scripts/generate.mjs --review-only
```

Outputs:

- `RUN_REPORT.json` — generated every run; includes trip count, next trip, review flags, and cost guardrails
- `index.html`
- `melissa-travel.ics`
- `trips/<slug>.ics`

## Review guardrails

The generator stops before writing/pushing production artifacts when review flags are present unless `--allow-review-flags` is supplied. Review flags include:

- `city-tbd`
- `city-only`
- `missing-purpose`
- `merged-purpose-review`
- `merged-overlapping-blocks`

Recommended flow:

```bash
npm run review
cat RUN_REPORT.json
npm run refresh
```

For production refreshes, batch all generated files into one commit/push so Netlify only deploys once per refresh.

See `COST_REVIEW.md` for hosting/cost notes.
