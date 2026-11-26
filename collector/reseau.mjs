#!/usr/bin/env node
/**
 * Index du réseau complet à partir du GTFS national SNCF (TER, cars, Intercités, OUIGO classique…).
 *
 *   node collector/reseau.mjs --gtfs <dossier GTFS décompressé> --state <état du robot> --out <dossier publié>
 *
 * Produit :
 *   index.json   toutes les gares (UIC, nom, coordonnées), les gares MAX (« hubs ») et leur nom dans les données MAX
 *   g/<uic>.json  pour chaque gare, les trains hors MAX qui y passent et les gares MAX qu'ils desservent avant / après
 *
 * Les jours de circulation sont un masque de bits : bit i = base + i jours (34 jours, J à J+33).
 */
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, l) => (v.startsWith('--') ? a.concat([[v.slice(2), l[i + 1]]]) : a), []));
const GTFS = args.gtfs, STATE = args.state, OUT = args.out;
const HORIZON = 34;
const MAX_HUB_MIN = 180; // on ne garde que les gares MAX à moins de 3 h de la gare (dans le même train)

export const LONG = new Set(['TGV INOUI', 'OUIGO', 'INTERCITES', 'INTERCITES de nuit', 'Lyria', 'ICE']);
export const CAT_CODE = { 'Train TER': 'T', 'Car TER': 'C', TramTrain: 'R', Navette: 'N', Train: 'T', INTERCITES: 'I', OUIGO: 'O', 'Car à réservation': 'C' };

export function parseCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, fn) {
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!line) continue;
    const cells = parseCSVLine(line);
    if (!head) { head = Object.fromEntries(cells.map((h, i) => [h.trim(), i])); continue; }
    fn(cells, head);
  }
}

