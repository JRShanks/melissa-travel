# Cost review

This site is tiny and static: `index.html`, one aggregate ICS feed, and one small per-trip ICS file per upcoming trip. Current checkout is under 250 KB including git metadata; deploy payload is roughly tens of KB.

## Current likely Netlify credit drivers

- **Build minutes:** effectively zero. `netlify.toml` has no build command and publishes the repo root.
- **Bandwidth/requests:** very low. The only repeat traffic should be Melissa's browser visits and calendar clients polling `melissa-travel.ics` / per-trip ICS links.
- **Deploy frequency:** git history shows a burst of one initial static-site setup plus one commit per generated artifact on 2026-04-25. That was 16 commits/deploy-triggering pushes for one refresh. This is the biggest avoidable waste, even though the site is tiny.

## Host comparison

- **Netlify:** fine to keep. No build, tiny assets, and low traffic should remain well within free/low-cost usage if refreshes are batched.
- **GitHub Pages:** also viable and probably cheapest/simplest if Jason wants everything GitHub-native. Downsides: custom behavior and deploy visibility are less friendly than Netlify.
- **Cloudflare Pages:** excellent free static hosting and generous bandwidth; good alternative if Netlify ever starts charging unexpectedly.
- **Vercel:** works, but offers no advantage for this static no-build site and can be easier to misconfigure into unnecessary builds.

## Recommendations

1. **Keep Netlify for now.** The workload is too small to justify migration unless billing surprises appear.
2. **Batch each refresh into one commit/push** containing `index.html`, `melissa-travel.ics`, and all `trips/*.ics`; do not push one file per commit.
3. **Keep the no-build Netlify config.** Avoid adding frameworks or package installs.
4. **Refresh monthly or on-demand, not hourly.** The ICS advertises `PT12H`, but the source calendar scan only needs a monthly/update-triggered publish unless Jason's travel changes.
5. **Watch deploy count, not file size.** Static asset size and bandwidth are negligible; repeated deploy-triggering pushes are the only realistic cost lever.
