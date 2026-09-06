import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium, firefox } from 'playwright';

const url =
  process.env.ATLAS_URL || 'http://127.0.0.1:4173/jstor-ai-ethics-atlas/';
const server = process.env.ATLAS_URL
  ? null
  : spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--config',
        'vite.pages.config.ts',
        '--host',
        '127.0.0.1',
        '--port',
        '4173',
        '--strictPort',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
const data = JSON.parse(await readFile('public/data/map.json', 'utf8'));
const hash = (ids) => {
  let h = 2166136261;
  for (const id of [...ids].sort())
    for (const c of id + '\n') h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
};
const report = { url, errors: [], checks: [], performance: [] };
const browser = await (
  process.env.ATLAS_BROWSER === 'firefox' ? firefox : chromium
).launch({ headless: true });
const output =
  process.env.ATLAS_AUDIT_DIR ||
  `work/audit/${process.env.ATLAS_BROWSER || 'chromium'}-${new URL(url).host.replaceAll(':', '-')}`;
await mkdir(output, { recursive: true });
try {
  for (let retry = 0; retry < 80; retry++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: process.env.SITES_AUDIT_TOKEN
      ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_AUDIT_TOKEN}` }
      : {},
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.stack));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(m.text());
  });
  await page.goto(url);
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await canvas.evaluate((c) => {
    c.dataset.audit = 'true';
  });
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const stats = async () => {
    await page.waitForFunction(
      () => !!document.querySelector('canvas')?.dataset.renderer,
    );
    return canvas.evaluate((c) => JSON.parse(c.dataset.renderer));
  };
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await tick();
  const start = await stats();
  assert.equal(start.camera.zoom, 1.25 ** 5.5);
  assert(start.visible > 4900 && start.visible < 6700);
  report.scale = await page.evaluate(() => {
    const read = (s) => {
      const e = document.querySelector(s),
        c = getComputedStyle(e),
        r = e.getBoundingClientRect();
      return {
        font: c.fontFamily,
        size: c.fontSize,
        width: r.width,
        height: r.height,
      };
    };
    return {
      title: read('h1'),
      tab: read('nav button'),
      sidebar: read('aside'),
      lens: read('aside button'),
      canvas: read('canvas'),
    };
  });
  assert.equal(report.scale.lens.size, '14px');
  assert.equal(report.scale.tab.size, '14px');
  assert.equal(report.scale.sidebar.width, 296);
  await page.screenshot({ path: `${output}/new-default.png` });
  // Same-task moves followed by pointer-up reproduced the null-reference failure on BOTH old live hosts.
  let bounds = await canvas.boundingBox();
  for (let round = 0; round < 40; round++) {
    await page.mouse.move(
      bounds.x + bounds.width * 0.45,
      bounds.y + bounds.height * 0.45,
    );
    await page.mouse.down();
    await canvas.evaluate((c, round) => {
      const b = c.getBoundingClientRect();
      for (let n = 0; n < 80; n++) {
        c.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            clientX: b.x + b.width * 0.45 + n,
            clientY: b.y + b.height * 0.45 + 20,
            buttons: 1,
          }),
        );
        if (n % 4 === 0)
          c.dispatchEvent(
            new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: b.x + b.width / 2,
              clientY: b.y + b.height / 2,
              deltaY: n % 8 ? -150 : 150,
              deltaMode: round % 3,
            }),
          );
      }
      c.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 1,
          clientX: b.x + b.width * 0.45 + 80,
          clientY: b.y + b.height * 0.45 + 20,
        }),
      );
    }, round);
    await page.mouse.up();
    await tick();
    report.performance.push(await stats());
  }
  assert.equal((await stats()).allocations, start.allocations);
  assert.equal(
    await page.getByText('Workspace error', { exact: true }).count(),
    0,
  );
  report.checks.push(
    '40 rapid drag/release bursts; 3,200 moves and 800 mixed-mode wheel events; no navigation buffer reallocations',
  );
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await tick();
  const clickCamera = (await stats()).camera,
    b = await canvas.boundingBox(),
    base = Math.min(
      (b.width - 60) / (data.geometry.bounds.x[1] - data.geometry.bounds.x[0]),
      (b.height - 60) / (data.geometry.bounds.y[1] - data.geometry.bounds.y[0]),
    );
  const targets = data.points
    .map((p) => ({
      x: b.x + b.width / 2 + (p.x - clickCamera.x) * base * clickCamera.zoom,
      y: b.y + b.height / 2 - (p.y - clickCamera.y) * base * clickCamera.zoom,
    }))
    .filter((p) => p.x > b.x + 300 && p.x < 1000 && p.y > 300 && p.y < 720);
  for (let i = 0; i < 120; i++) {
    const target = targets[(i * 31) % targets.length];
    await page.mouse.click(target.x, target.y);
    assert(
      await page
        .getByRole('button', { name: 'Close paper details' })
        .isVisible(),
    );
  }
  await page.getByRole('button', { name: 'Deselect papers' }).click();
  await tick();
  assert.equal(
    await page.getByRole('button', { name: 'Close paper details' }).count(),
    0,
  );
  assert(
    await page.getByRole('button', { name: 'Deselect papers' }).isDisabled(),
  );
  report.checks.push('120 real pointer paper selections and detail renders');
  await page.getByRole('button', { name: /BERTopic — 26 topics/ }).click();
  const topic = [...data.topics.bertopic]
    .filter((t) => t.id >= 0)
    .sort((a, b) => b.count - a.count)[0];
  await page.getByRole('button').filter({ hasText: topic.label }).click();
  await tick();
  const expectedIds = data.points
      .filter((p) => p.bertopic === topic.id)
      .map((p) => p.id),
    selected = await stats();
  assert.equal(selected.selected, expectedIds.length);
  assert.equal(selected.selectionHash, hash(expectedIds));
  for (const name of [
    'LDA — 37 topics',
    'Publisher',
    'Journal',
    'Keywords',
    'Neighbourhood agreement',
    'All papers',
  ]) {
    await page.getByRole('button', { name: new RegExp('^' + name) }).click();
    await tick();
    assert.equal((await stats()).selectionHash, selected.selectionHash);
  }
  report.checks.push('Exact topic selection IDs preserved across six lenses');
  const beforeDeselect = await stats();
  await page.getByRole('button', { name: 'Deselect papers' }).click();
  await tick();
  assert.equal((await stats()).selectionHash, null);
  assert.deepEqual((await stats()).camera, beforeDeselect.camera);
  assert(
    await page.getByRole('button', { name: 'Deselect papers' }).isDisabled(),
  );
  assert.equal(await page.getByLabel('Persistent paper selection').count(), 0);
  await page.getByRole('button', { name: /BERTopic — 26 topics/ }).click();
  await page.getByRole('button').filter({ hasText: topic.label }).click();
  await page.getByRole('button', { name: /^All papers/ }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('canvas')
      ?.getAttribute('aria-label')
      ?.startsWith('3D'),
  );
  await tick();
  assert.equal((await stats()).selectionHash, selected.selectionHash);
  assert.equal((await stats()).dimension, '3d');
  await page.screenshot({ path: `${output}/new-3d-selected.png` });
  const beforeEscape = await stats();
  await page.getByRole('textbox', { name: 'Search papers' }).focus();
  await page.keyboard.press('Escape');
  await tick();
  assert.equal((await stats()).selectionHash, beforeEscape.selectionHash);
  await canvas.focus();
  await page.keyboard.press('Escape');
  await tick();
  assert.equal((await stats()).selectionHash, null);
  assert.deepEqual((await stats()).camera, beforeEscape.camera);
  await page.getByRole('button', { name: /BERTopic — 26 topics/ }).click();
  await page.getByRole('button').filter({ hasText: topic.label }).click();
  await page.getByRole('button', { name: /^All papers/ }).click();
  report.checks.push(
    'Toolbar and Escape deselect across lenses/dimensions without moving the camera; search Escape leaves selection intact',
  );
  for (let i = 0; i < 25; i++) {
    await canvas.evaluate((c, i) => {
      const b = c.getBoundingClientRect(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      for (const type of ['pointerdown', 'pointermove', 'pointercancel'])
        c.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 7,
            clientX: x + (type === 'pointermove' ? 80 : 0),
            clientY: y + 30,
            button: 0,
            buttons: 1,
            shiftKey: i % 2 === 0,
          }),
        );
      for (let n = 0; n < 30; n++)
        c.dispatchEvent(
          new WheelEvent('wheel', {
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaY: n % 2 ? -600 : 600,
          }),
        );
    }, i);
    await tick();
    report.performance.push(await stats());
  }
  const beforePinch = (await stats()).camera.distance;
  await canvas.evaluate((c) => {
    const b = c.getBoundingClientRect(),
      x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    for (const [id, dx] of [
      [10, -20],
      [11, 20],
    ])
      c.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          clientX: x + dx,
          clientY: y,
        }),
      );
    c.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 11,
        pointerType: 'touch',
        clientX: x + 90,
        clientY: y,
      }),
    );
    for (const id of [10, 11])
      c.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      );
  });
  await tick();
  assert.notEqual((await stats()).camera.distance, beforePinch);
  assert.equal((await stats()).pointers, 0);
  await page.getByRole('button', { name: 'Clear paper selection' }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await tick();
  // Sustained movement in the populated view, not just extreme zoom/empty frames.
  for (const mode of ['3D', '2D']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await page.getByRole('button', { name: /^Publisher/ }).click();
    await tick();
    const samples = await canvas.evaluate(async (c) => {
      const b = c.getBoundingClientRect(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2,
        samples = [];
      for (let i = 0; i < 100; i++) {
        c.dispatchEvent(
          new WheelEvent('wheel', {
            cancelable: true,
            clientX: x,
            clientY: y,
            deltaY: i % 2 ? -30 : 30,
          }),
        );
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        samples.push(JSON.parse(c.dataset.renderer));
      }
      return samples;
    });
    assert(samples.every((s) => s.visible > 4500));
    report.performance.push(...samples);
  }
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await tick();
  await page.screenshot({ path: `${output}/new-3d.png` });
  const three = await stats();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await tick();
  assert.deepEqual((await stats()).camera, three.camera);
  report.checks.push(
    '3D orbit/pan/cancel/pinch/zoom; dimension changes preserve camera and selection',
  );
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.getByRole('button', { name: 'Select area', exact: true }).click();
  bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.3,
    bounds.y + bounds.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.6,
    { steps: 10 },
  );
  await page.mouse.up();
  await tick();
  assert((await stats()).selected > 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'Select area', exact: true })
      .getAttribute('aria-pressed'),
    'false',
  );
  const boxHash = (await stats()).selectionHash;
  await page.getByRole('button', { name: /^LDA — 37 topics/ }).click();
  await tick();
  assert.equal((await stats()).selectionHash, boxHash);
  report.checks.push(
    'Box-selected group survives lens changes, including missing assignments',
  );
  await page.getByRole('button', { name: 'Clear paper selection' }).click();
  await page.getByRole('button', { name: /^Keywords/ }).click();
  const keyword = data.facets.keywords[0];
  await page
    .getByRole('button', {
      name: `Select ${keyword.value} papers`,
      exact: true,
    })
    .click();
  await tick();
  assert.equal(
    (await stats()).selectionHash,
    hash(
      data.points
        .filter((p) => p.keywords.includes(keyword.value))
        .map((p) => p.id),
    ),
  );
  await page.getByRole('button', { name: /^Publisher/ }).click();
  await tick();
  assert.equal((await stats()).selected, keyword.count);
  const paletteBefore = await page
    .getByRole('checkbox')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-checked')),
    );
  await page.getByRole('button', { name: 'Deselect papers' }).click();
  await tick();
  assert.equal((await stats()).selectionHash, null);
  assert.deepEqual(
    await page
      .getByRole('checkbox')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-checked')),
      ),
    paletteBefore,
  );
  await page.getByRole('button', { name: /^Keywords/ }).click();
  await page
    .getByRole('button', {
      name: `Select ${keyword.value} papers`,
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: /^Publisher/ }).click();
  for (let i = 0; i < 20; i++) {
    const checkbox = page.getByRole('checkbox').nth(i % 10);
    await checkbox.click();
  }
  report.checks.push(
    'Keyword membership agrees with data; rapid atomic palette toggles',
  );
  await page.getByRole('button', { name: 'Clear paper selection' }).click();
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  await tick();
  assert.equal((await stats()).visible, 7076);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.mouse.move(20, 20);
  await tick();
  const idle = (await stats()).frames;
  await page.waitForTimeout(500);
  assert.equal((await stats()).frames, idle);
  report.checks.push('Fit all contains 7,076 points; idle renderer stops');
  await page
    .getByRole('button', { name: 'Correlation matrices', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Minimise pairwise association' })
    .click();
  await page.screenshot({ path: `${output}/new-matrix.png` });
  await page
    .getByRole('button', { name: 'Pairwise association', exact: true })
    .click();
  await page.screenshot({ path: `${output}/new-overview.png` });
  await page.getByRole('button', { name: 'Papers', exact: true }).click();
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await tick();
    assert(await canvas.isVisible());
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${output}/responsive-${viewport.width}.png`,
    });
  }
  await page.getByRole('button', { name: 'Methodology', exact: true }).click();
  await page.screenshot({ path: `${output}/new-methodology.png` });
  await page.keyboard.press('Escape');
  // An invalid optional asset must leave a working 2D renderer and offer a genuine retry.
  await page.route('**/projection-3d.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ids":[],"coordinates":[]}',
    }),
  );
  await page.reload();
  await canvas.waitFor();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByText('3D coordinates do not match the catalogue.').waitFor();
  assert(await canvas.isVisible());
  await page.unroute('**/projection-3d.json');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('canvas')
      ?.getAttribute('aria-label')
      ?.startsWith('3D'),
  );
  report.checks.push('Invalid 3D asset stays isolated; retry recovers');
  // Repeated unmounts must not leak document listeners, canvases, or retained atlas heaps.
  const cdp =
    process.env.ATLAS_BROWSER === 'firefox'
      ? null
      : await context.newCDPSession(page);
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    report.heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  }
  for (let i = 0; i < 20; i++) {
    await page
      .getByRole('button', { name: 'Correlation matrices', exact: true })
      .click();
    await page.getByRole('button', { name: 'Papers', exact: true }).click();
    await canvas.waitFor();
  }
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    report.heapAfter = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    assert(
      report.heapAfter < report.heapBefore + 12_000_000,
      `Retained heap grew unexpectedly: ${report.heapBefore} → ${report.heapAfter}`,
    );
  }
  report.checks.push(
    '20 workspace remounts; desktop/narrow layout; unchanged idle state',
  );
  await context.close();
  if (process.env.ATLAS_BROWSER !== 'firefox') {
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: process.env.SITES_AUDIT_TOKEN
        ? {
            'OAI-Sites-Authorization': `Bearer ${process.env.SITES_AUDIT_TOKEN}`,
          }
        : {},
    });
    const mobile = await touch.newPage();
    mobile.on('pageerror', (e) => report.errors.push(e.stack));
    await mobile.goto(url);
    await mobile.locator('canvas').waitFor();
    await mobile.locator('canvas').evaluate((c) => (c.dataset.audit = 'true'));
    await mobile
      .getByRole('button', { name: 'Reset view', exact: true })
      .click();
    await mobile.waitForFunction(
      () => !!document.querySelector('canvas')?.dataset.renderer,
    );
    const session = await touch.newCDPSession(mobile);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: 130, y: 400 },
        { id: 2, x: 230, y: 400 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: 90, y: 405 },
        { id: 2, x: 270, y: 405 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await mobile.waitForFunction(
      () =>
        JSON.parse(document.querySelector('canvas').dataset.renderer).camera
          .zoom >
        1.25 ** 5.5,
    );
    await mobile.getByRole('button', { name: 'Lens', exact: true }).click();
    await mobile.getByRole('button', { name: /^Keywords/ }).click();
    await mobile
      .getByRole('button', {
        name: `Select ${keyword.value} papers`,
        exact: true,
      })
      .click();
    await mobile.keyboard.press('Escape');
    await mobile
      .getByRole('dialog', { name: 'Lens', exact: true })
      .waitFor({ state: 'hidden' });
    assert(await mobile.locator('canvas').isVisible());
    await mobile.getByLabel('Persistent paper selection').waitFor();
    const mobileCamera = await mobile
      .locator('canvas')
      .evaluate((c) => JSON.parse(c.dataset.renderer).camera);
    await mobile.screenshot({ path: `${output}/mobile-selected.png` });
    await mobile.getByRole('button', { name: 'Deselect papers' }).tap();
    await mobile.waitForFunction(
      () =>
        JSON.parse(document.querySelector('canvas').dataset.renderer)
          .selectionHash === null,
    );
    assert.deepEqual(
      await mobile
        .locator('canvas')
        .evaluate((c) => JSON.parse(c.dataset.renderer).camera),
      mobileCamera,
    );
    assert.equal(
      await mobile.getByLabel('Persistent paper selection').count(),
      0,
    );
    await touch.close();
    report.checks.push(
      'Native two-finger touch input, mobile lens panel, and tap-to-deselect at 3× pixel density',
    );
  }
  assert.deepEqual(report.errors, []);
  console.log(
    JSON.stringify(
      {
        checks: report.checks,
        scale: report.scale,
        drawMs: report.performance
          .map((s) => s.lastDrawMs)
          .sort((a, b) => a - b)
          .filter(
            (_, i, a) =>
              i === Math.floor(a.length * 0.5) ||
              i === Math.floor(a.length * 0.95),
          ),
        errors: report.errors,
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile(
    `${output}/browser-audit.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  server?.kill();
}
