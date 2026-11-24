/*
 * Générateur de données SNCF simulées (même format que le jeu « tgvmax ») pour tester
 * le robot et l'app sans accès à l'API. Les états évoluent jour après jour :
 * les dates entrent fermées à J-30, s'ouvrent le lendemain, se ferment en se remplissant
 * et quelques places reviennent à l'approche du départ.
 *
 *   node test/fixture.mjs --out /tmp/fx --days 10
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as E from '../app/shared.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ST = {
  PLY: ['PARIS (intramuros)', 'FRPLY'], PMO: ['PARIS (intramuros)', 'FRPMO'], PNO: ['PARIS (intramuros)', 'FRPNO'], PST: ['PARIS (intramuros)', 'FRPST'],
  MLV: ['MARNE LA VALLEE CHESSY', 'FRMLV'], MAS: ['MASSY TGV', 'FRDJU'], CDG: ['AEROPORT CDG2 TGV ROISSY', 'FRMLW'],
  LPD: ['LYON (intramuros)', 'FRLPD'], LPR: ['LYON (intramuros)', 'FRLPR'], LYS: ['LYON ST EXUPERY TGV', 'FRLYS'],
  VAF: ['VALENCE TGV', 'FRVAF'], AVG: ['AVIGNON TGV', 'FRAVG'], AIX: ['AIX EN PROVENCE TGV', 'FRQXB'], MSC: ['MARSEILLE ST CHARLES', 'FRMSC'],
  LLE: ['LILLE (intramuros)', 'FRLLE'], LLF: ['LILLE (intramuros)', 'FRLLF'], BOJ: ['BORDEAUX ST JEAN', 'FRBOJ'],
  LMS: ['LE MANS', 'FRLMS'], RNS: ['RENNES', 'FRRNS'], NTE: ['NANTES', 'FRNTE'], SXB: ['STRASBOURG', 'FRSXB'],
  NIM: ['NIMES', 'FRFNI'], MPL: ['MONTPELLIER SAINT ROCH', 'FRMPL'], DIJ: ['DIJON VILLE', 'FRDIJ'],
};

// [axe, arrêts avec minutes depuis le départ, heures de départ, base de numéro, rames doublées ?]
const LINES = [
  ['SUD EST', [['PLY', 0], ['LPD', 116]], [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], 6601, true],
  ['SUD EST', [['PLY', 0], ['LPD', 118], ['VAF', 180], ['AVG', 215], ['AIX', 238], ['MSC', 255]], [6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 18.5], 6101, false],
  ['SUD EST', [['PLY', 0], ['LYS', 112], ['NIM', 178], ['MPL', 208]], [7.25, 11.25, 15.25, 18.25], 6201, false],
  ['SUD EST', [['PLY', 0], ['DIJ', 97]], [7.75, 12.75, 17.75, 19.75], 6701, false],
  ['NORD', [['PNO', 0], ['LLE', 62]], [6, 7, 8, 9, 11, 13, 15, 16, 17, 18, 19, 20, 21], 7001, true],
  ['ATLANTIQUE', [['PMO', 0], ['LMS', 55], ['RNS', 87]], [6.75, 8, 10, 12, 14, 16, 17, 18, 19, 20], 8601, false],
  ['ATLANTIQUE', [['PMO', 0], ['BOJ', 124]], [6, 7.5, 9, 11, 13, 15, 16.5, 17.5, 18.5, 19.5, 20.5], 8401, true],
  ['ATLANTIQUE', [['PMO', 0], ['LMS', 54], ['NTE', 125]], [7, 9.5, 12, 15, 17, 18, 19.5], 8801, false],
  ['EST', [['PST', 0], ['SXB', 107]], [6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 17.5, 18.5, 20.5], 9601, false],
  ['INTERSECTEURS', [['LLE', 0], ['CDG', 52], ['MLV', 75], ['LPD', 190], ['AVG', 264], ['MSC', 300]], [6.25, 11.25, 16.25], 5101, false],
  ['INTERSECTEURS', [['RNS', 0], ['MAS', 92], ['MLV', 128], ['CDG', 150], ['LLF', 205]], [7.25, 17.25], 5201, false],
  ['INTERSECTEURS', [['BOJ', 0], ['MAS', 125], ['MLV', 160], ['LPD', 280]], [8.25, 15.25], 5301, false],
];

function trainsForDate(date) {
  const out = [];
  for (const [axe, stops, hours, base, doubled] of LINES) {
    for (const dir of [1, -1]) {
      const seq = dir === 1 ? stops : [...stops].reverse().map(([s, m]) => [s, stops[stops.length - 1][1] - m]);
      hours.forEach((h, k) => {
        const no = base + k * 2 + (dir === 1 ? 0 : 1);
        const start = Math.round(h * 60) + (dir === 1 ? 0 : 13);
        const nos = doubled && k % 3 === 1 ? [no, no + 50] : [no];
        out.push({ axe, nos, stops: seq.map(([s, m]) => ({ st: ST[s], t: start + m })) });
      });
    }
  }
  return out;
}

function odRows(date) {
  const rows = [];
  for (const tr of trainsForDate(date)) {
    for (let i = 0; i < tr.stops.length; i++) for (let j = i + 1; j < tr.stops.length; j++) {
      const a = tr.stops[i], b = tr.stops[j];
      if (a.st[0] === b.st[0]) continue;
      for (const no of tr.nos) rows.push({
        date, train_no: no, entity: 'INOUI', axe: tr.axe,
        origine_iata: a.st[1], destination_iata: b.st[1], origine: a.st[0], destination: b.st[0],
        heure_depart: E.fmtMin(a.t), heure_arrivee: E.fmtMin(b.t), depMin: a.t % 1440,
      });
    }
  }
  return rows;
}

const peak = (wd, m) => (wd === 5 && m >= 960 && m < 1260) || (wd === 7 && m >= 900 && m < 1320) || (wd === 1 && m < 540);

export async function generate({ out, days = 10, seed = 42, today = E.parisDay() }) {
  const rand = rng(seed);
  const first = E.addDays(today, -(days - 1));
  const state = new Map(); // clé -> 'OUI'|'NON'
  const snaps = [];
  for (let S = E.addDays(first, -31); S <= today; S = E.addDays(S, 1)) {
    const live = [];
    for (let k = 0; k <= 30; k++) {
      const date = E.addDays(S, k), J = k, wd = E.isoWeekday(date);
      for (const r of odRows(date)) {
        const key = `${r.date}|${r.train_no}|${r.origine_iata}|${r.destination_iata}`;
        const hot = peak(wd, r.depMin) && (r.origine.startsWith('PARIS') || r.destination.startsWith('PARIS'));
        let s = state.get(key);
        if (s === undefined) s = 'NON';
        else if (s === 'NON') {
          const fresh = J === 29;
          const p = fresh ? (hot ? 0.35 : 0.85) : J <= 3 ? (hot ? 0.12 : 0.25) : 0.02;
          if (rand() < p) s = 'OUI';
        } else {
          const p = hot ? (J <= 10 ? 0.22 : 0.07) : (J <= 5 ? 0.08 : 0.015);
          if (rand() < p) s = 'NON';
        }
        state.set(key, s);
        live.push({ ...r, od_happy_card: s });
      }
    }
    for (const key of state.keys()) if (key.slice(0, 10) < S) state.delete(key);
    if (S >= first) {
      const dir = path.join(out, `snap-${String(snaps.length).padStart(2, '0')}`);
      await mkdir(dir, { recursive: true });
      const version = `${S}T04:2${snaps.length % 10}:00+00:00`;
      await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ version, at: version, fields: ['date', 'train_no', 'entity', 'axe', 'origine_iata', 'destination_iata', 'origine', 'destination', 'heure_depart', 'heure_arrivee', 'od_happy_card'] }));
      await writeFile(path.join(dir, 'export.jsonl'), live.map(({ depMin, ...r }) => JSON.stringify(r)).join('\n') + '\n');
      snaps.push({ dir, day: S, rows: live.length });
      if (S === today) await writeFile(path.join(out, 'current.json'), JSON.stringify(live.map(({ depMin, ...r }) => r)));
    }
  }
  return snaps;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') && acc.push([x.slice(2), all[i + 1]]), acc), []));
  const snaps = await generate({ out: a.out || '/tmp/aiguillage-fixture', days: +(a.days || 10), seed: +(a.seed || 42) });
  console.log(snaps.map(s => `${s.day} ${s.rows} lignes -> ${s.dir}`).join('\n'));
}
