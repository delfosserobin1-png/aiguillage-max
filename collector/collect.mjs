#!/usr/bin/env node
/*
 * FloRoBot, le robot de Rob et Flo : relève le jeu SNCF « tgvmax » quand une nouvelle version est publiée,
 * met à jour l'historique de tout le réseau et envoie les alertes ntfy.
 *
 *   node collector/collect.mjs --state state --config config.json
 *
 * Variables d'environnement :
 *   NTFY_TOPIC       canal ntfy secret de Rob, et des alertes sans « pour » (sans canal : pas d'alerte)
 *   NTFY_TOPIC_FLO   canal ntfy secret de Flo (alertes "pour": "flo")
 *   NTFY_SERVER      serveur ntfy (défaut https://ntfy.sh)
 *   APP_URL          adresse de l'app, ouverte quand on touche une alerte
 *   TGVMAX_API       URL du jeu de données (défaut : API SNCF)
 *   TGVMAX_FIXTURE   dossier de test contenant meta.json et export.jsonl (remplace l'API)
 *   KEEP_PAST_DAYS   jours de voyage passés conservés dans l'historique détaillé (défaut 14)
 *   NTFY_DRYRUN=1    affiche les alertes au lieu de les envoyer
 */
import { readFile, writeFile, mkdir, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import * as E from '../app/shared.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const STATE = path.resolve(args.state || 'state');
const PUB = path.join(STATE, 'public');
const CONFIG = args.config ? path.resolve(args.config) : null;
const API = process.env.TGVMAX_API || E.API_BASE;
const FIXTURE = process.env.TGVMAX_FIXTURE || '';
const KEEP_PAST = +(process.env.KEEP_PAST_DAYS || 14);
const NTFY_TOPIC = (process.env.NTFY_TOPIC || '').trim();
const TOPICS = { rob: NTFY_TOPIC, flo: (process.env.NTFY_TOPIC_FLO || '').trim() };
const topicFor = rule => (rule.pour && rule.pour in TOPICS ? TOPICS[rule.pour] : NTFY_TOPIC);
const NTFY_SERVER = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
const APP_URL = process.env.APP_URL || '';
const SNCF_CONNECT = 'https://www.sncf-connect.com/';
const RAPPEL_VEILLE = '17:00';
const MIN_ROWS = +(process.env.MIN_ROWS || 5000);

const log = (...a) => console.log('[robot]', ...a);

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function http(url, { timeout = 60000, tries = 4 } = {}) {
  let last;
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'aiguillage-robot (GitHub Actions)' } });
      if (res.status >= 400 && res.status < 500) { const t = await res.text(); const err = new Error(`HTTP ${res.status} ${t.slice(0, 300)}`); err.status = res.status; throw err; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      if (e.status && e.status < 500) throw e;
      log(`échec ${k + 1}/${tries} (${e.message}), nouvel essai…`);
      await sleep(2000 * 2 ** k);
    }
  }
  throw last;
}

/* ---------- lecture de la source ---------- */

async function fetchMeta() {
  if (FIXTURE) return JSON.parse(await readFile(path.join(FIXTURE, 'meta.json'), 'utf8'));
  const j = await (await http(API, { timeout: 30000 })).json();
  const m = j.metas?.default || j.metas || {};
  const fields = (j.fields || []).map(f => f.name);
  const version = m.data_processed || m.modified || m.metadata_processed;
  if (!version) throw new Error('Métadonnées sans date de publication');
  return { version, at: m.data_processed || m.modified, fields, records: m.records_count };
}

function parseJsonl(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); } catch { /* ligne tronquée : ignorée */ }
  }
  return rows;
}

async function fetchRows(fields) {
  if (FIXTURE) return parseJsonl(await readFile(path.join(FIXTURE, 'export.jsonl'), 'utf8'));
  const sel = E.WANTED_FIELDS.filter(f => !fields.length || fields.includes(f));
  const missing = E.REQUIRED_FIELDS.filter(f => fields.length && !fields.includes(f));
  if (missing.length) throw new Error(`Champs absents du jeu SNCF : ${missing.join(', ')} — le format a changé`);
  const select = encodeURIComponent(sel.join(','));
  try {
    const res = await http(`${API}/exports/jsonl?select=${select}`, { timeout: 240000, tries: 3 });
    return parseJsonl(await res.text());
  } catch (e) {
    log(`export jsonl indisponible (${e.message}), repli sur json`);
    const res = await http(`${API}/exports/json?select=${select}`, { timeout: 240000, tries: 3 });
    return await res.json();
  }
}

