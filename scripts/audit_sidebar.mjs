import assert from 'node:assert/strict';

export async function auditSidebar(page, data, output, report) {
  const keyword = data.facets.keywords[0];
  const canvas = page.locator('canvas');
  await canvas.evaluate((c) => {
    c.dataset.audit = 'true';
  });
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  const stats = async () => {
    await page.waitForFunction(
      () => !!document.querySelector('canvas')?.dataset.renderer,
    );
    return canvas.evaluate((c) => JSON.parse(c.dataset.renderer));
  };
  const hash = (ids) => {
    let h = 2166136261;
    for (const id of [...ids].sort())
      for (const c of id + '\n') h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0).toString(16);
  };
  // Selecting a keyword directly highlights its papers.
  await page.getByRole('combobox',{name:'Lens',exact:true}).selectOption('keywords');
  const keywordControls=page.getByRole('region',{name:'keywords',exact:true});
  assert.equal(await keywordControls.locator('.facet-choice').count(),data.facets.keywords.length);
  const keywordButton=value=>keywordControls.locator('.facet-choice').filter({hasText:value});
  const highlightKeyword=keywordButton(keyword.value);
  await highlightKeyword.click();await tick();
  assert.equal(await highlightKeyword.getAttribute('aria-pressed'),'true');
  assert.equal((await stats()).selectionHash,hash(data.points.filter(p=>p.keywords.includes(keyword.value)).map(p=>p.id)));
  await highlightKeyword.focus();await page.keyboard.press('Space');await tick();
  assert.equal((await stats()).selectionHash,null);
  const secondKeyword = data.facets.keywords[1];
  const highlightSecond = keywordButton(secondKeyword.value);
  const keywordIds = (values) =>
    data.points
      .filter((p) => p.keywords.some((k) => values.includes(k)))
      .map((p) => p.id);
  await highlightKeyword.click();
  await highlightSecond.click();
  await tick();
  assert.equal(await highlightKeyword.getAttribute('aria-pressed'), 'true');
  assert.equal(await highlightSecond.getAttribute('aria-pressed'), 'true');
  assert.equal(
    (await stats()).selectionHash,
    hash(keywordIds([keyword.value, secondKeyword.value])),
  );
  await highlightKeyword.click();
  await tick();
  assert.equal(
    (await stats()).selectionHash,
    hash(keywordIds([secondKeyword.value])),
  );
  assert.equal(await highlightSecond.getAttribute('aria-pressed'), 'true');
  await highlightKeyword.click();
  await page.screenshot({ path: `${output}/multiple-keywords.png` });
  await page
    .getByRole('combobox', { name: 'Lens', exact: true })
    .selectOption('bertopic');
  const topics = data.topics.bertopic.slice(0, 2);
  const topicButton = (topic) =>
    page
      .getByRole('region', { name: 'Atlas controls', exact: true })
      .getByRole('button')
      .filter({ hasText: topic.label });
  for (const topic of topics) await topicButton(topic).click();
  await tick();
  const topicIds = data.points
    .filter((p) => topics.some((t) => t.id === p.bertopic))
    .map((p) => p.id);
  assert.equal((await stats()).selectionHash, hash(topicIds));
  for (const topic of topics)
    assert.equal(await topicButton(topic).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${output}/multiple-topics.png` });
  await topicButton(topics[0]).click();
  await tick();
  assert.equal((await stats()).selectionHash,hash(data.points.filter(p=>p.bertopic===topics[1].id).map(p=>p.id)));
  await page.getByRole('combobox',{name:'Lens',exact:true}).selectOption('keywords');
  assert.equal(await highlightKeyword.getAttribute('aria-pressed'),'false');
  assert.equal(await highlightSecond.getAttribute('aria-pressed'),'false');
  await page.getByRole('button', { name: 'Deselect papers' }).click();
  await tick();
  assert.equal((await stats()).selectionHash, null);
  report.checks.push(
    'Multiple keywords and topics: exact within-lens union, individual removal, replacement on selecting another lens and clear-all',
  );
  const tailKeyword = data.facets.keywords.at(-1).value;
  await page
    .getByRole('textbox', { name: 'Search keywords', exact: true })
    .fill(tailKeyword);
  assert(
    await page
      .locator('.facet-choice').filter({hasText:tailKeyword})
      .count(),
  );
  await page
    .getByRole('textbox', { name: 'Search keywords', exact: true })
    .fill('___no_such_keyword___');
  await page.getByText('No matching keywords.', { exact: true }).waitFor();
  await page
    .getByRole('textbox', { name: 'Search keywords', exact: true })
    .fill('');
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1280, height: 600 },
    { width: 1024, height: 600 },
    { width: 800, height: 450 },
    { width: 640, height: 360 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 320, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 640) {
      await page.getByRole('button', { name: 'Lens', exact: true }).click();
    }
    const controls = page.getByRole('region', {
      name: 'Atlas controls',
      exact: true,
    });
    const last = controls.locator('.facet-choice').filter({hasText:tailKeyword});
    await last.scrollIntoViewIfNeeded();
    assert(await last.isVisible());
    const bounds = await last.boundingBox();
    assert(
      bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
      `Last keyword is reachable at ${viewport.width}×${viewport.height}`,
    );
    const dimensions = await controls.evaluate((el) => ({
      client: el.clientHeight,
      content: el.scrollHeight,
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      top: el.scrollTop,
    }));
    assert(dimensions.top > 0 && dimensions.content > dimensions.client);
    assert(
      dimensions.scrollWidth <= dimensions.width + 1,
      'Wrapped names do not overflow sideways',
    );
    assert(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.querySelector('main').getBoundingClientRect().height <= innerHeight + 1,
      ),
      'The atlas fits the viewport; methodology remains below it in document flow',
    );
    await controls
      .getByRole('textbox', { name: 'Search keywords', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/keywords-${viewport.width}x${viewport.height}.png`,
      animations: 'disabled',
    });
    if (viewport.width < 640) {
      await page
        .getByRole('dialog', { name: 'Lens', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: 'Lens', exact: true })
        .waitFor({ state: 'hidden' });
    }
  }
  await page.setViewportSize({ width: 960, height: 540 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  const enlargedUsesSheet = await page
    .getByRole('button', { name: 'Lens', exact: true })
    .isVisible();
  if (enlargedUsesSheet)
    await page.getByRole('button', { name: 'Lens', exact: true }).click();
  const enlargedControls = page.getByRole('region', {
    name: 'Atlas controls',
    exact: true,
  });
  const enlargedLast = enlargedControls.locator('.facet-choice').filter({hasText:tailKeyword});
  await enlargedLast.scrollIntoViewIfNeeded();
  assert((await enlargedLast.boundingBox()).y < 540);
  assert(
    await enlargedControls.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    ),
  );
  await enlargedControls
    .getByRole('textbox', { name: 'Search keywords', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${output}/keywords-enlarged-text.png`,
    animations: 'disabled',
  });
  if (enlargedUsesSheet) {
    await page
      .getByRole('dialog', { name: 'Lens', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Lens', exact: true })
      .waitFor({ state: 'hidden' });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  report.checks.push(
    'Full keyword list and search; direct selection and keyboard deselection; scroll reachability at nine screen sizes and 200% text enlargement',
  );
}
