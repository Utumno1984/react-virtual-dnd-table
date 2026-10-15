// Regression test: on drop, the DragOverlay copy must not animate back towards the drag's
// ORIGIN. Drags row FROM down to row TO (no auto-scroll), then samples the overlay's top every
// frame after mouse.up. Every sample must stay near the destination (never closer to the origin),
// and the moved record must end up at the destination row.
//
//   npx vite --port 5180 &
//   node e2e/drop-animation-destination.mjs

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";
const FROM = 2;
const TO = 6;
const ROW_HEIGHT = 36;
const TOLERANCE = 6;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
await page.goto(URL, { waitUntil: "load", timeout: 30000 });
await page.waitForSelector(".table-body", { timeout: 60000 });

const handle = page.locator(".drag-handle").nth(FROM);
const box = await handle.boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
const rowTop = await page.evaluate(
  (i) => document.querySelectorAll(".table-body .row")[i].getBoundingClientRect().top,
  FROM,
);
const nameAt = (i) =>
  page.evaluate(
    (n) => document.querySelectorAll(".table-body .row")[n].querySelector(".td-name").textContent,
    i,
  );
const movedName = await nameAt(FROM);

await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x, y + 10, { steps: 5 });
await page.mouse.move(x, y + (TO - FROM) * ROW_HEIGHT, { steps: 10 });
await page.waitForTimeout(200);

// Sample the overlay copy on every frame from now on.
await page.evaluate(() => {
  window.__samples = [];
  const tick = () => {
    const el = [...document.querySelectorAll(".row-active")].find((e) => !e.closest(".table-body"));
    window.__samples.push(el ? el.getBoundingClientRect().top : null);
    if (window.__samples.length < 90) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.mouse.up();
await page.waitForTimeout(1200);

const samples = (await page.evaluate(() => window.__samples)).filter((s) => s !== null);
const destTop = rowTop + (TO - FROM) * ROW_HEIGHT;
const closestToOrigin = samples.length ? Math.min(...samples) : null;
const finalName = await nameAt(TO);

console.log(`origine top=${rowTop}, destinazione top=${destTop}, campioni overlay=${samples.length}`);
console.log(`posizione overlay più vicina all'origine: ${closestToOrigin}`);
const noReturn = closestToOrigin === null || closestToOrigin >= destTop - TOLERANCE;
const landed = finalName === movedName;
console.log(`overlay non torna verso l'origine: ${noReturn ? "OK" : "FALLITO"}`);
console.log(`record "${movedName}" in posizione ${TO}: ${landed ? "OK" : `FALLITO (trovato "${finalName}")`}`);
await browser.close();
process.exit(noReturn && landed ? 0 : 1);
