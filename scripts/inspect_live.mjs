import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
await mkdir('work/audit', { recursive: true });
const report = [];
for (const [name, url] of [
  ['github', 'https://davidfreeborn.github.io/jstor-ai-ethics-atlas/'],
  ['sites', 'https://jstor-ai-ethics-atlas.dafidius.chatgpt.site/'],
]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders:
      name === 'sites'
        ? {
            'OAI-Sites-Authorization': `Bearer ${process.env.SITES_AUDIT_TOKEN}`,
          }
        : {},
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.locator('canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `work/audit/baseline-${name}.png` });
  const scale = await page.evaluate(() => {
    const read = (s) => {
      const e = document.querySelector(s),
        c = getComputedStyle(e),
        r = e.getBoundingClientRect();
      return {
        font: c.fontFamily,
        size: c.fontSize,
        width: r.width,
        height: r.height,
        zoom: c.zoom,
      };
    };
    return {
      root: read('html'),
      header: read('header'),
      title: read('h1'),
      tab: read('nav button'),
      sidebar: read('aside'),
      lens: read('aside button'),
      canvas: read('canvas'),
      dpr: devicePixelRatio,
      viewport: visualViewport.scale,
    };
  });
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  for (
    let round = 0;
    round < 10 &&
    !(await page.getByText('Workspace error', { exact: true }).count());
    round++
  ) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(() => {
      const c = document.querySelector('canvas'),
        b = c.getBoundingClientRect();
      for (let n = 0; n < 80; n++)
        c.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            clientX: b.x + b.width / 2 + n,
            clientY: b.y + b.height / 2 + 20,
            buttons: 1,
          }),
        );
      c.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 1,
          clientX: b.x + b.width / 2 + 80,
          clientY: b.y + b.height / 2 + 20,
        }),
      );
    });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  report.push({
    name,
    scale,
    errors,
    crashed:
      (await page.getByText('Workspace error', { exact: true }).count()) > 0,
  });
  await context.close();
}
console.log(JSON.stringify(report, null, 2));
await writeFile(
  'work/audit/live-baseline.json',
  JSON.stringify(report, null, 2),
);
await browser.close();
