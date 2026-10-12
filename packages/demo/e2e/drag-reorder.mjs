// Smoke test: drags the first row far past the visible viewport (forcing auto-scroll
// into rows that aren't mounted yet) and checks that the 10,000-row array comes out
// with no duplicates and no gaps. Run against a dev server on :5180.
//
//   npx vite --port 5180 &
//   node e2e/drag-reorder.mjs

import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
page.on("console", (msg) => console.log("[browser]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.error("[pageerror]", err));
page.on("response", (res) => {
  if (!res.ok()) console.log("[response]", res.status(), res.url());
});
page.on("requestfailed", (req) => {
  console.log("[requestfailed]", req.url(), req.failure()?.errorText);
});

// Vite's dev server needs to transform/optimize deps on the very first request, which can
// take a while on a cold CI runner — retry the navigation instead of failing on one slow load.
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await page.goto(URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector(".table-body", { timeout: 60000 });
    lastError = null;
    break;
  } catch (err) {
    lastError = err;
    console.log(`tentativo ${attempt} fallito, riprovo...`);
  }
}
if (lastError) throw lastError;

const handle = page.locator(".drag-handle").first();
const box = await handle.boundingBox();
if (!box) throw new Error("drag handle not found");

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 5 });
await page.mouse.move(box.x + box.width / 2, 700, { steps: 10 });
await page.waitForTimeout(1500); // let the edge auto-scroll run
await page.mouse.up();
await page.waitForTimeout(200);

const map = {};
const totalHeight = await page.evaluate(() => document.querySelector(".table-body").scrollHeight);
for (let s = 0; s <= totalHeight; s += 600) {
  await page.evaluate((y) => {
    document.querySelector(".table-body").scrollTop = y;
  }, s);
  await page.waitForTimeout(60);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".row")).map((r) => [
      r.querySelector(".td-index")?.textContent,
      r.querySelector(".td-name")?.textContent,
    ]),
  );
  for (const [idx, name] of rows) map[idx] = name;
}

await browser.close();

const indices = Object.keys(map).map(Number).sort((a, b) => a - b);
const names = new Set(Object.values(map));

const ok = indices.length === 10000 && indices[0] === 0 && indices[9999] === 9999 && names.size === 10000;

console.log(`indici osservati: ${indices.length} (atteso 10000)`);
console.log(`nomi unici: ${names.size} (atteso 10000, zero duplicati/buchi)`);
console.log(ok ? "OK: riordino integro dopo drag oltre viewport + auto-scroll" : "FALLITO");
process.exit(ok ? 0 : 1);
