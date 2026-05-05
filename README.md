# melissa-travel

Jason's 12-month travel schedule, generated monthly for Melissa.

## Generate

This repo is a pure static Netlify site. The generator has no npm dependencies; it uses Node 22+ `fetch` and Jason's existing OpenClaw Google OAuth token.

```bash
node scripts/generate.mjs
```

Useful options/environment:

```bash
node scripts/generate.mjs --today=2026-05-04
GOOGLE_CALENDAR_ID=jshanks@eucharisticcongress.org node scripts/generate.mjs
GOOGLE_TOKEN_PATH=$HOME/.openclaw/secrets/daily-briefing-google-token.json node scripts/generate.mjs
```

Outputs:

- `index.html`
- `melissa-travel.ics`
- `trips/<slug>.ics`

For production refreshes, batch all generated files into one commit/push so Netlify only deploys once per refresh.

See `COST_REVIEW.md` for hosting/cost notes.
