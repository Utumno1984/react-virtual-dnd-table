import { chromium } from "playwright";

const URL = process.env.DEMO_URL || "http://localhost:5180/";
const outDir = process.argv[2] || "/tmp/demo-video";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 860, height: 560 },
  recordVideo: { dir: outDir, size: { width: 860, height: 560 } },
});
const page = await context.newPage();
await page.goto(URL);
await page.waitForSelector(".table-body");
await page.waitForTimeout(400);

const handle = page.locator(".drag-handle").first();
const box = await handle.boundingBox();

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 10 });
await page.waitForTimeout(300);
await page.mouse.move(box.x + box.width / 2, 480, { steps: 20 });
await page.waitForTimeout(1600); // let auto-scroll run and show off-screen reorder
await page.mouse.up();
await page.waitForTimeout(600);

// scroll back to top to show the final, reordered state
await page.evaluate(() => {
  document.querySelector(".table-body").scrollTo({ top: 0, behavior: "smooth" });
});
await page.waitForTimeout(1200);

await context.close();
await browser.close();
console.log("video salvato in", outDir);