/* ---------- historique ---------- */

async function loadOdFiles() {
  const files = new Map();
  const root = path.join(PUB, 'od');
  let dirs = [];
  try { dirs = await readdir(root); } catch { return files; }
  for (const dir of dirs) {
    let names = [];
    try { names = await readdir(path.join(root, dir)); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const f = await readJson(path.join(root, dir, n), null);
      if (f && f.o && f.d) files.set(f.o + '\u0000' + f.d, f);
    }
  }
  return files;
}

const bump4 = (obj, key, i) => { (obj[key] ||= [0, 0, 0, 0])[i]++; };

function mergeTrains(str, trains) {
  const set = new Set((str || '').split('/').filter(Boolean));
  for (const t of trains) set.add(t);
  return [...set].join('/');
}

/** Ajoute le relevé « idx » à un fichier de trajet. Retourne les changements d'état observés. */
function updateOd(file, deps, idx, snapDay, prevIdx, countTransitions, stats, wantChanges, dayByIdx) {
  const changes = [];
  const entries = new Map();
  for (const [date, arr] of Object.entries(file.x)) for (const e of arr) entries.set(`${date}|${e[0]}|${e[1]}|${e[2]}|${e[3]}`, { date, e });
  const seen = new Set();
  for (const x of deps) {
    const key = `${x.date}|${x.oi}|${x.di}|${x.dep}|${x.arr}`;
    seen.add(key);
    const J = E.diffDays(x.date, snapDay);
    const wd = E.isoWeekday(x.date), sl = E.slotOf(x.depMin);
    const c = x.ok ? '1' : '0';
    const ent = entries.get(key);
    if (!ent) {
      const e = [x.oi, x.di, x.dep, x.arr, x.trains.join('/'), idx, c];
      (file.x[x.date] ||= []).push(e);
      entries.set(key, { date: x.date, e });
      if (J >= 29 && prevIdx >= 0) { const f = (file.fs ||= {})[`${wd}|${sl}`] ||= [0, 0]; f[x.ok ? 0 : 1]++; }
      if (wantChanges && x.ok && prevIdx >= 0) changes.push({ type: 'open', x, J, nouveau: true });
      continue;
    }
    const e = ent.e;
    const expected = idx - e[5];
    let s = e[6];
    const prevC = s.length && e[5] + s.length - 1 === prevIdx ? s[s.length - 1] : null;
    if (s.length < expected) s += '.'.repeat(expected - s.length);
    e[6] = s + c;
    e[4] = mergeTrains(e[4], x.trains);
    if (prevC === '1' || prevC === '0') {
      if (countTransitions) {
        const t = prevC === '1' ? (x.ok ? 0 : 1) : (x.ok ? 2 : 3);
        const k = `${wd}|${sl}|${E.bucketOf(J)}`;
        bump4(file.c, k, t);
        bump4(stats.c, k, t);
        if (x.axe) { const a = stats.axe[x.axe] ||= Array.from({ length: 6 }, () => [0, 0, 0, 0]); a[E.bucketOf(J)][t]++; }
      }
      if (wantChanges && prevC === '0' && x.ok) changes.push({ type: 'open', x, J });
      if (wantChanges && prevC === '1' && !x.ok) changes.push({ type: 'close', x, J });
    }
  }
  for (const [key, { date, e }] of entries) {
    if (seen.has(key) || date < snapDay) continue;
    const expected = idx - e[5];
    let s = e[6];
    if (s.length < expected) s += '.'.repeat(expected - s.length);
    e[6] = s + '.';
  }
  for (const date of Object.keys(file.x)) {
    if (E.diffDays(snapDay, date) > KEEP_PAST) {
      // avant d'effacer le détail, on garde pour toujours un résumé compact de la date
      const rec = E.summarizeDate(file.x[date], date, dayByIdx);
      (file.y ||= {})[date] = rec;
      const { known, deps: ds } = E.decodeSummary(rec);
      const t = (stats.y ||= {})[date] ||= [0, 0, 0, 0, 0, 0, 0, 0];
      for (const d of ds) {
        t[0]++;
        if (d.f & E.YF.ever) t[1]++;
        if (known & E.YF.opening) { t[3]++; if (d.f & E.YF.opening) t[2]++; }
        if (known & E.YF.j7) { t[5]++; if (d.f & E.YF.j7) t[4]++; }
        if (known & E.YF.j1) { t[7]++; if (d.f & E.YF.j1) t[6]++; }
      }
      delete file.x[date];
    } else file.x[date].sort((a, b) => E.toMin(a[2]) - E.toMin(b[2]));
  }
  file.last = idx;
  return changes;
}

