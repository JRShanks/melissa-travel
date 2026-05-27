# melissa-travel

Jason's 12-month travel schedule, generated monthly for Melissa.

## Generate

This repo is a pure static Netlify site. The generator has no npm dependencies; it uses an injected Outlook Calendar export as the primary source. Jason's existing OpenClaw Google OAuth token remains an optional legacy fallback.

```bash
npm run review
npm run refresh
```

Useful options/environment:

```bash
node scripts/generate.mjs --today=2026-05-04 --review-only
OUTLOOK_CALENDAR_EVENTS_PATH=data/outlook-calendar-events.json node scripts/generate.mjs --review-only
GOOGLE_CALENDAR_ID=jshanks@eucharisticcongress.org node scripts/generate.mjs --review-only
GOOGLE_TOKEN_PATH=$HOME/.openclaw/secrets/daily-briefing-google-token.json node scripts/generate.mjs --review-only
DAILY_BRIEFING_GOOGLE_TOKEN_PATH=$HOME/.openclaw/secrets/daily-briefing-google-token.json node scripts/generate.mjs --review-only
```

Outlook injection format:

```json
{
  "source": "outlook",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "events": []
}
```

The default injection path is `data/outlook-calendar-events.json`, and the file is ignored by git. Cron agents should fetch Jason's primary Outlook calendar events for the next 12 months, write the raw Outlook event array into `events`, and then run `npm run review`.

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
