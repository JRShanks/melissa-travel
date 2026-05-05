#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SITE_URL = 'https://jstravelschedule.netlify.app';
const FEED_URL = `${SITE_URL}/melissa-travel.ics`;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'jshanks@eucharisticcongress.org';
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || `${process.env.HOME}/.openclaw/secrets/daily-briefing-google-token.json`;
const TZ = 'America/Indiana/Indianapolis';
const todayArg = process.argv.find(a => a.startsWith('--today='))?.split('=')[1];
const reviewOnly = process.argv.includes('--review-only');
const allowReviewFlags = process.argv.includes('--allow-review-flags');
const today = parseYmd(todayArg || new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()));
const scanEnd = addDays(today, 365);

function parseYmd(s) { const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); }
function ymd(d) { return d.toISOString().slice(0,10); }
function compactDate(d) { return ymd(d).replaceAll('-',''); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function daysBetween(a,b) { return Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 86400000); }
function html(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripHtml(s='') { return String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim(); }
function slugify(s) { return s.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }
function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0,12); }
function uniq(a) { return [...new Set(a.filter(Boolean))]; }
function titleCaseState(city) { return city.replace(/\bFlorida\b/i,'FL').replace(/\bCalifornia\b/i,'CA').replace(/\bMissouri\b/i,'MO').replace(/\bNorth Carolina\b/i,'NC').replace(/\bTexas\b/i,'TX').replace(/\bPennsylvania\b/i,'PA').replace(/\bWashington\b/i,'WA'); }

