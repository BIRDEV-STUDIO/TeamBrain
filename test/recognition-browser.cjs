// Optional browser integration check: PLAYWRIGHT_PATH points to an installed Playwright package.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Workspace } = require('../src/workspace');
const { createDashboardServer } = require('../src/dashboard-server');
const { createEvent } = require('../src/event');
const { writeEvent } = require('../src/store');
const recognition = require('../src/recognition');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-recognition-browser-'));
  let server, browser;
  try {
    const w = new Workspace(root), team = w.createTeam('Tasarım Atölyesi'), project = w.createProject(team.id, 'Ekip deneyimi');
    fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
    const identity = actor => fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ actor_id: actor, auto_sync: false }));
    identity('alice');
    fs.mkdirSync(path.join(w.teamPath(team.id), 'collaboration'), { recursive: true });
    fs.writeFileSync(path.join(w.teamPath(team.id), 'collaboration', 'members.json'), JSON.stringify({ members: [{ login: 'alice' }, { login: 'bob' }] }));
    for (const actor of ['alice', 'bob']) {
      const event = createEvent({ eventType: 'note.created', title: actor === 'alice' ? 'Kurulum rehberi' : 'İlk ortak çözüm', body: 'Kaynakları gözden geçirdik. <script>throw new Error("unsafe")</script>', actorId: actor, deviceId: 'test' }, { project_id: project.id });
      writeEvent(w.projectPath(team.id, project.id), event);
      if (actor === 'bob') recognition.acknowledge(w, team.id, project.id, { source_id: `event:${event.event_id}`, action: 'approve', confirmed: true });
    }
    identity('bob');
    server = createDashboardServer(root, { updateService: { stop() {}, check: async () => ({ available: false, current: '0.6.2' }) } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url); await page.locator('#welcome:visible').waitFor();
    assert.equal(await page.locator('[data-view=profile]').count(), 0);
    if (process.env.RECOGNITION_SCREENSHOT) await page.screenshot({ path: process.env.RECOGNITION_SCREENSHOT.replace('.png', '-overview.png'), fullPage: true });
    await page.locator('#profile').click(); await page.locator('.recognition-score strong').waitFor();
    assert.equal(await page.locator('#heading').textContent(), 'Profilim');
    assert.equal(await page.locator('#profile-panel').count(), 0);
    assert.equal(await page.locator('.recognition-score strong').textContent(), '10');
    assert.equal(await page.locator('.recognition-badge').count(), 5);
    assert.equal(await page.locator('#recognition-form').count(), 0);
    await page.locator('.recognition-badge.earned summary').click();
    await page.locator('.recognition-badge.earned [data-rec-source]').click();
    await page.locator('#recognition-source[open]').waitFor();
    assert.match(await page.locator('#recognition-source-body').textContent(), /<script>/);
    await page.getByRole('button', { name: 'Kaynağı kapat' }).click();
    await page.locator('.recognition-badge.earned summary').click();
    await page.locator('#greeting-setting').uncheck();
    await page.locator('[data-view=overview]').click();
    assert.equal(await page.locator('#welcome').isVisible(), false);
    await page.reload(); await page.locator('#profile').click(); await page.locator('#greeting-setting').waitFor();
    assert.equal(await page.locator('#greeting-setting').isChecked(), false);
    await page.locator('#greeting-setting').check();
    await page.evaluate(() => scrollTo(0, 0));
    if (process.env.RECOGNITION_SCREENSHOT) await page.screenshot({ path: process.env.RECOGNITION_SCREENSHOT, fullPage: true });
    await page.locator('#theme-toggle').click();
    await page.evaluate(() => scrollTo(0, 0));
    if (process.env.RECOGNITION_SCREENSHOT) await page.screenshot({ path: process.env.RECOGNITION_SCREENSHOT.replace('.png', '-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile page must not overflow');
    assert.ok(await page.locator('.profile-page').evaluate(e => e.getBoundingClientRect().right <= innerWidth && e.scrollWidth <= e.clientWidth), 'profile fits mobile screen');
    if (process.env.RECOGNITION_SCREENSHOT) await page.screenshot({ path: process.env.RECOGNITION_SCREENSHOT.replace('.png', '-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: full profile page, no profile navigation item or dialog, scores, source escaping, preferences, dark and mobile layout.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