/* ---------- alertes ---------- */

/* ---------- rappel de 17 h la veille ----------
   Les réservations MAX non confirmées sont annulées la veille à 17 h : des places reviennent, visibles en direct sur
   SNCF Connect, alors que l'open data ne les montrera qu'au relevé du lendemain. Au relevé du matin, le robot programme
   (ntfy, livraison différée) une notification pour 17 h si demain est un jour de voyage suivi. Une seule par jour. */
async function scheduleEveningWindow(rules, deps, meta) {
  const today = E.parisDay(), tomorrow = E.addDays(today, 1);
  const at = E.parisToUTC(today, RAPPEL_VEILLE).getTime();
  meta.rappels = (meta.rappels || []).slice(-14);
  if (meta.rappels.includes(today) || at - Date.now() < 5 * 60e3) return 0;
  meta.rappels.push(today);
  const legs = E.tomorrowLegs(rules, deps, today);
  const byTopic = new Map();
  for (const l of legs) {
    const t = topicFor(rules[l.rule]);
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t).push(l);
  }
  let sent = 0;
  for (const [topic, list] of byTopic) {
    const lines = list.map(l => {
      const r = rules[l.rule];
      const name = r.nom || `${E.pretty(r.de?.[0] || '?')} → ${E.pretty(r.vers?.[0] || '?')}`;
      return `- ${l.sens === 'retour' ? '↩︎ ' : ''}${name} : ${l.open} sur ${l.total} ouvert${l.open > 1 ? 's' : ''} ce matin`;
    });
    const app = deepLink(rules[list[0].rule], { x: list[0].first, sens: list[0].sens });
    const ok = await ntfy({
      title: '17 h : des places MAX reviennent pour demain',
      message: `Les réservations MAX non confirmées pour demain (${E.frDay(tomorrow)}) sont annulées à 17 h. `
        + `Les places libérées apparaissent en direct sur SNCF Connect : c’est le moment de vérifier.\n\n${lines.join('\n')}`,
      tags: ['alarm_clock', 'train'],
      priority: 4,
      click: SNCF_CONNECT,
      actions: [{ action: 'view', label: 'Ouvrir SNCF Connect', url: SNCF_CONNECT }, ...(app ? [{ action: 'view', label: 'Voir dans FloRoBot', url: app }] : [])],
      delay: String(Math.floor(at / 1000)),
    }, topic);
    if (ok) sent++;
  }
  return sent;
}

async function ntfy(msg, topic = NTFY_TOPIC) {
  if (process.env.NTFY_DRYRUN) { log('ALERTE (simulation) :', JSON.stringify(msg, null, 1)); return true; }
  if (!topic) { log('canal ntfy absent : alerte non envoyée'); return false; }
  try {
    const body = { topic, markdown: true, ...msg };
    if (APP_URL && !body.click) body.click = APP_URL;
    const res = await fetch(NTFY_SERVER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!res.ok) { log(`ntfy a répondu ${res.status}`); return false; }
    return true;
  } catch (e) { log(`ntfy injoignable : ${e.message}`); return false; }
}

