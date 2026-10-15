// Regression test: the drop indicator (blue line) on the target row must be drawn on ONE side only:
// below the row when the record is dragged down (it will land after it), above the row when it is
// dragged up. Stops over the target without dropping and reads the row's computed box-shadow.
//
//   npx vite --port 5180 &
//   node e2e/drop-indicator-side.mjs

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";
const FROM = 4;
const ROW_HEIGHT = 36;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
await page.goto(URL, { waitUntil: "load", timeout: 30000 });
await page.waitForSelector(".table-body", { timeout: 60000 });

// Computed box-shadow looks like "rgb(79, 140, 255) 0px 2px 0px 0px inset": y offset 2 = top line,
// y offset -2 = bottom line.
const sides = (shadow) => ({
  top: /0px 2px 0px 0px inset/.test(shadow),
  bottom: /0px -2px 0px 0px inset/.test(shadow),
});

async function check(label, delta, expected) {
  const handle = page.locator(".drag-handle").nth(FROM);
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (delta > 0 ? 10 : -10), { steps: 5 });
  await page.mouse.move(x, y + delta * ROW_HEIGHT, { steps: 10 });
  await page.waitForTimeout(200);
  const shadows = await page.evaluate(
    (target) => {
      const rows = [...document.querySelectorAll(".table-body .row")];
      return rows.map((r) => getComputedStyle(r).boxShadow);
    },
    FROM + delta,
  );
  const withLine = shadows
    .map((s, i) => ({ i, ...sides(s) }))
    .filter((r) => r.top || r.bottom);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const ok =
    withLine.length === 1 &&
    withLine[0].i === FROM + delta &&
    withLine[0].top === expected.top &&
    withLine[0].bottom === expected.bottom;
  console.log(`${label}: righe con linea = ${JSON.stringify(withLine)} -> ${ok ? "OK" : "FALLITO"}`);
  if (!ok) console.log("  box-shadow delle prime righe:", shadows.slice(0, 10));
  return ok;
}

// Down: record lands after the target -> only the bottom line. Then the table has reordered, so
// reload to start from a known state for the upward drag.
const down = await check("trascinamento verso il basso", 2, { top: false, bottom: true });
await page.reload({ waitUntil: "load" });
await page.waitForSelector(".table-body");
const up = await check("trascinamento verso l'alto", -2, { top: true, bottom: false });

await browser.close();
process.exit(down && up ? 0 : 1);
