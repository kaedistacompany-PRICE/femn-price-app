// scripts/update-history.js
// Run by the GitHub Action on every push.
// Reads data.json, appends a dated snapshot of all product prices
// into history.json (creating it if needed), and avoids duplicate
// same-day entries by overwriting today's entry instead of stacking it.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data.json");
const HISTORY_PATH = path.join(__dirname, "..", "history.json");

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function todayTehranDate() {
  // Use Tehran timezone so the date matches the business day in Iran
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date()); // "YYYY-MM-DD"
}

// تبدیل تاریخ میلادی به جلالی (شمسی) - الگوریتم استاندارد و متن‌باز
function gregorianToJalaliStr(isoDate) {
  const [gy, gm, gd] = isoDate.split("-").map(Number);
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy;
  let y = gy;
  if (y > 1600) {
    jy = 979;
    y -= 1600;
  } else {
    jy = 0;
    y -= 621;
  }
  const gy2 = gm > 2 ? y + 1 : y;
  let days =
    365 * y +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

function main() {
  const data = readJsonSafe(DATA_PATH, { products: [] });
  const history = readJsonSafe(HISTORY_PATH, []);

  const today = todayTehranDate();

  const snapshot = {
    date: today,
    date_fa: gregorianToJalaliStr(today),
    products: (data.products || []).map((p) => ({
      id: p.id,
      name: p.name,
      prices: (p.prices || []).map((pr) => ({
        label: pr.label || "",
        price: pr.price,
        unit: pr.unit || ""
      }))
    }))
  };

  // If today's entry already exists (e.g. you pushed twice in one day),
  // replace it instead of creating a duplicate point on the chart.
  const existingIndex = history.findIndex((h) => h.date === today);
  if (existingIndex >= 0) {
    history[existingIndex] = snapshot;
  } else {
    history.push(snapshot);
  }

  // Keep history sorted by date just in case
  history.sort((a, b) => (a.date > b.date ? 1 : -1));

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf8");
  console.log(`history.json updated for ${today} (${history.length} total entries)`);
}

main();