// règle à plusieurs gares d'un côté : chaque ligne dit laquelle
function where(ch, rule) {
  const manyDe = (rule.de?.length || 0) > 1, manyVers = (rule.vers?.length || 0) > 1;
  if (manyDe && manyVers) return ` ${E.pretty(ch.x.o)} → ${E.pretty(ch.x.d)}`;
  const back = ch.sens === 'retour';
  if (manyVers) return back ? ` depuis ${E.pretty(ch.x.o)}` : ` vers ${E.pretty(ch.x.d)}`;
  if (manyDe) return back ? ` vers ${E.pretty(ch.x.d)}` : ` depuis ${E.pretty(ch.x.o)}`;
  return '';
}
const line = (ch, rule) => `${E.frDay(ch.x.date)} ${ch.x.dep}→${ch.x.arr}${where(ch, rule)} (J-${ch.J})`;
function deepLink(rule, ch) {
  if (!APP_URL) return '';
  const p = new URLSearchParams({ o: ch.x.o, d: ch.x.d, date: ch.x.date });
  const h = ch.sens === 'retour' && rule.heures_retour ? rule.heures_retour : rule.heures;
  if (h?.length === 2) { p.set('from', h[0]); p.set('to', h[1]); }
  return `${APP_URL}?${p}#trajet`;
}

async function sendAlerts(rules, changes, openNowByRule) {
  let sent = 0;
  for (const [i, rule] of rules.entries()) {
    const mine = changes.filter(ch => ch.rule === i);
    const opens = mine.filter(ch => ch.type === 'open').sort((a, b) => a.x.date.localeCompare(b.x.date) || a.x.depMin - b.x.depMin);
    const closes = mine.filter(ch => ch.type === 'close').sort((a, b) => a.x.date.localeCompare(b.x.date) || a.x.depMin - b.x.depMin);
    const notifyClose = rule.fermetures !== false;
    if (!opens.length && !(notifyClose && closes.length)) continue;
    const name = rule.nom || `${E.pretty(rule.de?.[0] || '?')} → ${E.pretty(rule.vers?.[0] || '?')}`;
    const parts = [];
    if (opens.length) parts.push(`🟢 **${opens.length} ouverture${opens.length > 1 ? 's' : ''}**\n` + opens.slice(0, 12).map(c => `- ${c.sens === 'retour' ? '↩︎ ' : ''}${line(c, rule)}`).join('\n') + (opens.length > 12 ? `\n- … et ${opens.length - 12} autres` : ''));
    if (notifyClose && closes.length) parts.push(`🔴 **${closes.length} fermeture${closes.length > 1 ? 's' : ''}**\n` + closes.slice(0, 8).map(c => `- ${c.sens === 'retour' ? '↩︎ ' : ''}${line(c, rule)}`).join('\n') + (closes.length > 8 ? `\n- … et ${closes.length - 8} autres` : ''));
    const now = openNowByRule[i];
    parts.push(`Ouverts en ce moment : ${now.open} départ${now.open > 1 ? 's' : ''} sur ${now.total}.`);
    const first = opens[0] || closes[0];
    const ok = await ntfy({
      title: `${name} : ${opens.length ? `${opens.length} départ${opens.length > 1 ? 's' : ''} à 0 € ouvert${opens.length > 1 ? 's' : ''}` : `${closes.length} départ${closes.length > 1 ? 's' : ''} fermé${closes.length > 1 ? 's' : ''}`}`,
      message: parts.join('\n\n').slice(0, 3900),
      tags: [opens.length ? 'green_circle' : 'red_circle', 'train'],
      priority: opens.length ? 5 : 2,
      click: opens.length ? SNCF_CONNECT : deepLink(rule, first) || undefined,
      actions: opens.length ? [{ action: 'view', label: 'Ouvrir SNCF Connect', url: SNCF_CONNECT }, ...(deepLink(rule, first) ? [{ action: 'view', label: 'Voir dans FloRoBot', url: deepLink(rule, first) }] : [])] : undefined,
    }, topicFor(rule));
    if (ok) sent++;
  }
  return sent;
}

/* ---------- programme ---------- */

