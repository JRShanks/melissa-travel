# Jason Travel

Jason's travel assistant dashboard and family-visibility workflow.

The live HTML page is the quick itinerary view Jason can use while planning or traveling. It should show upcoming work travel, significant evening obligations, major meetings, and assistant notes such as flight, hotel, agenda, and "details pending" context.

Calendar visibility flows through the published feed:

- Work commitments stay on Jason's work calendar.
- Family-facing visibility is published through `https://jstravelschedule.netlify.app/melissa-travel.ics`.
- Apple Calendar `Jason's Travel` should subscribe to that feed, and Melissa should either subscribe to the same feed or have visibility through the shared/subscribed Apple Calendar setup.
- The HTML page is regenerated alongside the feed after Clive/OpenClaw updates or reconciles the travel records.

## Generate

This repo is a pure static Netlify site. The generator has no npm dependencies and requires an injected calendar export from Clive/OpenClaw. Google Calendar is intentionally no longer a fallback source.

```bash
npm run review
npm run refresh
```

Useful options/environment:

```bash
node scripts/generate.mjs --today=2026-05-04 --review-only
OUTLOOK_CALENDAR_EVENTS_PATH=data/outlook-calendar-events.json node scripts/generate.mjs --review-only
```

Calendar injection format:

```json
{
  "source": "outlook",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "events": []
}
```

The default injection path is `data/outlook-calendar-events.json`, and the file is ignored by git. Clive/OpenClaw should fetch Jason's primary Outlook calendar and/or Apple Calendar events for the next 12 months, write normalized event objects into `events`, and then run `npm run review`.

## Clive/OpenClaw workflow

When Jason says something like "I'm likely going to Philadelphia June 10-13, details to come," Clive should:

1. Create or update the work-calendar event if it belongs on the work calendar.
2. Create or update the matching travel record that feeds `melissa-travel.ics`.
3. Preserve a stable Clive travel identifier so future updates do not duplicate the trip in the feed.
4. Add status and itinerary context as it becomes available: tentative, booked, confirmed, flights, hotel, ground transport, agenda, Melissa joining, and missing details.
5. Regenerate this HTML dashboard and the `melissa-travel.ics` feed after the travel sync batch.

`Jason's Travel` appears to be a subscribed Apple Calendar fed from `https://jstravelschedule.netlify.app/melissa-travel.ics`. This repo maintains that feed; it does not manage Apple/iCloud sharing or subscription permissions.

Outputs:

- `RUN_REPORT.json` — generated every run; includes trip count, next trip, review flags, and cost guardrails
- `index.html`
- `melissa-travel.ics`

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