export const hm = s => { const m = /^(\d+):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const ymd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const dayIdx = (base, ds) => Math.round((Date.parse(ds + 'T00:00:00Z') - Date.parse(base + 'T00:00:00Z')) / 86400000);
export function parisToday() {
  const p = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p.slice(0, 10);
}

/** stop_id « StopPoint:OCETrain TER-87574004 » -> { cat, uic } */
export function stopPoint(id) {
  const m = /^StopPoint:OCE(.+)-(\d{8})$/.exec(id || '');
  return m ? { cat: m[1], uic: m[2] } : null;
}

/** Noms de gares MAX -> codes UIC, par recoupement des numéros de train et des horaires. */
export function mapMaxNames(odEntries, trains) {
  const votes = new Map();
  const vote = (name, uic) => { if (!votes.has(name)) votes.set(name, new Map()); const v = votes.get(name); v.set(uic, (v.get(uic) || 0) + 1); };
  for (const { o, d, dep, arr, nums } of odEntries) {
    const depM = hm(dep), arrM = hm(arr);
    for (const n of nums) {
      for (const calls of trains.get(n) || []) {
        const a = calls.find(c => c[2] % 1440 === depM), b = calls.find(c => c[1] % 1440 === arrM);
        if (a && b && calls.indexOf(a) < calls.indexOf(b)) { vote(o, a[0]); vote(d, b[0]); break; }
      }
    }
  }
  const out = new Map();
  for (const [name, v] of votes) {
    const best = Math.max(...v.values());
    out.set(name, [...v].filter(([, n]) => n >= Math.max(2, best * 0.05)).map(([u]) => u).sort());
    if (!out.get(name).length) out.set(name, [[...v].sort((x, y) => y[1] - x[1])[0][0]]);
  }
  return out;
}

/** Entrées des fichiers par gare, à partir des trajets hors MAX et de l'ensemble des gares MAX. */
export function buildStationEntries(patterns, hubIdxByUic) {
  const per = new Map();
  patterns.forEach((p, k) => {
    const calls = p.calls;
    for (let i = 0; i < calls.length; i++) {
      const [uic, arr, dep, pick, drop] = calls[i];
      const before = [], after = [];
      for (let j = 0; j < i; j++) {
        const h = hubIdxByUic.get(calls[j][0]);
        if (h != null && calls[j][3] && drop && arr - calls[j][2] <= MAX_HUB_MIN) before.push([h, calls[j][2]]);
      }
      for (let j = i + 1; j < calls.length; j++) {
        const h = hubIdxByUic.get(calls[j][0]);
        if (h != null && calls[j][4] && pick && calls[j][1] - dep <= MAX_HUB_MIN) after.push([h, calls[j][1]]);
      }
      if (!per.has(uic)) per.set(uic, []);
      per.get(uic).push([k, p.cat, p.num, p.mask.toString(36), arr, dep, before, after]);
    }
  });
  return per;
}

async function main() {
  const base = args.base || parisToday();
  // gares
  const stations = new Map();
  await eachRow(path.join(GTFS, 'stops.txt'), (c, h) => {
    const m = /^StopArea:OCE(\d{8})$/.exec(c[h.stop_id]);
    if (m) stations.set(m[1], { uic: m[1], name: c[h.stop_name], lat: +c[h.stop_lat], lon: +c[h.stop_lon] });
  });
  // calendrier -> masque sur l'horizon
  const svc = new Map();
  await eachRow(path.join(GTFS, 'calendar_dates.txt'), (c, h) => {
    if (c[h.exception_type] !== '1') return;
    const i = dayIdx(base, ymd(c[h.date]));
    if (i < 0 || i >= HORIZON) return;
    svc.set(c[h.service_id], (svc.get(c[h.service_id]) || 0) + 2 ** i);
  });
  const trips = new Map();
  await eachRow(path.join(GTFS, 'trips.txt'), (c, h) => {
    const mask = svc.get(c[h.service_id]);
    if (mask) trips.set(c[h.trip_id], { mask, num: c[h.trip_headsign], ogo: /:OGO:/.test(c[h.trip_id]) });
  });
  // horaires, regroupés par trajet
  const calls = new Map();
  await eachRow(path.join(GTFS, 'stop_times.txt'), (c, h) => {
    const t = trips.get(c[h.trip_id]);
    if (!t) return;
    const sp = stopPoint(c[h.stop_id]);
    if (!sp) return;
    if (!calls.has(c[h.trip_id])) calls.set(c[h.trip_id], []);
    calls.get(c[h.trip_id]).push([+c[h.stop_sequence], sp.uic, hm(c[h.arrival_time]), hm(c[h.departure_time]), c[h.pickup_type] !== '1', c[h.drop_off_type] !== '1', sp.cat]);
  });
  const trains = new Map(); // numéro de train grandes lignes -> appels
  const patMap = new Map();
  for (const [id, list] of calls) {
    const t = trips.get(id);
    list.sort((a, b) => a[0] - b[0]);
    const cat = list[0][6];
    const cl = list.map(x => [x[1], x[2] ?? x[3], x[3] ?? x[2], x[4], x[5]]);
    if (LONG.has(cat) && !(cat === 'OUIGO' && t.ogo)) {
      if (!trains.has(t.num)) trains.set(t.num, []);
      trains.get(t.num).push(cl.map(x => [x[0], x[1], x[2]]));
      continue;
    }
    const code = CAT_CODE[cat] || 'T';
    const key = code + t.num + '|' + cl.map(x => x.join(',')).join(';');
    const p = patMap.get(key);
    if (p) p.mask = Number(BigInt(p.mask) | BigInt(t.mask));
    else patMap.set(key, { cat: code, num: t.num, mask: t.mask, calls: cl });
  }
  // noms MAX -> UIC, d'après les relevés du robot
  const odEntries = [];
  const odRoot = path.join(STATE, 'public', 'od');
  for (const o of await readdir(odRoot).catch(() => [])) {
    for (const f of await readdir(path.join(odRoot, o)).catch(() => [])) {
      try {
        const j = JSON.parse(await readFile(path.join(odRoot, o, f), 'utf8'));
        const lists = Object.values(j.x || {});
        for (const arr of lists) for (const e of arr.slice(0, 40)) odEntries.push({ o: j.o, d: j.d, dep: e[2], arr: e[3], nums: String(e[4] || '').split('/').filter(Boolean) });
      } catch { /* fichier illisible : ignoré */ }
    }
  }
  const nameMap = mapMaxNames(odEntries, trains);
  const hubs = [], hubIdxByUic = new Map();
  for (const [name, uics] of [...nameMap].sort()) for (const u of uics) {
    if (hubIdxByUic.has(u)) continue;
    hubIdxByUic.set(u, hubs.length); hubs.push([name, u]);
  }
  const patterns = [...patMap.values()];
  const per = buildStationEntries(patterns, hubIdxByUic);
  // écriture
  await mkdir(path.join(OUT, 'g'), { recursive: true });
  const st = [...stations.values()].filter(s => per.has(s.uic) || hubIdxByUic.has(s.uic))
    .map(s => [s.uic, s.name, Math.round(s.lat * 1e4) / 1e4, Math.round(s.lon * 1e4) / 1e4]);
  await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ v: 1, base, horizon: HORIZON, hubs, stations: st }));
  let n = 0;
  for (const [uic, list] of per) { await writeFile(path.join(OUT, 'g', uic + '.json'), JSON.stringify({ uic, base, t: list })); n++; }
  console.log(`réseau : ${st.length} gares, ${hubs.length} quais MAX reconnus sur ${nameMap.size} noms, ${patterns.length} trajets hors MAX, ${n} fichiers, ${trains.size} trains grandes lignes`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
