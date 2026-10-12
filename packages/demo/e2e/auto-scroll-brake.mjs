// Regression test for a real bug: moving the pointer back from the edge of the scroll
// container must stop auto-scroll immediately. It didn't, because dnd-kit compensates its
// own `event.delta` for container scroll, which fed back into more auto-scroll — the only
// way out was scrolling all the way back to the start. Run against a dev server on :5180.
//
//   npx vite --port 5180 &
//   node e2e/auto-scroll-brake.mjs

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
await page.goto(URL, { waitUntil: "load", timeout: 30000 });
await page.waitForSelector(".table-body", { timeout: 60000 });

const handle = page.locator(".drag-handle").first();
const box = await handle.boundingBox();
if (!box) throw new Error("drag handle not found");

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 5 });

// move near the bottom edge of the container to trigger auto-scroll
await page.mouse.move(box.x + box.width / 2, 700, { steps: 10 });
await page.waitForTimeout(800);
const scrolling = await page.evaluate(() => document.querySelector(".table-body").scrollTop);
await page.waitForTimeout(500);
const stillScrolling = await page.evaluate(() => document.querySelector(".table-body").scrollTop);
console.log(`scrollTop vicino al bordo: ${scrolling} -> ${stillScrolling} (deve crescere)`);

// now move the pointer back toward the middle of the viewport, away from any edge
await page.mouse.move(box.x + box.width / 2, 400, { steps: 10 });
await page.waitForTimeout(400);
const afterMove1 = await page.evaluate(() => document.querySelector(".table-body").scrollTop);
await page.waitForTimeout(700);
const afterMove2 = await page.evaluate(() => document.querySelector(".table-body").scrollTop);
console.log(`scrollTop dopo il centro: ${afterMove1} -> ${afterMove2} (deve fermarsi)`);

await page.mouse.up();
await browser.close();

const grew = stillScrolling > scrolling;
const braked = afterMove1 === afterMove2;
const ok = grew && braked;

console.log(ok ? "OK: auto-scroll si attiva e si ferma correttamente" : "FALLITO");
process.exit(ok ? 0 : 1);
