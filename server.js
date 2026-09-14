import express from "express";
import { load } from "cheerio";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const app = express();
const PORT = 5000;
const RACE_URL = "https://www.raceclocker.com/0790c73f";
const RACE_STARTLIST_URL = "https://www.raceclocker.com/0790c73f-startlist";
const LOCAL_HTML = "raceclocker-page.html";
const LOCAL_STARTLIST_HTML = "raceclocker-startlist.html";

app.use(express.static("public"));
app.use(express.json());

const overlayState = {
  globalUrlToggle: false,
  route: "/overlay.html?veld=Mix2x",
  liveRoute: "/live.html?veld=Mix2x",
  startlistRoute: "/startlist.html?veld=Mix2x",
  activeField: "Mix2x",
  activeCat: "",
  mode: "timetrial",
  autoRefresh: true,
  compactNames: true,
  barColor: "#005391"
};

app.get("/api/overlay-state", (req, res) => {
  res.json(overlayState);
});

app.post("/api/overlay-state", (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body.globalUrlToggle === "boolean") {
      overlayState.globalUrlToggle = body.globalUrlToggle;
    }
    if (typeof body.route === "string" && body.route) {
      overlayState.route = body.route;
    }
    if (typeof body.liveRoute === "string" && body.liveRoute) {
      overlayState.liveRoute = body.liveRoute;
    }
    if (typeof body.startlistRoute === "string" && body.startlistRoute) {
      overlayState.startlistRoute = body.startlistRoute;
    }
    if (typeof body.activeField === "string" && body.activeField) {
      overlayState.activeField = body.activeField;
    }
    if (typeof body.activeCat === "string") {
      overlayState.activeCat = body.activeCat || '';
    }
    if (typeof body.mode === "string" && body.mode) {
      overlayState.mode = body.mode;
    }
    if (typeof body.autoRefresh === "boolean") {
      overlayState.autoRefresh = body.autoRefresh;
    }
    if (typeof body.compactNames === "boolean") {
      overlayState.compactNames = body.compactNames;
    }
    if (typeof body.barColor === "string" && body.barColor) {
      overlayState.barColor = body.barColor;
    }
    res.json(overlayState);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to store overlay state" });
  }
});

export function routeFieldFromRoute(route) {
  try {
    if (!route || !route.includes('?')) return '';
    const params = new URLSearchParams(route.split('?')[1] || '');
    return params.get('veld') || '';
  } catch (e) {
    return '';
  }
}

export function routeCatFromRoute(route) {
  try {
    if (!route || !route.includes('?')) return '';
    const params = new URLSearchParams(route.split('?')[1] || '');
    return params.get('cat') || '';
  } catch (e) {
    return '';
  }
}

export function selectLiveFastestAndLatest(rows) {
  const timed = rows.filter(r => r.ms !== null && Number.isFinite(r.ms));
  if (!timed.length) {
    return { fastest: null, latest: null, diff: null, diffDisplay: null };
  }

  const fastest = [...timed].sort((a, b) => a.ms - b.ms)[0] || null;
  const latest = [...timed].reduce((chosen, row) => {
    if (!chosen) return row;

    const chosenFinishMs = Number.isFinite(chosen.finishMs)
      ? chosen.finishMs
      : parseClockMs(String(chosen.finish || chosen.finishTime || ''));
    const rowFinishMs = Number.isFinite(row.finishMs)
      ? row.finishMs
      : parseClockMs(String(row.finish || row.finishTime || ''));

    if (chosenFinishMs === null && rowFinishMs === null) return chosen;
    if (chosenFinishMs === null) return row;
    if (rowFinishMs === null) return chosen;

    return rowFinishMs > chosenFinishMs ? row : chosen;
  }, null) || null;

  if (!fastest || !latest) {
    return { fastest: null, latest: null, diff: null, diffDisplay: null };
  }

  const diff = latest.ms - fastest.ms;

  return {
    fastest,
    latest,
    diff,
    diffDisplay: diff === 0 ? '±0.00' : `${diff < 0 ? '-' : '+'}${formatMsToTime(Math.abs(diff))}`
  };
}

export function parseClockMs(str) {
  if (!str || String(str).trim() === '') return null;

  const text = String(str).trim();
  const parts = text.split(':');
  if (parts.length !== 3) return null;

  const h = Number.parseInt(parts[0], 10) || 0;
  const m = Number.parseInt(parts[1], 10) || 0;
  const s = Number.parseFloat(parts[2]);
  if (!Number.isFinite(s)) return null;

  return ((h * 60 * 60) + (m * 60) + s) * 1000;
}

