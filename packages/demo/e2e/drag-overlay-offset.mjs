// Regression test: the DragOverlay copy must follow the pointer without an offset that grows
// with the dragged row's index. Drags rows at several indices by a known vertical delta (no
// auto-scroll) and checks the floating copy's top == the row's start top + delta.
//
//   npx vite --port 5180 &
//   node e2e/drag-overlay-offset.mjs

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";
const INDICES = [0, 3, 8];
const DELTA = 100;
const TOLERANCE = 2;

const browser = await chromium.launch();
let ok = true;
for (const idx of INDICES) {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  await page.waitForSelector(".table-body", { timeout: 60000 });

  const handle = page.locator(".drag-handle").nth(idx);
  const box = await handle.boundingBox();
  const rowTop = await page.evaluate(
    (i) => document.querySelectorAll(".table-body .row")[i].getBoundingClientRect().top,
    idx,
  );
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 5 });
  await page.mouse.move(x, y + DELTA, { steps: 10 });
  await page.waitForTimeout(200);

  const overlayTop = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".row-active")].find((e) => !e.closest(".table-body"));
    return el ? el.getBoundingClientRect().top : null;
  });
  const expected = rowTop + DELTA;
  const pass = overlayTop !== null && Math.abs(overlayTop - expected) <= TOLERANCE;
  console.log(
    `indice ${idx}: overlay top=${overlayTop}, atteso=${expected}, scarto=${overlayTop === null ? "n/a" : overlayTop - expected} ${pass ? "OK" : "FALLITO"}`,
  );
  ok &&= pass;
  await page.mouse.up();
  await page.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
