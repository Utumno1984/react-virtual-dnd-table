// Regression test for a real bug: while auto-scroll carries the list far from where the drag
// started, the dragged row's original index leaves TanStack Virtual's mounted window, so its
// <DraggableRow> unmounts and the row visually vanishes until drop. The dragged row must stay
// visible, near the pointer, for the whole drag. Run against a dev server on :5180.
//
//   npx vite --port 5180 &
//   node e2e/dragged-row-visible.mjs [screenshot-path]

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";
const SHOT = process.argv[2];
const VIEWPORT_H = 760;
const POINTER_Y = 700;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: VIEWPORT_H } });
await page.goto(URL, { waitUntil: "load", timeout: 30000 });
await page.waitForSelector(".table-body", { timeout: 60000 });

const handle = page.locator(".drag-handle").first();
const box = await handle.boundingBox();
if (!box) throw new Error("drag handle not found");
const x = box.x + box.width / 2;

await page.mouse.move(x, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(x, box.y + 10, { steps: 5 });
await page.mouse.move(x, POINTER_Y, { steps: 10 });

// Row 0 is the one being dragged ("Elemento 0" is unique until the drop reorders anything).
// Auto-scroll well past the overscan window, then check the dragged row is still visible.
let scrollTop = 0;
let visible = false;
let rowTop = null;
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(500);
  scrollTop = await page.evaluate(() => document.querySelector(".table-body").scrollTop);
  const rects = await page.evaluate(() =>
    [...document.querySelectorAll(".td-name")]
      .filter((el) => el.textContent === "Elemento 0")
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({ top: r.top, bottom: r.bottom })),
  );
  rowTop = rects.length ? rects[0].top : null;
  visible = rects.some((r) => r.bottom > 0 && r.top < VIEWPORT_H && Math.abs(r.top - POINTER_Y) < 200);
}

console.log(`scrollTop a metà drag: ${scrollTop}, riga attiva top=${rowTop}, puntatore y=${POINTER_Y}`);
if (SHOT) await page.screenshot({ path: SHOT });

await page.mouse.up();
await browser.close();

const scrolledFar = scrollTop > 36 * (12 + 25); // beyond overscan + viewport
if (!scrolledFar) console.log("ATTENZIONE: scroll insufficiente per riprodurre il caso");
const ok = scrolledFar && visible;
console.log(ok ? "OK: la riga trascinata resta visibile durante l'auto-scroll" : "FALLITO: la riga trascinata è sparita");
process.exit(ok ? 0 : 1);
