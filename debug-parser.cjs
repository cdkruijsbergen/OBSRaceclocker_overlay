const fs = require('fs');
const html = fs.readFileSync('raceclocker-page.html', 'utf8');

const start = html.indexOf('let AllResults = ');
if (start === -1) {
  console.log('no let AllResults found');
  process.exit(0);
}

const arrayOpen = html.indexOf('[', start);
let depth = 0;
let quote = null;
let escaped = false;
let close = -1;

for (let i = arrayOpen; i < html.length; i++) {
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
      close = i;
      break;
    }
  }
}

if (close === -1) {
  console.log('no closing bracket found');
  process.exit(0);
}

const arrayText = html.slice(arrayOpen, close + 1);
try {
  const data = new Function('"use strict"; return ' + arrayText)();
  console.log('items', data.length);
  console.log('first', data[0].Name, data[0].Cat, data[0].Club, data[0].Result);
} catch (e) {
  console.log('parse_error', e.message);
}