export function resolveFieldForPage(pageUrl, route, activeField) {
  try {
    const url = new URL(pageUrl, 'http://localhost:5000');
    const pageVeld = url.searchParams.get('veld');
    if (pageVeld) return pageVeld;
  } catch (e) {
    // ignore malformed page URL and fall back to persisted route/state
  }

  const routeField = routeFieldFromRoute(route);
  if (routeField) return routeField;

  return activeField || '';
}

function normalizeFieldName(field) {
  return String(field || '').trim().toLowerCase();
}

export function categoryMatchesFinalCategory(cat, requestedCat) {
  if (!requestedCat) return true;
  const requested = String(requestedCat || '').trim();
  const row = String(cat || '').trim();

  if (!isFamilyCategory(requested)) return true;
  if (!isFamilyCategory(row)) return false;

  const rowBase = toBaseField(row);
  const requestedBase = toBaseField(requested);
  if (normalizeFieldName(rowBase) !== normalizeFieldName(requestedBase)) {
    return false;
  }

  const rowMatch = row.match(/F([A-Q])[0-9]*$/i);
  const requestedMatch = requested.match(/F([A-Q])[0-9]*$/i);
  if (!rowMatch || !requestedMatch) {
    return false;
  }

  return normalizeFieldName(rowMatch[1]) === normalizeFieldName(requestedMatch[1]);
}

export function isFamilyCategory(cat) {
  return /F[A-Q][0-9]*$/i.test(String(cat || ''));
}

export function isFamilyName(name) {
  return /^F[A-Q][0-9]*$/i.test(String(name || ''));
}

function categoryMatchesField(cat, veld) {
  if (!veld) return true;
  return normalizeFieldName(toBaseField(cat)) === normalizeFieldName(toBaseField(veld));
}

function parseTimeToMs(str) {
  if (!str || str === "Not started" || String(str).includes("Missing")) {
    return null;
  }

  const text = String(str).trim().replace(",", ".");
  const parts = text.split(":");

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

function formatMsToTime(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "--:--,--";
  }

  const totalSec = Math.max(0, ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  const sec = Math.floor(s * 100) / 100;
  const mm = String(m).padStart(2, "0");
  const ss = sec.toFixed(2).padStart(5, "0");
  return `${mm}:${ss}`;
}

function cleanDisplayText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function shortenDisplayName(name, maxLength = 24) {
  if (!name) return "";

  const normalized = cleanDisplayText(name);

  if (normalized === "Strijkend tegen stromend water") {
    return "Strijkend tegen strom...";
  }

  if (normalized.length > maxLength) {
    return `${normalized.slice(0, maxLength - 3).trim()}...`;
  }

  return normalized;
}

function extractAllResults(html) {
  const start = html.indexOf("let AllResults = ");
  if (start === -1) {
    const alt = html.indexOf("var AllResults = ");
    if (alt === -1) return [];
    return extractArrayFromHTML(html, alt, "var AllResults = ");
  }

  return extractArrayFromHTML(html, start, "let AllResults = ");
}

function extractAllCategories(html) {
  const start = html.indexOf("let AllCategories = ");
  if (start === -1) {
    const alt = html.indexOf("var AllCategories = ");
    if (alt === -1) return [];
    return extractArrayFromHTML(html, alt, "var AllCategories = ");
  }

  return extractArrayFromHTML(html, start, "let AllCategories = ");
}

function extractCategoriesFromStartlistHTML(html) {
  const $ = load(html);
  const categories = new Set();

  $(".LineCategory").each((_, el) => {
    const cat = $(el).text().trim();
    if (!cat) return;
    categories.add(cat);
  });

  return Array.from(categories).map(cat => ({ cat }));
}

function extractArrayFromHTML(html, start, label) {
  const offset = html.indexOf("[", start + label.length);
  if (offset === -1) return [];

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = offset; i < html.length; i++) {
    const ch = html[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
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

    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const arrayText = html.slice(offset, i + 1);
        try {
          const data = new Function(`"use strict"; return ${arrayText};`)();
          return Array.isArray(data) ? data : [];
        } catch (e) {
          console.error("Failed to parse Raceclocker AllResults", e);
          return [];
        }
      }
    }
  }

  return [];
}

async function fetchCategories() {
  let html = '';

  try {
    const res = await fetch(RACE_STARTLIST_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9"
      }
    });

    if (!res.ok) {
      throw new Error(`Raceclocker startlist fetch failed: ${res.status} ${res.statusText}`);
    }

    html = await res.text();
    console.log('remote_startlist_loaded', html.length);
  } catch (e) {
    console.log('remote_startlist_miss', e.message);
    try {
      html = await readFile(LOCAL_STARTLIST_HTML, "utf8");
      console.log('local_startlist_loaded', LOCAL_STARTLIST_HTML, html.length);
    } catch (localErr) {
      console.log('local_startlist_miss', localErr.message);
      throw localErr;
    }
  }

  const allCategories = extractCategoriesFromStartlistHTML(html);
  console.log('startlist_categories_len', allCategories.length);
  return allCategories;
}

