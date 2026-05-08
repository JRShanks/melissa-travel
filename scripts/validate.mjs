#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync('index.html', 'utf8');
const feed = fs.readFileSync('melissa-travel.ics', 'utf8');
const tripFiles = fs.readdirSync('trips').filter(f => f.endsWith('.ics')).sort();
const report = fs.existsSync('RUN_REPORT.json') ? JSON.parse(fs.readFileSync('RUN_REPORT.json', 'utf8')) : null;

const failures = [];
function assert(ok, msg) { if (!ok) failures.push(msg); }

assert(html.includes("Jason's Travel Schedule"), 'index.html missing page title');
assert(html.includes('Subscribe to this calendar'), 'index.html missing subscribe card');
assert(html.includes('webcal://jstravelschedule.netlify.app/melissa-travel.ics'), 'index.html missing Apple webcal link');
assert(html.includes('https://calendar.google.com/calendar/r?cid=https://jstravelschedule.netlify.app/melissa-travel.ics'), 'index.html missing Google subscribe link');

const vevents = (feed.match(/BEGIN:VEVENT/g) || []).length;
const expectedFeedEvents = report ? (report.tripCount || 0) + (report.importantMeetingCount || 0) : tripFiles.length;
assert(feed.includes('METHOD:PUBLISH'), 'feed missing METHOD:PUBLISH');
assert(feed.includes('REFRESH-INTERVAL;VALUE=DURATION:PT12H'), 'feed missing refresh interval');
assert(feed.includes('TRANSP:TRANSPARENT'), 'feed missing transparent events');
assert(html.includes('Important meetings'), 'index.html missing important meetings section');
assert(vevents === expectedFeedEvents, `feed VEVENT count ${vevents} does not match expected events ${expectedFeedEvents}`);

for (const file of ['melissa-travel.ics', ...tripFiles.map(f => path.join('trips', f))]) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('BEGIN:VCALENDAR'), `${file} missing BEGIN:VCALENDAR`);
  assert(text.includes('END:VCALENDAR'), `${file} missing END:VCALENDAR`);
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    assert(Buffer.byteLength(line, 'utf8') <= 75 || line.startsWith(' '), `${file} has unfolded line >75 octets: ${line.slice(0, 80)}`);
  }
}

if (report) {
  assert(report.tripCount === tripFiles.length, `RUN_REPORT tripCount ${report.tripCount} does not match trip files ${tripFiles.length}`);
  assert(Array.isArray(report.costGuardrails) && report.costGuardrails.length >= 1, 'RUN_REPORT missing cost guardrails');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${tripFiles.length} trips / ${vevents} feed events.`);
