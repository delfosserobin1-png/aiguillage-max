/*
 * Test de bout en bout : données simulées -> robot (10 relevés) -> site -> Chrome headless avec API SNCF simulée.
 *   node test/e2e.mjs [dossier-de-sortie]
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './fixture.mjs';
import { handle } from './mock-api.mjs';
import * as E from '../app/shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || '/tmp/e2e');
const PW = process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'shots'), { recursive: true });
const fx = path.join(OUT, 'fixture');
const snaps = await generate({ out: fx, days: 10 });
const cfg = { alertes: [{ nom: 'Paris → Lyon, vendredi soir', de: ['PARIS (intramuros)'], vers: ['LYON (intramuros)'], sens: 'aller-retour', jours: ['ven', 'dim'], heures: ['17:00', '21:00'], heures_retour: ['15:00', '22:00'] }] };
await writeFile(path.join(OUT, 'config.json'), JSON.stringify(cfg, null, 2));
for (const s of snaps) {
  execFileSync('node', [path.join(ROOT, 'collector/collect.mjs'), '--state', path.join(OUT, 'state'), '--config', path.join(OUT, 'config.json')],
    { env: { ...process.env, TGVMAX_FIXTURE: s.dir, MIN_ROWS: '1000', NTFY_DRYRUN: '1' }, stdio: 'ignore' });
}
const site = path.join(OUT, 'site');
await cp(path.join(ROOT, 'app'), site, { recursive: true });
await cp(path.join(OUT, 'config.json'), path.join(site, 'config.json'));
await cp(path.join(OUT, 'state/public'), path.join(site, 'data'), { recursive: true });
console.log(`site prêt (${snaps.length} relevés)`);

const rows = JSON.parse(await readFile(path.join(fx, 'current.json'), 'utf8'));
const meta = JSON.parse(await readFile(path.join(snaps[snaps.length - 1].dir, 'meta.json'), 'utf8'));
const PORT = 8765;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: site, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function newPage(scheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.route('https://ressources.data.sncf.com/**', async route => {
    const r = handle(route.request().url(), rows, meta);
    await route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.body) });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  return page;
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, 'shots', name), fullPage: true, ...opts });
async function pick(page, sel, text) {
  await page.fill(`${sel} input`, text);
  await page.locator(`${sel} .sugg li[data-k]`).first().waitFor();
  await page.locator(`${sel} .sugg li[data-k]`).first().dispatchEvent('pointerdown');
}
async function runTrajet(page, { o, d, date, slot, flex }) {
  await page.goto(`http://127.0.0.1:${PORT}/#trajet`);
  await page.waitForFunction(() => !document.querySelector('#fresh').textContent.includes('…'));
  await pick(page, '#p-o', o);
  await pick(page, '#p-d', d);
  await page.fill('#t-date', date);
  if (slot) await page.click(`#t-slots [data-slot="${slot}"]`);
  if (flex) {
    for (const b of await page.$$('#t-flex [data-flex]')) {
      const k = await b.getAttribute('data-flex'), on = (await b.getAttribute('aria-pressed')) === 'true';
      if (on !== flex.includes(k)) await b.click();
    }
  }
  await page.click('#t-go');
  await page.waitForSelector('#t-viz .card', { timeout: 15000 });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 391) errors.push(`[débordement] ${o} → ${d} : largeur ${sw}px`);
  return page.locator('.board .verdict').textContent();
}

const today = E.parisDay();
const nextDow = (dow, minDays) => { let d = E.addDays(today, minDays); while (E.isoWeekday(d) !== dow) d = E.addDays(d, 1); return d; };
const friday = nextDow(5, 3), sunday = nextDow(7, 2);
const results = {};

let page = await newPage();
results.trajet = await runTrajet(page, { o: 'paris', d: 'lyon', date: friday, slot: 'soir' });
await shot(page, '01-trajet.png');
await page.click('[data-viz="hist"]');
await page.waitForTimeout(200);
await shot(page, '02-historique.png');
await page.click('[data-viz="radar"]');
await page.locator('.radar .rowhit').nth(3).dispatchEvent('click');
await page.waitForTimeout(200);
await page.locator('#t-daydetail').screenshot({ path: path.join(OUT, 'shots', '03-jour.png') });
const booked = page.locator('.board [data-act="booked"]');
if (await booked.count()) { await booked.click(); results.booked = true; }

results.ferme = await runTrajet(page, { o: 'paris', d: 'bordeaux', date: friday, slot: 'soir', flex: [] });
await shot(page, '04-ferme.png');
results.rien = await runTrajet(page, { o: 'paris', d: 'lyon', date: E.addDays(today, 30), slot: 'soir', flex: [] });
await shot(page, '04b-rien.png');
results.corresp = await runTrajet(page, { o: 'rennes', d: 'lyon', date: sunday, slot: 'jour', flex: ['h1', 'conn', 'split', 'alt'] });
await shot(page, '05-correspondances.png');
results.tropTot = await runTrajet(page, { o: 'lille', d: 'paris', date: E.addDays(today, 45), slot: 'matin' });
await page.locator('.board').screenshot({ path: path.join(OUT, 'shots', '06-trop-tot.png') });

await page.goto(`http://127.0.0.1:${PORT}/#explorer`);
await pick(page, '#p-e', 'paris');
await page.click('#f-exp button[type=submit]');
await page.waitForSelector('#e-out .card', { timeout: 15000 });
const firstDest = page.locator('#e-out details.dest').first();
if (await firstDest.count()) await firstDest.locator('summary').click();
await shot(page, '07-explorer.png');
results.explorer = await page.locator('#e-out h2').first().textContent();

await page.goto(`http://127.0.0.1:${PORT}/#resas`);
await page.waitForSelector('#r-counter .num');
await shot(page, '08-resas.png');
results.compteur = await page.locator('#r-counter .num').textContent();

await page.goto(`http://127.0.0.1:${PORT}/#suivi`);
await page.waitForSelector('#s-robot dl, #s-robot p');
await pick(page, '#p-ao', 'nantes');
await pick(page, '#p-ad', 'paris');
await page.click('#f-alert button[type=submit]');
await page.waitForSelector('#a-out pre');
await shot(page, '09-suivi.png');

const dark = await newPage('dark');
await runTrajet(dark, { o: 'paris', d: 'lyon', date: friday, slot: 'soir' });
await shot(dark, '10-sombre.png');

const deep = await newPage();
await deep.goto(`http://127.0.0.1:${PORT}/?o=${encodeURIComponent('PARIS (intramuros)')}&d=${encodeURIComponent('LILLE (intramuros)')}&date=${sunday}&from=15:00&to=22:00#trajet`);
await deep.waitForSelector('#t-viz .card', { timeout: 15000 });
results.lienAlerte = await deep.locator('.board .verdict').textContent();

await browser.close();
server.kill();
console.log(JSON.stringify(results, null, 1));
console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'Aucune erreur console.');