async function fetchResults() {
  let html = '';

  try {
    const res = await fetch(RACE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9"
      }
    });

    if (!res.ok) {
      throw new Error(`Raceclocker fetch failed: ${res.status} ${res.statusText}`);
    }

    html = await res.text();
    console.log('remote_html_loaded', html.length);
  } catch (e) {
    console.log('remote_html_miss', e.message);
    try {
      html = await readFile(LOCAL_HTML, "utf8");
      console.log('local_html_loaded', LOCAL_HTML, html.length);
    } catch (localErr) {
      console.log('local_html_miss', localErr.message);
      throw localErr;
    }
  }

  const allResults = extractAllResults(html);
  console.log('allResults_len', allResults.length);

  const mapped = allResults
    .map(row => {
      const result = cleanDisplayText(row.Result || "");
      const resultMs = parseTimeToMs(result);
      const finishTime = cleanDisplayText(row.TmSplit5 || "");
      const finishMs = parseClockMs(finishTime);

      return {
        name: cleanDisplayText(row.Name || ""),
        cat: cleanDisplayText(row.Cat || ""),
        club: cleanDisplayText(row.Club || ""),
        start: cleanDisplayText(row.TmSplit1 || ""),
        finish: finishTime || result,
        finishTime,
        finishMs,
        result,
        penalty: cleanDisplayText(row.Penalty || ""),
        ms: resultMs
      };
    });

  console.log('mapped_len', mapped.length);
  return mapped;
}

