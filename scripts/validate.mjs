#!/usr/bin/env node
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const feed = fs.readFileSync('melissa-travel.ics', 'utf8');
const report = fs.existsSync('RUN_REPORT.json') ? JSON.parse(fs.readFileSync('RUN_REPORT.json', 'utf8')) : null;

const failures = [];
function assert(ok, msg) { if (!ok) failures.push(msg); }

assert(html.includes("Jason's Travel Schedule"), 'index.html missing page title');
assert(html.includes('Travel assistant dashboard'), 'index.html missing assistant-dashboard subtitle');
assert(html.includes('Travel desk'), 'index.html missing travel desk section');
assert(html.includes("Jason's Travel"), 'index.html missing shared calendar reference');
assert(html.includes('Subscribe to this calendar'), 'index.html missing bottom subscribe card');
assert(html.includes('webcal://jstravelschedule.netlify.app/melissa-travel.ics'), 'index.html missing Apple feed link');
assert(!html.includes('calendar.google.com'), 'index.html should not rely on Google Calendar subscription links');
assert(!html.includes('download>'), 'index.html should not show .ics download links');

assert(html.includes('Important meetings'), 'index.html missing important meetings section');

const vevents = (feed.match(/BEGIN:VEVENT/g) || []).length;
const expectedFeedEvents = report ? (report.tripCount || 0) + (report.importantMeetingCount || 0) : vevents;
assert(feed.includes('METHOD:PUBLISH'), 'feed missing METHOD:PUBLISH');
assert(feed.includes("X-WR-CALNAME:Jason's Travel"), 'feed missing Jason Travel calendar name');
assert(feed.includes('REFRESH-INTERVAL;VALUE=DURATION:PT12H'), 'feed missing refresh interval');
assert(feed.includes('TRANSP:TRANSPARENT'), 'feed missing transparent travel events');
assert(vevents === expectedFeedEvents, `feed VEVENT count ${vevents} does not match expected events ${expectedFeedEvents}`);
for (const line of feed.split(/\r?\n/)) {
  if (!line) continue;
  assert(Buffer.byteLength(line, 'utf8') <= 75 || line.startsWith(' '), `feed has unfolded line >75 octets: ${line.slice(0, 80)}`);
}

if (report) {
  assert(report.calendarVisibilityTarget === "Subscribed Apple Calendar: Jason's Travel (https://jstravelschedule.netlify.app/melissa-travel.ics)", 'RUN_REPORT missing Jason Travel feed target');
  assert(Array.isArray(report.generatedFiles) && report.generatedFiles.includes('index.html') && report.generatedFiles.includes('melissa-travel.ics'), 'RUN_REPORT should list index.html and melissa-travel.ics');
  assert(Array.isArray(report.costGuardrails) && report.costGuardrails.length >= 1, 'RUN_REPORT missing cost guardrails');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated travel assistant dashboard and feed${report ? ` with ${report.tripCount} trips and ${report.importantMeetingCount} meetings` : ''}.`);