async function main() {
  const meta = await readJson(path.join(PUB, 'meta.json'), { v: 1, snaps: [] });
  let remote = await fetchMeta();
  const lastSnap = meta.snaps[meta.snaps.length - 1];
  // Le matin, GitHub saute souvent des passages programmés : un passage lancé avant la publication du jour
  // guette la SNCF (toutes les 20 s) au lieu de repartir, pour alerter dans la minute qui suit la publication.
  const waitMin = Math.min(+(args.attendre || 0), 100);
  const nowMin = E.parisMinutes();
  if (waitMin > 0 && lastSnap && lastSnap.v === remote.version && lastSnap.day !== E.parisDay() && nowMin >= 5 * 60 && nowMin < 8 * 60 + 30) {
    const until = Math.min(Date.now() + waitMin * 60e3, E.parisToUTC(E.parisDay(), '08:30').getTime());
    log(`Publication du jour pas encore là : je guette la SNCF jusqu'à ${E.fmtMin(E.parisMinutes(new Date(until)))}.`);
    while (Date.now() < until && remote.version === lastSnap.v) {
      await sleep(20000);
      try { remote = await fetchMeta(); } catch (e) { log(`métadonnées injoignables : ${e.message}`); }
    }
    log(remote.version !== lastSnap.v ? 'Nouvelle publication détectée.' : 'Toujours rien : le prochain passage reprendra.');
  }
  log(`version SNCF : ${remote.version}${lastSnap ? ` (dernier relevé : ${lastSnap.v})` : ' (premier relevé)'}`);
  await setOutput('version', remote.version);
  if (lastSnap && lastSnap.v === remote.version) {
    // pas de nouvelle publication : il peut rester le rappel de 17 h à programmer (relevé du matin manqué, mise à jour du robot)
    const today = E.parisDay();
    const config = CONFIG ? await readJson(CONFIG, {}) : {};
    const rules = (config.alertes || []).filter(r => r && r.de?.length && r.vers?.length);
    if (rules.length && !(meta.rappels || []).includes(today) && E.parisToUTC(today, RAPPEL_VEILLE).getTime() - Date.now() > 5 * 60e3) {
      const deps = E.normalizeRows(await fetchRows(remote.fields || []));
      log(`rappel de 17 h : ${await scheduleEveningWindow(rules, deps, meta)} notification(s) programmée(s)`);
      await writeJson(path.join(PUB, 'meta.json'), meta);
      await setOutput('changed', 'true');
      return;
    }
    log('Pas de nouvelle publication : rien à faire.');
    await setOutput('changed', 'false');
    return;
  }

  const rows = await fetchRows(remote.fields || []);
  if (!Array.isArray(rows) || rows.length < MIN_ROWS) throw new Error(`Export suspect : ${rows?.length ?? 0} lignes (minimum ${MIN_ROWS}). Historique laissé intact.`);
  const deps = E.normalizeRows(rows);
  if (deps.length < MIN_ROWS / 4) throw new Error(`Seulement ${deps.length} départs exploitables : format inattendu. Historique laissé intact.`);
  const snapDay = E.parisDay(new Date(remote.at || Date.now()));
  const idx = lastSnap ? lastSnap.i + 1 : 0;
  const prevIdx = lastSnap ? lastSnap.i : -1;
  const gap = lastSnap ? E.diffDays(snapDay, lastSnap.day) : null;
  const countTransitions = !!lastSnap && gap >= 0 && gap <= 2;
  const openCount = deps.filter(x => x.ok).length;
  log(`${rows.length} lignes, ${deps.length} départs (${openCount} ouverts), relevé n°${idx} du ${snapDay}`);

  const config = CONFIG ? await readJson(CONFIG, {}) : {};
  const rules = (config.alertes || []).filter(r => r && r.de?.length && r.vers?.length);

  const stats = await readJson(path.join(PUB, 'stats.json'), { v: 1, c: {}, axe: {}, j: {}, daily: [] });
  const files = await loadOdFiles();
  const byOd = new Map();
  for (const x of deps) {
    const k = x.o + '\u0000' + x.d;
    if (!byOd.has(k)) byOd.set(k, []);
    byOd.get(k).push(x);
  }
  for (const k of byOd.keys()) if (!files.has(k)) {
    const [o, d] = k.split('\u0000');
    files.set(k, { v: 1, o, d, last: -1, x: {}, c: {}, fs: {} });
  }

  const dayByIdx = new Map(meta.snaps.map(s => [s.i, s.day]));
  dayByIdx.set(idx, snapDay);
  const changes = [];
  const openNowByRule = rules.map(() => ({ open: 0, total: 0 }));
  for (const [k, file] of files) {
    const list = byOd.get(k) || [];
    const wantChanges = rules.length > 0 && list.some(x => rules.some(r => E.ruleMatches(r, x)));
    const ch = updateOd(file, list, idx, snapDay, prevIdx, countTransitions, stats, wantChanges, dayByIdx);
    if (wantChanges) {
      for (const c of ch) rules.forEach((r, i) => { const s = E.ruleMatches(r, c.x); if (s && c.x.date >= snapDay) changes.push({ ...c, rule: i, sens: s }); });
      for (const x of list) rules.forEach((r, i) => { if (x.date >= snapDay && E.ruleMatches(r, x)) { openNowByRule[i].total++; if (x.ok) openNowByRule[i].open++; } });
    }
    const empty = !Object.keys(file.x).length && !Object.keys(file.c).length && !Object.keys(file.y || {}).length;
    if (!empty) await writeJson(path.join(PUB, E.odPath(file.o, file.d)), file);
  }

  // statistiques du réseau
  const jcurve = Array.from({ length: 32 }, () => [0, 0]);
  for (const x of deps) { const J = E.diffDays(x.date, snapDay); if (J >= 0 && J < 32) { jcurve[J][0]++; if (x.ok) jcurve[J][1]++; } }
  stats.j[snapDay] = jcurve;
  for (const key of Object.keys(stats.j).sort().slice(0, -60)) delete stats.j[key];
  stats.daily = (stats.daily || []).filter(d => d.day !== snapDay);
  stats.daily.push({ day: snapDay, deps: deps.length, open: openCount });
  await writeJson(path.join(PUB, 'stats.json'), stats);

  // gares
  const st = new Map();
  for (const x of deps) for (const [n, i] of [[x.o, x.oi], [x.d, x.di]]) {
    if (!st.has(n)) st.set(n, { n, i: new Set(), c: 0 });
    const s = st.get(n); s.c++; if (i && i !== n) s.i.add(i);
  }
  await writeJson(path.join(PUB, 'stations.json'), [...st.values()].sort((a, b) => b.c - a.c).map(s => ({ n: s.n, i: [...s.i], c: s.c })));

  // index des trajets ayant un historique (évite à l'app de chercher des fichiers absents)
  const index = {};
  for (const f of files.values()) if (Object.keys(f.x).length || Object.keys(f.c).length || Object.keys(f.y || {}).length) (index[f.o] ||= []).push(f.d);
  for (const k in index) index[k].sort();
  await writeJson(path.join(PUB, 'od-index.json'), index);

  // méta
  meta.first ||= snapDay;
  meta.keepPastDays = KEEP_PAST;
  meta.odCount = [...files.values()].filter(f => Object.keys(f.x).length).length;
  meta.snaps.push({ i: idx, v: remote.version, day: snapDay, at: remote.at || null, rows: rows.length, deps: deps.length, open: openCount, counted: countTransitions });
  if (rules.length) log(`rappel de 17 h : ${await scheduleEveningWindow(rules, deps, meta)} notification(s) programmée(s)`);
  meta.updated = new Date().toISOString();
  await writeJson(path.join(PUB, 'meta.json'), meta);
  log(`${meta.odCount} trajets suivis dans l'historique, ${changes.length} changements sur les alertes`);

  // alertes
  if (idx === 0) {
    await ntfy({
      title: 'FloRoBot est en service',
      message: `Premier relevé réussi : **${openCount} départs ouverts** sur ${deps.length} dans les 30 prochains jours.\n\n`
        + (rules.length ? `${rules.length} alerte${rules.length > 1 ? 's' : ''} configurée${rules.length > 1 ? 's' : ''}. Tu seras prévenu à chaque ouverture.` : 'Aucune alerte configurée pour l’instant : ajoute tes trajets dans l’onglet Suivi.'),
      tags: ['white_check_mark', 'train'],
      priority: 3,
    });
  } else if (changes.length) {
    const n = await sendAlerts(rules, changes, openNowByRule);
    log(`${n} notification(s) envoyée(s)`);
  }
  await setOutput('changed', 'true');
}

main().catch(async e => {
  console.error('[robot] ÉCHEC :', e.stack || e.message);
  await setOutput('changed', 'false');
  process.exitCode = 1;
});