app.get("/api/results", async (req, res) => {
  try {
    const data = await fetchResults();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

function toBaseField(cat) {
  return String(cat).replace(/F[A-Q][0-9]*$/i, "");
}

function familyFromCategory(cat) {
  const match = String(cat).match(/F([A-Q])[0-9]*$/i);
  if (!match) return { field: String(cat), label: "Timetrial", familyLetter: null };

  const letter = String(match[1]).toUpperCase();
  return {
    field: String(cat).replace(/F[A-Q][0-9]*$/i, ""),
    label: `${letter} Finale`,
    familyLetter: letter
  };
}

function normalizedSortOrder(label) {
  const order = {
    "Timetrial": 0,
    "Startlijst": 1,
    "A Finale": 2,
    "B Finale": 3,
    "C Finale": 4,
    "D Finale": 5,
    "E Finale": 6,
    "F Finale": 7,
    "G Finale": 8,
    "H Finale": 9,
    "I Finale": 10,
    "J Finale": 11,
    "K Finale": 12,
    "L Finale": 13,
    "M Finale": 14,
    "N Finale": 15,
    "O Finale": 16,
    "P Finale": 17,
    "Q Finale": 18,
  };
  return order[label] ?? 100;
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const categories = await fetchCategories();
    const fieldMap = new Map();

    for (const row of categories) {
      const normalized = String(row.cat || "").trim();
      if (!normalized) continue;

      const family = familyFromCategory(normalized);
      const field = family.field;
      const label = family.label;

      if (!fieldMap.has(field)) {
        fieldMap.set(field, { field, modes: [] });
      }

      const baseField = toBaseField(normalized);
      const routeForMode = label === 'Timetrial'
        ? `/overlay.html?veld=${encodeURIComponent(baseField)}`
        : `/overlay.html?veld=${encodeURIComponent(baseField)}&cat=${encodeURIComponent(normalized)}`;

      const mode = {
        label,
        cat: normalized,
        route: routeForMode
      };

      if (label === 'Timetrial') {
        mode.cat = baseField;
      }

      const existing = fieldMap.get(field).modes.find(m => m.cat === normalized && m.label === label);
      if (!existing) {
        fieldMap.get(field).modes.push(mode);
      }
    }

    Array.from(fieldMap.values()).forEach(item => {
      const startlistExists = item.modes.some(mode => mode.label === 'Startlijst');
      if (!startlistExists) {
        item.modes.push({
          label: 'Startlijst',
          cat: item.field,
          route: `/startlist.html?veld=${encodeURIComponent(item.field)}`
        });
      }
    });

    const orderedFields = Array.from(fieldMap.values()).map(item => ({
      field: item.field,
      modes: item.modes.sort((a, b) => normalizedSortOrder(a.label) - normalizedSortOrder(b.label))
    }));

    res.json({ fields: orderedFields });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to build dashboard view" });
  }
});

app.get("/api/finale", async (req, res) => {
  try {
    const veld = req.query.veld ? String(req.query.veld) : '';
    const cat = req.query.cat ? String(req.query.cat) : '';
    const data = await fetchResults();

    let filtered = data
      .filter(r => !isFamilyName(r.name));

    if (veld) {
      filtered = filtered.filter(r => categoryMatchesField(r.cat, veld));
    }

    if (cat) {
      filtered = filtered.filter(r => categoryMatchesFinalCategory(r.cat, cat));
    }

    const results = filtered
      .map(r => ({
        name: r.name,
        club: r.club,
        cat: r.cat,
        displayTime: r.ms === null ? '' : formatMsToTime(r.ms)
      }))
      .sort((a, b) => {
        const left = a.displayTime === '' ? Infinity : parseTimeToMs(a.displayTime.replace(/,/g, '.')) ?? Infinity;
        const right = b.displayTime === '' ? Infinity : parseTimeToMs(b.displayTime.replace(/,/g, '.')) ?? Infinity;
        return left - right;
      });

    const timed = filtered.filter(r => r.ms !== null);
    const untimed = filtered.filter(r => r.ms === null);
    const sortedTimed = [...timed].sort((a, b) => a.ms - b.ms);

    const fastest = sortedTimed[0] || untimed[0] || null;
    const second = sortedTimed[1] || untimed[1] || null;

    res.json({
      results,
      fastest: fastest
        ? { ...fastest, displayTime: fastest.ms === null ? '' : formatMsToTime(fastest.ms) }
        : null,
      second: second
        ? { ...second, displayTime: second.ms === null ? '' : formatMsToTime(second.ms) }
        : null
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch finale data" });
  }
});

function extractStartlistRows(html, veld) {
  const $ = load(html);
  const rows = [];

  $(".RowToSort").each((_, row) => {
    const cat = cleanDisplayText($(row).find(".LineCategory").first().text().trim());
    const club = cleanDisplayText($(row).find(".LineClub").first().text().trim());
    const name = cleanDisplayText($(row).find(".Name .Type_black_10").first().text().trim()
      || $(row).find(".Name").first().text().trim());

    if (!cat || !name) return;
    if (veld && !categoryMatchesField(cat, veld)) return;

    rows.push({ name, club, cat });
  });

  return rows;
}

async function fetchStartlist(veld) {
  let html = '';
  try {
    html = await readFile(LOCAL_STARTLIST_HTML, 'utf8');
  } catch (e) {
    const res = await fetch(RACE_STARTLIST_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9"
      }
    });

    if (!res.ok) {
      throw new Error(`Raceclocker startlist fetch failed: ${res.status} ${res.statusText}`);
    }

    html = await res.text();
  }

  const rows = extractStartlistRows(html, veld);
  return rows;
}

app.get("/api/startlist", async (req, res) => {
  try {
    const veld = req.query.veld ? String(req.query.veld) : '';
    const rows = await fetchStartlist(veld);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch startlist data" });
  }
});

app.get("/api/timetrial", async (req, res) => {
  try {
    const veld = req.query.veld ? String(req.query.veld) : '';
    const compact = req.query.compact === "1" || req.query.compact === "true";
    const data = await fetchResults();
    const filtered = (veld ? data.filter(r => categoryMatchesField(r.cat, veld)) : data)
      .filter(r => !isFamilyCategory(r.cat))
      .filter(r => !isFamilyName(r.name));

    const sorted = filtered
      .filter(r => r.ms !== null)
      .sort((a, b) => a.ms - b.ms);

    const list = sorted.map(r => ({
      name: compact ? shortenDisplayName(r.name, 24) : r.name,
      club: r.club,
      displayTime: formatMsToTime(r.ms)
    }));

    const missingRows = filtered
      .filter(r => r.ms === null)
      .map(r => ({
        name: compact ? shortenDisplayName(r.name, 24) : r.name,
        club: r.club,
        displayTime: formatMsToTime(null)
      }));

    res.json([...list, ...missingRows]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch timetrial data" });
  }
});

app.get("/api/live", async (req, res) => {
  try {
    const veld = req.query.veld ? String(req.query.veld) : '';
    const cat = req.query.cat ? String(req.query.cat) : '';
    const data = await fetchResults();
    const filtered = (veld ? data.filter(r => categoryMatchesField(r.cat, veld)) : data)
      .filter(r => !isFamilyName(r.name))
      .filter(r => cat ? categoryMatchesFinalCategory(r.cat, cat) : !isFamilyCategory(r.cat));

    const selected = selectLiveFastestAndLatest(filtered);
    const fastest = selected.fastest;
    const latest = selected.latest;

    if (!fastest || !latest) {
      res.json({ fastest: null, latest: null, diff: null, diffDisplay: null });
      return;
    }

    res.json({
      fastest: {
        ...fastest,
        displayTime: formatMsToTime(fastest.ms)
      },
      latest: {
        ...latest,
        displayTime: formatMsToTime(latest.ms)
      },
      diff: selected.diff,
      diffDisplay: selected.diffDisplay
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch live view data" });
  }
});

const isDirectlyRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectlyRun) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
