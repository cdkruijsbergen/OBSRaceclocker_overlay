import fs from 'fs';

const RACE_URL = 'https://www.raceclocker.com/0790c73f';
const LOCAL_HTML = 'raceclocker-page.html';

function parseTimeToMs(str) {
  if (!str || str === 'Not started' || String(str).includes('Missing')) {
    return null;
  }

  const text = String(str).trim().replace(',', '.');
  const parts = text.split(':');

  if (parts.length === 3) {
    const h = Number.parseInt(parts[0], 10) || 0;
    const m = Number.parseInt(parts[1], 10) || 0;
    const s = Number.parseFloat(parts[2]);
    if (!Number.isFinite(s)) return null;
    return ((h * 60 + m) * 60 + s) * 1000;
  }

  if (parts.length === 2) {
    const m = Number.parseInt(parts[0], 10) || 0;
    const s = Number.parseFloat(parts[1]);
    if (!Number.isFinite(s)) return null;
    return ((m * 60 + s) * 1000);
  }

  return null;
}

function extractArrayFromHTML(html, start, label) {
  const offset = html.indexOf('[', start + label.length);
  if (offset === -1) return [];

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = offset; i < html.length; i++) {
    const ch = html[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const arrayText = html.slice(offset, i + 1);
        try {
          const data = new Function('"use strict"; return ' + arrayText)();
          return Array.isArray(data) ? data : [];
        } catch (e) {
          console.error('Failed to parse Raceclocker AllResults', e);
          return [];
        }
      }
    }
  }

  return [];
}

function extractAllResults(html) {
  const start = html.indexOf('let AllResults = ');
  if (start === -1) {
    const alt = html.indexOf('var AllResults = ');
    if (alt === -1) return [];
    return extractArrayFromHTML(html, alt, 'var AllResults = ');
  }

  return extractArrayFromHTML(html, start, 'let AllResults = ');
}

let html = '';
try {
  html = fs.readFileSync(LOCAL_HTML, 'utf8');
  console.log('source local snapshot', LOCAL_HTML, html.length);
} catch (e) {
  const res = await fetch(RACE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9'
    }
  });

  console.log('status', res.status, res.statusText);
  console.log('ok', res.ok);
  console.log('headers', Object.fromEntries(res.headers.entries()));

  html = await res.text();
}

console.log('len', html.length);
console.log('explicit start', html.indexOf('let AllResults = '));
const n = extractAllResults(html);
console.log('items', n.length);
if (n.length) {
  const first = n[0];
  console.log('first', first.Name, first.Cat, first.Club, first.Result, parseTimeToMs(first.Result));
  const mix2x = n.filter(row => row.Cat === 'Mix2x');
  console.log('mix2x', mix2x.length, mix2x[0]?.Name, mix2x[0]?.Result);
}