async function accessToken() {
  const auth = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  if (auth.tokens?.access_token && auth.tokens?.expiry_date > Date.now() + 60000) return auth.tokens.access_token;
  const body = new URLSearchParams({ client_id: auth.client_id, client_secret: auth.client_secret, refresh_token: auth.tokens.refresh_token, grant_type: 'refresh_token' });
  const res = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchEvents() {
  const token = await accessToken();
  const items = [];
  let pageToken;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`);
    url.searchParams.set('timeMin', `${ymd(today)}T00:00:00-04:00`);
    url.searchParams.set('timeMax', `${ymd(scanEnd)}T00:00:00-04:00`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }});
    if (!res.ok) throw new Error(`Google Calendar fetch failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

function eventDates(e) {
  const startRaw = e.start?.date || e.start?.dateTime;
  const endRaw = e.end?.date || e.end?.dateTime;
  const start = parseYmd(startRaw.slice(0,10));
  let endExclusive = parseYmd(endRaw.slice(0,10));
  // For this hand-maintained calendar, all-day travel blocks have historically been
  // entered/read as inclusive end dates. Timed events are widened to all-day envelopes.
  endExclusive = addDays(endExclusive, 1);
  return { start, endExclusive };
}

const EXCLUDE = /\b(SEAS|school|birthday|baptism|name day|payday|pay day|holiday|no school|field day|VBS|Luke|Nora|Xavier|Lila|Forum Meeting|Board Meeting|Chapter Meeting|Bluffton|1:1|weekly|bi-weekly|monthly|zoom|teams|podcast|radio|Rosary across America|staff call|Executive Team)\b/i;
const TRAVEL_HINT = /\b(Jason in|Jason In|Jason Napa|flight:|drive:|pilgrimage|conference|speaking|gala|travel block|out-of-town|staff strategy|Napa Institute|Legatus Raleigh|Guadalupe|St\. Augustine|Philadelphia|Seattle|Dallas|Raleigh|St\. Louis|Arlington|Jubilee 2033|Becket)\b/i;
const AIRPORT_TO_CITY = { SEA:'Seattle, WA', JAX:'St. Augustine, FL', RDU:'Raleigh, NC', DFW:'Dallas, TX', DAL:'Dallas, TX', STL:'St. Louis, MO', PHL:'Philadelphia, PA' };
const HOME_AIRPORTS = new Set(['FWA','IND','ORD','CLT','DFW']);

function inferCity(e) {
  const text = `${e.summary || ''} | ${e.location || ''} | ${stripHtml(e.description || '')}`;
  const rules = [
    [/St\.?\s*Augustine/i, 'St. Augustine, FL'], [/Seattle|\bSEA\b/i, 'Seattle, WA'], [/Philadelphia|\bPHL\b/i, 'Philadelphia, PA'],
    [/Napa|Meritage/i, 'Napa, CA'], [/St\.?\s*Louis|Augustine Institute/i, 'St. Louis, MO'], [/Raleigh|\bRDU\b/i, 'Raleigh, NC'],
    [/Dallas|\bDFW\b|\bDAL\b/i, 'Dallas, TX'], [/Guadalupe/i, 'Guadalupe, Mexico'], [/Arlington/i, 'Arlington'],
  ];
  for (const [re, city] of rules) if (re.test(text)) return city;
  if (/Art and Arch/i.test(text)) return 'TBD';
  const m = text.match(/\bfrom\s+([A-Z]{3})\s+to\s+([A-Z]{3})\b/i);
  if (m) return AIRPORT_TO_CITY[m[2].toUpperCase()] || null;
  return null;
}

function purposeFor(e, city) {
  const s = e.summary || '';
  const d = stripHtml(e.description || '');
  if (/Seattle/i.test(city)) return 'Travel (purpose not noted on calendar)';
  if (/St\. Augustine/i.test(city)) return 'Pilgrimage kick-off';
  if (/Corpus/i.test(s)) return 'Corpus Christi Arlington event (Melissa also listed)';
  if (/Becket/i.test(s)) return 'Becket Fund meeting & Gala';
  if (/Philadelphia/i.test(city) && /Jason in Philadelphia/i.test(s)) return 'Out-of-town block (purpose not noted on calendar)';
  if (/Napa/i.test(city)) return '15th Annual Napa Institute Summer Conference';
  if (/St\. Louis/i.test(city) && /Jubilee 2033/i.test(s+d)) return 'Jubilee 2033';
  if (/St\. Louis/i.test(city)) return 'NEC staff strategy meetings at the Augustine Institute';
  if (/Art and Arch/i.test(s)) return 'Catholic Institute for Art and Architecture Conference';
  if (/Raleigh/i.test(city)) return 'Speaking at Legatus Raleigh ("Strength in Surrender: Humility In The Eucharist")';
  if (/Dallas/i.test(city)) return 'Speaking engagement';
  if (/Guadalupe/i.test(city)) return 'Pilgrimage';
  return s.replace(/\s*\(Clone\)$/i,'').replace(/\s+NEC$/,'') || 'Travel';
}

function isCandidate(e) {
  const text = `${e.summary || ''} ${e.location || ''} ${stripHtml(e.description || '')}`;
  if (EXCLUDE.test(text) && !/Jason in|Jason In|Flight:|Drive:|pilgrimage|conference|speaking|gala|travel block|staff strategy/i.test(text)) return false;
  if (!TRAVEL_HINT.test(text)) return false;
  const city = inferCity(e);
  if (!city) return false;
  if (/Indianapolis|Fort Wayne|Bluffton/i.test(city)) return false;
  const {start, endExclusive} = eventDates(e);
  const dur = daysBetween(start, endExclusive);
  return dur >= 1 || /^Flight:/i.test(e.summary || '') || /^Drive:/i.test(e.summary || '');
}

function flightNote(events, trip) {
  const bits = [];
  for (const e of events) {
    const s = e.summary || '';
    if (!/^Flight:/i.test(s) && !/^Drive:/i.test(s)) continue;
    const {start} = eventDates(e);
    if (start < addDays(trip.start, -1) || start > addDays(trip.endExclusive, 1)) continue;
    const fm = s.match(/from\s+([A-Z]{3})\s+to\s+([A-Z]{3})/i);
    if (fm) bits.push({ date: start, route: `${fm[1].toUpperCase()} -> ${fm[2].toUpperCase()}` });
    else if (/Drive:/i.test(s)) bits.push({ date: start, route: s.replace(/^Drive:\s*/i,'Driving ') });
  }
  if (!bits.length) return '';
  const byDate = new Map();
  for (const b of bits) byDate.set(ymd(b.date), [...(byDate.get(ymd(b.date)) || []), b.route]);
  return [...byDate].map(([date, routes]) => `${joinRoutes(routes)} on ${fmtMonthDay(parseYmd(date))}`).join('; ') + '.';
}
function joinRoutes(routes) {
  const airports = [];
  const other = [];
  for (const route of routes) {
    const m = route.match(/^([A-Z]{3}) -> ([A-Z]{3})$/);
    if (!m) { other.push(route); continue; }
    if (!airports.length) airports.push(m[1], m[2]);
    else if (airports.at(-1) === m[1]) airports.push(m[2]);
    else airports.push(m[1], m[2]);
  }
  return [...other, airports.join(' -> ')].filter(Boolean).join('; ');
}

function buildTrips(events) {
  const candidates = events.filter(isCandidate).map(e => {
    const {start, endExclusive} = eventDates(e);
    const city = inferCity(e) || 'TBD';
    return { start, endExclusive, city, purpose: purposeFor(e, city), sources:[e.summary || ''], notes: [], sourceEvents: [summarizeEvent(e)] };
  }).filter(t => t.endExclusive >= today);

  candidates.sort((a,b) => a.start - b.start || a.endExclusive - b.endExclusive);
  const trips = [];
  for (const c of candidates) {
    let prior = trips.find(t => t.city === c.city && c.start <= addDays(t.endExclusive, 1) && c.endExclusive >= addDays(t.start, -1));
    if (!prior) { trips.push({...c}); continue; }
    if (c.start < prior.start) prior.start = c.start;
    if (c.endExclusive > prior.endExclusive) prior.endExclusive = c.endExclusive;
    prior.purpose = uniq([prior.purpose, c.purpose]).join(' / ');
    prior.sources.push(...c.sources);
    prior.sourceEvents.push(...c.sourceEvents);
  }
  for (const t of trips) {
    t.purpose = t.purpose.replace(/\/ Jason in .+?(?=\/|$)/gi,'').replace(/^Jason in .+?\/\s*/i,'').trim();
    const note = flightNote(events, t);
    const notes = [];
    if (note) notes.push(note);
    if (/Philadelphia, PA/.test(t.city) && ymd(t.start)==='2026-07-03') notes.push('Spans the July 4th holiday.');
    if (/Napa/.test(t.city)) notes.push('The Meritage Resort and Spa, Napa, CA.');
    if (/TBD/.test(t.city)) notes.push('Location not noted on calendar event.');
    if (/St\. Louis/.test(t.city) && /Jubilee 2033/.test(t.purpose)) notes.push('Merged overlapping St. Louis blocks from Staff Strategy Meetings and Jubilee 2033.');
    t.notes = uniq(notes);
    t.slug = `${ymd(t.start)}-${slugify(t.city)}`;
    t.uid = `melissa-travel-${sha(`${ymd(t.start)}|${ymd(t.endExclusive)}|${t.city}`)}@jstravelschedule.netlify.app`;
    t.reviewFlags = reviewFlags(t);
  }
  return trips.sort((a,b) => a.start - b.start);
}

function summarizeEvent(e) {
  const { start, endExclusive } = eventDates(e);
  return {
    summary: e.summary || '',
    location: e.location || '',
    start: ymd(start),
    endExclusive: ymd(endExclusive),
  };
}

function reviewFlags(t) {
  const flags = [];
  if (t.city === 'TBD') flags.push('city-tbd');
  if (!/,/.test(t.city) && !/Mexico/i.test(t.city)) flags.push('city-only');
  if (/purpose not noted/i.test(t.purpose)) flags.push('missing-purpose');
  if (/\//.test(t.purpose)) flags.push('merged-purpose-review');
  if (/Merged overlapping/i.test(t.notes.join(' '))) flags.push('merged-overlapping-blocks');
  return flags;
}

function buildReport(events, trips) {
  const reviewTrips = trips.filter(t => t.reviewFlags.length);
  const next = trips[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    today: ymd(today),
    scanEnd: ymd(scanEnd),
    sourceCalendar: CALENDAR_ID,
    eventCount: events.length,
    tripCount: trips.length,
    nextTrip: next ? { city: next.city, start: ymd(next.start), endExclusive: ymd(next.endExclusive), purpose: next.purpose } : null,
    reviewRequired: reviewTrips.length > 0,
    reviewFlags: reviewTrips.map(t => ({
      slug: t.slug,
      city: t.city,
      start: ymd(t.start),
      endExclusive: ymd(t.endExclusive),
      purpose: t.purpose,
      flags: t.reviewFlags,
      sources: t.sourceEvents,
    })),
    generatedFiles: [
      'index.html',
      'melissa-travel.ics',
      ...trips.map(t => `trips/${t.slug}.ics`),
    ],
    costGuardrails: [
      'Batch all generated files into one commit/push per refresh.',
      'Keep Netlify no-build static publish from repo root.',
      'Refresh monthly or on demand, not per-file or hourly.',
    ],
  };
}

function fmtRange(start, endExclusive) {
  const end = addDays(endExclusive, -1);
  const optsStart = { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' };
  const optsEnd = start.getUTCFullYear() === end.getUTCFullYear() ? { weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC' } : { weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC' };
  return `${new Intl.DateTimeFormat('en-US', optsStart).format(start)} – ${new Intl.DateTimeFormat('en-US', optsEnd).format(end)}`;
}
function fmtMonthDay(d) { return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', timeZone:'UTC' }).format(d); }
function status(t) {
  const delta = daysBetween(today, t.start);
  if (today >= t.start && today < t.endExclusive) return { text:'Away now', cls:'current', next:'Away now' };
  if (delta === 1) return { text:'Tomorrow', cls:'soon', next:'Jason leaves tomorrow' };
  return { text:`In ${delta} days`, cls: delta <= 7 ? 'soon' : 'upcoming', next:`Jason's next trip is in <b>${delta} days</b>` };
}
function updatedLine() {
  return new Intl.DateTimeFormat('en-US', { month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZone:TZ }).format(new Date());
}
function googleUrl(t) {
  const details = `${t.purpose}\n\n${t.notes.join('\n')}\n\nView live: ${SITE_URL}`;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action','TEMPLATE'); u.searchParams.set('text',`Jason: ${t.city}`);
  u.searchParams.set('dates',`${compactDate(t.start)}/${compactDate(t.endExclusive)}`);
  u.searchParams.set('details', details); u.searchParams.set('location', t.city);
  return u.toString();
}
function renderTrip(t) {
  const st = status(t), nights = daysBetween(t.start, t.endExclusive);
  return `
        <article class="trip upcoming">
          <header class="trip-head">
            <div class="dates">
              <div class="date-range">${html(fmtRange(t.start, t.endExclusive))}</div>
              <div class="nights">${nights} ${nights===1?'night':'nights'}</div>
            </div>
            <span class="badge badge-${st.cls}">${html(st.text)}</span>
          </header>
          <div class="city">${html(t.city)}</div>
          <div class="purpose">${html(t.purpose)}</div>
          ${t.notes.length ? `<div class="notes">${html(t.notes.join(' '))}</div>` : ''}
          <div class="add-row">
            <a class="add-btn" href="/trips/${html(t.slug)}.ics" download>📅 Add to Calendar (.ics)</a>
            <a class="add-btn ghost" href="${html(googleUrl(t))}" target="_blank" rel="noopener">Google Calendar</a>
          </div>
        </article>`;
}
function renderHtml(trips) {
  const old = fs.readFileSync('index.html','utf8');
  const style = old.match(/<style>[\s\S]*?<\/style>/)?.[0] || '';
  const next = trips[0];
  const hero = next ? `<div class="next-up">
          <div class="next-label">${status(next).next}</div>
          <div class="next-city">${html(next.city)}</div>
          <div class="next-when">${html(fmtRange(next.start, next.endExclusive))}</div>
        </div>` : `<div class="next-up"><div class="next-label">No upcoming trips found</div></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Jason's Travel Schedule</title>
${style}
</head>
<body>
  <div class="wrap">
    <header class="page">
      <h1>Jason's Travel Schedule</h1>
      <div class="sub">Next 12 months</div>
    </header>

    ${hero}

    <section class="subscribe">
      <h2>Subscribe to this calendar</h2>
      <p>Set it once and trips appear automatically — updates every month.</p>
      <div class="sub-buttons">
        <a href="webcal://jstravelschedule.netlify.app/melissa-travel.ics">Apple Calendar</a>
        <a class="ghost" href="https://calendar.google.com/calendar/r?cid=https://jstravelschedule.netlify.app/melissa-travel.ics" target="_blank" rel="noopener">Google Calendar</a>
        <button class="ghost" type="button" onclick="navigator.clipboard.writeText('https://jstravelschedule.netlify.app/melissa-travel.ics'); this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy feed URL',1500)">Copy feed URL</button>
      </div>
      <code class="feed-url">https://jstravelschedule.netlify.app/melissa-travel.ics</code>
    </section>

    <div class="summary">${trips.length} upcoming ${trips.length===1?'trip':'trips'} • Last updated ${html(updatedLine())}</div>

    ${trips.map(renderTrip).join('')}

    <footer>Generated from Jason's Google Calendar. Indianapolis-area, family, school, holiday, payday, and cloned non-trip entries are excluded.</footer>
  </div>
</body>
</html>
`;
}
function icsEscape(s='') { return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  let out = '', cur = '';
  for (const ch of line) {
    if (Buffer.from(cur + ch, 'utf8').length > 75) { out += cur + '\r\n '; cur = ch; } else cur += ch;
  }
  return out + cur;
}
function vevent(t, stamp) {
  const desc = `${t.purpose}\n\n${t.notes.join('\n')}\n\nView live: ${SITE_URL}`;
  return [
    'BEGIN:VEVENT', `UID:${t.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compactDate(t.start)}`, `DTEND;VALUE=DATE:${compactDate(t.endExclusive)}`,
    `SUMMARY:${icsEscape(`Jason: ${t.city}`)}`, `DESCRIPTION:${icsEscape(desc)}`, `LOCATION:${icsEscape(t.city)}`, 'TRANSP:TRANSPARENT', 'STATUS:CONFIRMED', 'END:VEVENT'
  ].map(foldLine).join('\r\n');
}
function renderIcs(trips, single) {
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const head = ['BEGIN:VCALENDAR','VERSION:2.0',`PRODID:-//Jason Shanks//Melissa Travel${single?'':' Feed'}//EN`,'CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  if (!single) head.push("X-WR-CALNAME:Jason's Travel", 'X-WR-CALDESC:Out-of-town trips for Jason Shanks (auto-updated monthly).', 'X-WR-TIMEZONE:America/Indiana/Indianapolis', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H');
  return [...head, ...trips.map(t => vevent(t, stamp)), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

const events = await fetchEvents();
const trips = buildTrips(events);
const report = buildReport(events, trips);

fs.writeFileSync('RUN_REPORT.json', JSON.stringify(report, null, 2) + '\n');

if (report.reviewRequired && !allowReviewFlags) {
  console.error(`Review required for ${report.reviewFlags.length} trip(s). See RUN_REPORT.json. Re-run with --allow-review-flags after human review if acceptable.`);
  for (const item of report.reviewFlags) console.error(`- ${item.start} ${item.city}: ${item.flags.join(', ')}`);
  if (!reviewOnly) process.exit(4);
}

if (!reviewOnly) {
  fs.writeFileSync('index.html', renderHtml(trips));
  fs.writeFileSync('melissa-travel.ics', renderIcs(trips, false));
  fs.mkdirSync('trips', { recursive:true });
  for (const f of fs.readdirSync('trips')) if (f.endsWith('.ics')) fs.rmSync(path.join('trips', f));
  for (const t of trips) fs.writeFileSync(path.join('trips', `${t.slug}.ics`), renderIcs([t], true));
}

console.log(`${reviewOnly ? 'Reviewed' : 'Generated'} ${trips.length} trips from ${events.length} events`);
for (const t of trips) console.log(`${ymd(t.start)} -> ${ymd(t.endExclusive)} ${t.city} :: ${t.purpose}${t.notes.length ? ' :: '+t.notes.join(' ') : ''}${t.reviewFlags.length ? ' :: REVIEW '+t.reviewFlags.join(',') : ''}`);
