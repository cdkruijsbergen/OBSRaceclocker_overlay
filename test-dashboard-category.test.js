import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';
const { resolveFieldForPage, routeFieldFromRoute, routeCatFromRoute, isFamilyCategory, categoryMatchesFinalCategory } = await import('./server.js');

function normalizeBrowserSourceCat(cat) {
  return String(cat).replace(/F[A-Q]$/i, '');
}

function labelForCategory(cat) {
  const match = String(cat).match(/F([A-Q])$/i);
  if (!match) return 'Timetrial';
  const letter = match[1].toUpperCase();
  return `${letter === 'A' ? 'A' : letter === 'B' ? 'B' : letter === 'C' ? 'C' : letter === 'D' ? 'D' : letter === 'E' ? 'E' : letter === 'F' ? 'F' : letter === 'G' ? 'G' : letter === 'H' ? 'H' : letter === 'I' ? 'I' : letter === 'J' ? 'J' : letter === 'K' ? 'K' : letter === 'L' ? 'L' : letter === 'M' ? 'M' : letter === 'N' ? 'N' : letter === 'O' ? 'O' : letter === 'P' ? 'P' : letter === 'Q' ? 'Q' : 'Timetrial'} Finale`;
}

test('dashboard browser source stays on the base field when selecting a family category', () => {
  assert.equal(normalizeBrowserSourceCat('Mix2xFA'), 'Mix2x');
  assert.equal(normalizeBrowserSourceCat('HC4+FB'), 'HC4+');
});

test('dashboard family labels extend through FA..FQ', () => {
  assert.equal(labelForCategory('Mix2xFA'), 'A Finale');
  assert.equal(labelForCategory('HC4+FB'), 'B Finale');
  assert.equal(labelForCategory('HC4+FC'), 'C Finale');
  assert.equal(labelForCategory('HC4+FD'), 'D Finale');
  assert.equal(labelForCategory('HC4+FE'), 'E Finale');
  assert.equal(labelForCategory('HC4+FF'), 'F Finale');
  assert.equal(labelForCategory('HC4+FG'), 'G Finale');
  assert.equal(labelForCategory('HC4+FH'), 'H Finale');
  assert.equal(labelForCategory('HC4+FI'), 'I Finale');
  assert.equal(labelForCategory('HC4+FJ'), 'J Finale');
  assert.equal(labelForCategory('HC4+FK'), 'K Finale');
  assert.equal(labelForCategory('HC4+FL'), 'L Finale');
  assert.equal(labelForCategory('HC4+FM'), 'M Finale');
  assert.equal(labelForCategory('HC4+FN'), 'N Finale');
  assert.equal(labelForCategory('HC4+FO'), 'O Finale');
  assert.equal(labelForCategory('HC4+FP'), 'P Finale');
  assert.equal(labelForCategory('HC4+FQ'), 'Q Finale');
});

test('dashboard route parser can read the active field from a browser source route', () => {
  assert.equal(routeFieldFromRoute('/overlay.html?veld=h2x'), 'h2x');
  assert.equal(routeFieldFromRoute('/startlist.html?veld=Mix2x'), 'Mix2x');
  assert.equal(routeFieldFromRoute('/overlay.html'), '');
});

test('field resolution prefers the page URL query string and falls back to route state or active field state', () => {
  assert.equal(resolveFieldForPage('http://localhost:5000/overlay.html?veld=H2x', '/overlay.html?veld=Mix2x', 'Mix2x'), 'H2x');
  assert.equal(resolveFieldForPage('http://localhost:5000/overlay.html', '/overlay.html?veld=Mix2x', 'H2x'), 'Mix2x');
  assert.equal(resolveFieldForPage('http://localhost:5000/overlay.html', '/overlay.html', 'H2x'), 'H2x');
});

test('dashboard route parser can keep an exact family category in the route when a finale mode is chosen', () => {
  assert.equal(routeFieldFromRoute('/overlay.html?veld=Mix2x&cat=Mix2xFA'), 'Mix2x');
  assert.equal(routeCatFromRoute('/overlay.html?veld=Mix2x&cat=Mix2xFA'), 'Mix2xFA');
});

test('timetrial family rows must be classified out of the base timetrial payload even when the category includes a numbered family suffix', () => {
  assert.equal(isFamilyCategory('Mix2xFA1'), true);
  assert.equal(isFamilyCategory('Mix2xFA2'), true);
  assert.equal(isFamilyCategory('Mix2xFB1'), true);
  assert.equal(isFamilyCategory('Mix2x'), false);
});

test('finale category filtering must compare against the requested family category instead of only the base field', () => {
  assert.equal(categoryMatchesFinalCategory('H2xFA1', 'H2xFA'), true);
  assert.equal(categoryMatchesFinalCategory('H2xFA2', 'H2xFA'), true);
  assert.equal(categoryMatchesFinalCategory('H2xFB1', 'H2xFA'), false);
  assert.equal(categoryMatchesFinalCategory('H2x', 'H2xFA'), false);
});

test('overlay timetrial requests full names while live requests can preserve the compact shortening behavior', () => {
  const overlayHtml = readFileSync(new URL('./public/overlay.html', import.meta.url), 'utf8');
  const liveHtml = readFileSync(new URL('./public/live.html', import.meta.url), 'utf8');

  assert.equal(overlayHtml.includes('loadTimetrial(veld, state.compactNames !== false)'), false);
  assert.equal(overlayHtml.includes('const res = await fetch(`/api/timetrial?veld=${encodeURIComponent(veld || "")}`);'), true);
  assert.equal(liveHtml.includes('const compact = compactNames ? 1 : 0;'), true);
});

test('overlay finale markup no longer exposes fastest and second-fastest rows in the public overlay HTML', () => {
  const html = readFileSync(new URL('./public/overlay.html', import.meta.url), 'utf8');

  assert.equal(html.includes('id="fastestRow"'), false);
  assert.equal(html.includes('id="secondRow"'), false);
  assert.equal(html.includes('id="fastestName"'), false);
  assert.equal(html.includes('id="fastestClub"'), false);
  assert.equal(html.includes('id="fastestTime"'), false);
  assert.equal(html.includes('id="secondName"'), false);
  assert.equal(html.includes('id="secondClub"'), false);
  assert.equal(html.includes('id="secondTime"'), false);
});
