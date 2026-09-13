import express from "express";
import { readFile } from "node:fs/promises";

const app = express();
const PORT = 5000;
const RACE_URL = "https://www.raceclocker.com/0790c73f";
const LOCAL_HTML = "raceclocker-page.html";

app.use(express.static("public"));

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
  const totalSec = Math.max(0, ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  const sec = Math.floor(s * 100) / 100;
  const mm = String(m).padStart(2, "0");
  const ss = sec.toFixed(2).padStart(5, "0");
  return `${mm}:${ss}`;
}

function shortenDisplayName(name, maxLength = 24) {
  if (!name) return "";

  const normalized = String(name).trim();

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

async function fetchResults() {
  let html = '';

  try {
    html = await readFile(LOCAL_HTML, "utf8");
    console.log('local_html_loaded', LOCAL_HTML, html.length);
  } catch (e) {
    console.log('local_html_miss', e.message);
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
  }

  const allResults = extractAllResults(html);
  console.log('allResults_len', allResults.length);

  const mapped = allResults
    .map(row => {
      const result = row.Result || "";
      const ms = parseTimeToMs(result);
      if (ms === null) return null;

      return {
        name: row.Name || "",
        cat: row.Cat || "",
        club: row.Club || "",
        start: row.TmSplit1 || "",
        finish: row.TmSplit5 || row.Result || "",
        result,
        penalty: row.Penalty || "",
        ms
      };
    })
    .filter(Boolean);

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

app.get("/api/finale", async (req, res) => {
  try {
    const veld = req.query.veld;
    const data = await fetchResults();
    const filtered = veld ? data.filter(r => r.cat === veld) : data;

    const sorted = filtered.sort((a, b) => a.ms - b.ms);
    const fastest = sorted[0] || null;
    const second = sorted[1] || null;

    res.json({
      fastest: fastest
        ? { ...fastest, displayTime: formatMsToTime(fastest.ms) }
        : null,
      second: second
        ? { ...second, displayTime: formatMsToTime(second.ms) }
        : null
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch finale data" });
  }
});

app.get("/api/timetrial", async (req, res) => {
  try {
    const veld = req.query.veld;
    const compact = req.query.compact === "1" || req.query.compact === "true";
    const data = await fetchResults();
    const filtered = veld ? data.filter(r => r.cat === veld) : data;
    const sorted = filtered.sort((a, b) => a.ms - b.ms);
    const list = sorted.map(r => ({
      name: compact ? shortenDisplayName(r.name, 24) : r.name,
      cat: r.cat,
      club: r.club,
      displayTime: formatMsToTime(r.ms)
    }));
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch timetrial data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
