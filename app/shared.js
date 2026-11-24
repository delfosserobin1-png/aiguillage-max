/*
 * Aiguillage — moteur partagé entre l'app (navigateur) et le robot (Node).
 * Aucune dépendance. Toutes les dates sont des chaînes 'AAAA-MM-JJ' (jour de Paris),
 * toutes les heures des minutes depuis minuit.
 */

export const API_BASE = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax';
export const WANTED_FIELDS = ['date', 'train_no', 'origine_iata', 'destination_iata', 'origine', 'destination',
  'heure_depart', 'heure_arrivee', 'od_happy_card', 'axe'];
export const REQUIRED_FIELDS = ['date', 'train_no', 'origine', 'destination', 'heure_depart', 'heure_arrivee', 'od_happy_card'];

/* Règles MAX JEUNE (aide SNCF Connect, novembre 2026). */
export const RULES = {
  maxSlots: 6,               // trajets à 0 € réservés en même temps
  openDaysBefore: 30,        // ouverture des réservations à J-30
  freeRefundDaysBefore: 7,   // billet MAX AVANTAGE -30 % : remboursable sans frais jusqu'à J-7 inclus
  lateFeeTgvInoui: 19,       // ensuite : 19 € sur TGV INOUI
  confirmFromDaysBefore: 2,  // confirmation possible dès J-2…
  confirmDeadline: '17:00',  // …et jusqu'à la veille 17 h, sinon annulation automatique
};

export const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const SLOT_BOUNDS = [0, 540, 720, 900, 1020, 1200, 1440];
export const SLOT_LABELS = ['avant 9 h', '9 h–12 h', '12 h–15 h', '15 h–17 h', '17 h–20 h', 'après 20 h'];
export const BUCKET_LABELS = ['J-1 / J-0', 'J-2 à J-3', 'J-4 à J-7', 'J-8 à J-14', 'J-15 à J-21', 'J-22 et +'];

/* ---------- heures et jours ---------- */

export function toMin(hhmm) {
  if (hhmm == null) return NaN;
  const m = String(hhmm).match(/(\d{1,2})\D?(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : NaN;
}
export function fmtMin(min) {
  if (!Number.isFinite(min)) return '';
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}
export function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

const DAY_MS = 86400000;
export function parseDay(ds) { const [y, m, d] = String(ds).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }
export function fmtDay(ts) { return new Date(ts).toISOString().slice(0, 10); }
export function addDays(ds, n) { return fmtDay(parseDay(ds) + n * DAY_MS); }
export function diffDays(a, b) { return Math.round((parseDay(a) - parseDay(b)) / DAY_MS); }
export function isoWeekday(ds) { const w = new Date(parseDay(ds)).getUTCDay(); return w === 0 ? 7 : w; }
export function slotOf(min) { for (let i = 0; i < 6; i++) if (min < SLOT_BOUNDS[i + 1]) return i; return 5; }
export function bucketOf(J) { return J <= 1 ? 0 : J <= 3 ? 1 : J <= 7 ? 2 : J <= 14 ? 3 : J <= 21 ? 4 : 5; }

const TZ = 'Europe/Paris';
let partsFmt = null;
function parisParts(date) {
  partsFmt ||= new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(partsFmt.formatToParts(date).map(p => [p.type, p.value]));
}
export function parisDay(date = new Date()) { const p = parisParts(date); return `${p.year}-${p.month}-${p.day}`; }
export function parisMinutes(date = new Date()) { const p = parisParts(date); return (+p.hour) * 60 + (+p.minute); }
/** Instant UTC correspondant à une heure de Paris (gère l'heure d'été). */
export function parisToUTC(ds, hhmm) {
  const [y, m, d] = ds.split('-').map(Number);
  const min = toMin(hhmm);
  const target = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  let guess = target;
  for (let k = 0; k < 3; k++) {
    const p = parisParts(new Date(guess));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (wall === target) break;
    guess += target - wall;
  }
  return new Date(guess);
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayFmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export function frDay(ds) { return dayFmt.format(new Date(parseDay(ds))).replace(/\.(?=\s|$)/g, ''); }
export function frDayLong(ds) { return dayFmtLong.format(new Date(parseDay(ds))); }
export function frShort(ds) { return `${ds.slice(8, 10)}/${ds.slice(5, 7)}`; }

/* ---------- noms de gares ---------- */

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}
export function odPath(o, d) { return `od/${slugify(o)}/${slugify(d)}.json`; }
export function fold(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

/** Nom lisible : "MARSEILLE ST CHARLES" -> "Marseille St Charles". */
export function pretty(name) {
  return String(name).toLowerCase().replace(/(^|[\s(\/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bTgv\b/g, 'TGV').replace(/\bCdg(\d?)\b/g, 'CDG$1').replace(/\(Intramuros\)/, '(intramuros)');
}

/* Gares proches les unes des autres (même agglomération ou gare TGV de la ville). */
const NEAR_GROUPS = [
  [/^PARIS\b/, /MARNE.LA.VALL/, /^MASSY/, /AEROPORT.CDG|ROISSY/],
  [/^MARSEILLE/, /^AIX.EN.PROVENCE/],
  [/^METZ/, /^NANCY/, /LORRAINE/],
  [/^REIMS/, /CHAMPAGNE/],
  [/^TOURS\b/, /PIERRE.DES.CORPS/],
  [/^AMIENS/, /HAUTE.PICARDIE/],
  [/^BELFORT/, /MONTBELIARD/],
  [/^NICE\b/, /^ANTIBES/, /^CANNES/],
  [/^CHAMBERY/, /^AIX.LES.BAINS/],
  [/^ARRAS/, /^DOUAI/],
];
const firstWord = s => fold(s).split(/[\s(\/-]+/)[0];
export function nearbyStations(name, all) {
  const N = fold(name);
  const out = new Set();
  for (const g of NEAR_GROUPS) {
    if (!g.some(re => re.test(N))) continue;
    for (const s of all) if (g.some(re => re.test(fold(s)))) out.add(s);
  }
  const fw = firstWord(name);
  if (fw.length >= 4) for (const s of all) if (firstWord(s) === fw) out.add(s);
  out.delete(name);
  return [...out].sort();
}

/* ---------- données SNCF ---------- */

const clean = v => (v == null ? '' : String(v).trim());

/**
 * Lignes brutes du jeu « tgvmax » -> départs.
 * Deux rames d'un même départ (mêmes gares, mêmes heures) sont repliées en un seul départ,
 * ouvert si au moins une rame l'est.
 */
export function normalizeRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = clean(r.date).slice(0, 10);
    const o = clean(r.origine), d = clean(r.destination);
    const depMin = toMin(r.heure_depart), arrMin = toMin(r.heure_arrivee);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !o || !d || !Number.isFinite(depMin) || !Number.isFinite(arrMin)) continue;
    const dep = fmtMin(depMin), arr = fmtMin(arrMin);
    const oi = clean(r.origine_iata) || o, di = clean(r.destination_iata) || d;
    const key = `${date}|${oi}|${di}|${dep}|${arr}`;
    let x = map.get(key);
    if (!x) {
      x = { key, date, o, d, oi, di, dep, arr, depMin, arrMin, trains: [], ok: false, axe: clean(r.axe) };
      x.dur = ((arrMin - depMin) + 1440) % 1440;
      x.night = arrMin < depMin;
      map.set(key, x);
    }
    const t = clean(r.train_no);
    if (t && !x.trains.includes(t)) x.trains.push(t);
    if (/^(oui|true|1|yes)$/i.test(clean(r.od_happy_card))) x.ok = true;
  }
  return [...map.values()].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.depMin - b.depMin);
}

/* Fragments ODSQL pour l'API Opendatasoft. */
export const sqlStr = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
export const orEq = (field, values) => '(' + values.map(v => `${field}=${sqlStr(v)}`).join(' or ') + ')';
export const dateRange = (d1, d2) => d1 === d2 ? `\`date\`=date'${d1}'` : `\`date\`>=date'${d1}' and \`date\`<=date'${d2}'`;

/* ---------- règles MAX et échéances ---------- */

export function deadlinesFor(date, today) {
  const J = diffDays(date, today);
  const list = [];
  const openDay = addDays(date, -RULES.openDaysBefore);
  list.push({ id: 'ouverture', day: openDay, time: null, past: openDay < today, label: 'Ouverture des places MAX (J-30)' });
  const refund = addDays(date, -RULES.freeRefundDaysBefore);
  list.push({ id: 'remboursement', day: refund, time: '23:59', past: refund < today,
    label: 'Dernier jour pour annuler sans frais un billet -30 % (J-7)' });
  const cStart = addDays(date, -RULES.confirmFromDaysBefore);
  list.push({ id: 'confirmation-debut', day: cStart, time: '00:00', past: cStart < today, label: 'La confirmation ouvre (J-2)' });
  const cEnd = addDays(date, -1);
  list.push({ id: 'confirmation-fin', day: cEnd, time: RULES.confirmDeadline, past: cEnd < today,
    label: 'Confirmation avant 17 h, sinon annulation automatique' });
  list.push({ id: 'liberations', day: cEnd, time: RULES.confirmDeadline, past: cEnd < today, hypothesis: true,
    label: 'Places non confirmées libérées à 17 h : à surveiller sur SNCF Connect' });
  return { J, list };
}

/** État de chaque réservation : confirmation, compteur, conflits « 1 résa par jour et par ville ». */
export function checkResas(resas, now = new Date()) {
  const today = parisDay(now), nowMin = parisMinutes(now);
  const active = resas.filter(r => r.statut !== 'annulee' && r.date >= today);
  const free = active.filter(r => r.tarif !== 'avantage');
  const out = resas.map(r => {
    const cStart = addDays(r.date, -RULES.confirmFromDaysBefore), cEnd = addDays(r.date, -1);
    let etat;
    if (r.statut === 'annulee') etat = 'annulee';
    else if (r.date < today) etat = 'passee';
    else if (r.tarif === 'avantage') etat = 'payant';
    else if (r.statut === 'confirmee') etat = 'confirmee';
    else if (today < cStart) etat = 'attente';
    else if (today < cEnd || (today === cEnd && nowMin < toMin(RULES.confirmDeadline))) etat = today === cEnd ? 'urgent' : 'a-confirmer';
    else etat = 'expiree';
    const conflits = r.statut === 'annulee' || r.tarif === 'avantage' ? [] :
      free.filter(x => x !== r && x.date === r.date && fold(x.o) === fold(r.o));
    return { ...r, etat, confirmDu: cStart, confirmAu: cEnd, conflits };
  });
  return { list: out, used: free.length, max: RULES.maxSlots };
}

/* ---------- probabilités issues de l'historique ---------- */

/** Somme des compteurs [ouvert→ouvert, ouvert→fermé, fermé→ouvert, fermé→fermé] qui vérifient pred(jour, créneau, tranche). */
export function sumCells(c, pred) {
  const s = [0, 0, 0, 0];
  if (!c) return s;
  for (const k in c) {
    const [wd, sl, b] = k.split('|').map(Number);
    if (pred(wd, sl, b)) { const v = c[k]; s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; s[3] += v[3]; }
  }
  return s;
}
export function mergeCounters(list) {
  const out = {};
  for (const c of list) for (const k in c || {}) {
    const t = out[k] ||= [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) t[i] += c[k][i];
  }
  return out;
}

/**
 * Taux journaliers de réouverture et de fermeture pour une tranche J, avec lissage hiérarchique :
 * réseau entier -> ce trajet -> ce trajet et ce créneau -> ce trajet, ce créneau et ce jour de semaine.
 */
export function transitionRates(odC, globalC, wd, sl, b) {
  const A = 6;
  const g = sumCells(globalC, (w, s, bb) => bb === b);
  let pr = (g[2] + 1) / (g[2] + g[3] + 20);
  let pc = (g[1] + 1) / (g[0] + g[1] + 10);
  const levels = [
    sumCells(odC, (w, s, bb) => bb === b),
    sumCells(odC, (w, s, bb) => s === sl && bb === b),
    sumCells(odC, (w, s, bb) => w === wd && s === sl && bb === b),
  ];
  for (const L of levels) {
    pr = (L[2] + A * pr) / (L[2] + L[3] + A);
    pc = (L[1] + A * pc) / (L[0] + L[1] + A);
  }
  const fine = levels[2], route = levels[0];
  return {
    reopen: pr, close: pc,
    nFine: fine[0] + fine[1] + fine[2] + fine[3],
    nRoute: route[0] + route[1] + route[2] + route[3],
    nGlobal: g[0] + g[1] + g[2] + g[3],
  };
}

export function hasHistory(odC, globalC) {
  const g = sumCells(globalC, () => true), r = sumCells(odC, () => true);
  return g[0] + g[1] + g[2] + g[3] + r[0] + r[1] + r[2] + r[3] >= 50;
}

/** Probabilité qu'un départ fermé à J rouvre au moins une fois d'ici au relevé du jour du départ. */
export function pReopen(J, wd, sl, odC, globalC) {
  if (J <= 0) return 0;
  let stay = 1;
  for (let j = J - 1; j >= 0; j--) stay *= 1 - transitionRates(odC, globalC, wd, sl, bucketOf(j)).reopen;
  return 1 - stay;
}
/** Probabilité qu'un départ ouvert à J soit encore ouvert au prochain relevé. */
export function pStillOpenTomorrow(J, wd, sl, odC, globalC) {
  if (J <= 0) return null;
  return 1 - transitionRates(odC, globalC, wd, sl, bucketOf(J - 1)).close;
}
export function reliability(n) { return n >= 120 ? 'bonne' : n >= 30 ? 'moyenne' : 'faible'; }

/* ---------- moteur de stratégie ---------- */

const KIND_LABELS = {
  direct: 'Direct', shift: 'Direct, autre horaire', alt: 'Gare voisine', day: 'Autre jour',
  split: 'Même train, 2 billets', connection: 'Correspondance', extend: 'Billet prolongé',
  mixed: 'En partie gratuit', paid: 'Payant (-30 %)',
};
export const kindLabel = k => KIND_LABELS[k] || k;

/**
 * Construit le plan de réservation.
 * q    : { o:[], d:[], oAlt:[], dAlt:[], date, from, to, flexH, flexDays, allowAlt, allowConn, allowSplit, allowExtend,
 *          minChangeSame, minChangeOther, maxWait }
 * data : { direct: départs O->D sur toute la fenêtre, fromO: départs depuis O le jour J, toD: départs vers D le jour J }
 * ctx  : { today, nowMin, resas, odC (compteurs du trajet), globalC (compteurs réseau) }
 */
export function buildPlan(q, data, ctx = {}) {
  const today = ctx.today || parisDay();
  const nowMin = ctx.nowMin ?? parisMinutes();
  const J = diffDays(q.date, today);
  const fromM = toMin(q.from || '00:00'), toM = toMin(q.to || '23:59');
  const flex = (q.flexH || 0) * 60;
  const O = new Set(q.o), D = new Set(q.d);
  const Oall = new Set([...q.o, ...(q.allowAlt ? q.oAlt || [] : [])]);
  const Dall = new Set([...q.d, ...(q.allowAlt ? q.dAlt || [] : [])]);
  const dev = m => (m < fromM ? fromM - m : m > toM ? m - toM : 0);
  const notGone = x => !(x.date === today && x.depMin <= nowMin);
  const isRoute = x => Oall.has(x.o) && Dall.has(x.d);

  const directAll = (data.direct || []).filter(isRoute);
  const durs = directAll.filter(x => O.has(x.o) && D.has(x.d)).map(x => x.dur);
  const ref = durs.length ? Math.min(...durs) : null;
  const opts = [];

  const add = (kind, legs, extra = {}) => {
    const first = legs[0], last = legs[legs.length - 1];
    const paidLegs = legs.filter(l => !l.ok).length;
    const dur = legs.length === 1 ? first.dur : ((last.arrMin - first.depMin) + 1440) % 1440;
    const devm = extra.dayShift ? 0 : dev(first.depMin);
    const slots = legs.filter(l => l.ok).length;
    const alt = legs.some((l, i) => (i === 0 && !O.has(l.o)) || (i === legs.length - 1 && !D.has(l.d)));
    let score = devm / 60 * 1.2 + (ref ? Math.max(0, dur - ref) / 60 * 0.8 : 0) + Math.max(0, slots - 1) * 1.5
      + (alt ? 1 : 0) + (extra.changeStation ? 1 : 0) + Math.abs(extra.dayShift || 0) * 3 + paidLegs * 5
      + (kind === 'extend' ? 2.5 : 0) + (extra.wait ? extra.wait / 60 * 0.3 : 0);
    if (paidLegs && paidLegs < legs.length) kind = 'mixed';
    if (paidLegs === legs.length && legs.length === 1 && kind !== 'extend') kind = 'paid';
    opts.push({ kind, label: kindLabel(kind), legs, free: paidLegs === 0, paidLegs, slots, dur, dev: devm, alt,
      date: first.date, depMin: first.depMin, arrMin: last.arrMin, score: Math.round(score * 100) / 100, ...extra });
  };

  if (J >= 0 && J <= RULES.openDaysBefore) {
    const day = directAll.filter(x => x.date === q.date && notGone(x));
    for (const x of day) {
      if (dev(x.depMin) > flex) continue;
      const alt = !O.has(x.o) || !D.has(x.d);
      add(alt ? 'alt' : dev(x.depMin) ? 'shift' : 'direct', [x]);
    }
    if (q.flexDays) {
      for (const shift of [-1, 1]) {
        const d2 = addDays(q.date, shift);
        if (d2 < today) continue;
        for (const x of directAll) if (x.date === d2 && x.ok && notGone(x) && dev(x.depMin) <= flex) add('day', [x], { dayShift: shift });
      }
    }
    const fromO = (data.fromO || []).filter(x => x.date === q.date && Oall.has(x.o) && !Dall.has(x.d) && !Oall.has(x.d) && !x.night && notGone(x));
    const toD = (data.toD || []).filter(x => x.date === q.date && Dall.has(x.d) && !Oall.has(x.o) && !x.night);
    const toDByCity = new Map();
    for (const y of toD) { if (!toDByCity.has(y.o)) toDByCity.set(y.o, []); toDByCity.get(y.o).push(y); }

    if (q.allowSplit || q.allowConn) {
      const found = [];
      for (const a of fromO) {
        if (dev(a.depMin) > flex) continue;
        for (const b of toDByCity.get(a.d) || []) {
          const same = a.trains.some(t => b.trains.includes(t));
          const wait = b.depMin - a.arrMin;
          if (same) {
            if (!q.allowSplit || wait < -5 || wait > 30) continue;
            if (!a.ok && !b.ok) continue;
            found.push(['split', [a, b], { via: a.d, wait: Math.max(0, wait) }]);
          } else if (q.allowConn) {
            const sameStation = a.di && b.oi && a.di === b.oi;
            const min = sameStation ? (q.minChangeSame ?? 10) : (q.minChangeOther ?? 60);
            if (wait < min || wait > (q.maxWait ?? 180)) continue;
            if (!a.ok && !b.ok) continue;
            found.push(['connection', [a, b], { via: a.d, wait, changeStation: !sameStation }]);
          }
        }
      }
      for (const [k, legs, ex] of found) add(k, legs, ex);
    }
    if (q.allowExtend) {
      const closed = day.filter(x => !x.ok && dev(x.depMin) <= flex);
      const pool = (data.fromO || []).filter(x => x.date === q.date && x.ok);
      for (const x of closed) {
        const cand = pool.filter(y => y.oi === x.oi && y.depMin === x.depMin && y.arrMin > x.arrMin
          && !Dall.has(y.d) && y.trains.some(t => x.trains.includes(t)))
          .sort((p, r) => p.arrMin - r.arrMin)[0];
        if (cand) add('extend', [cand], { getOff: x.d, getOffAt: x.arrMin, closedLeg: x });
      }
    }
  }

  // tri, dédoublonnage
  opts.sort((a, b) => a.score - b.score || a.depMin - b.depMin);
  const seen = new Set();
  const uniq = opts.filter(o => {
    const k = o.kind + '|' + o.legs.map(l => l.key).join('+');
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  const free = uniq.filter(o => o.free);
  const partial = capPer(uniq.filter(o => o.kind === 'mixed'), 4);
  const paid = uniq.filter(o => o.kind === 'paid').slice(0, 4);
  const freeCapped = capConnections(free, 10);

  // verdict
  let verdict;
  const deadlines = deadlinesFor(q.date, today);
  if (J < 0) verdict = { code: 'passe' };
  else if (J > RULES.openDaysBefore) verdict = { code: 'trop-tot', openDay: addDays(q.date, -RULES.openDaysBefore) };
  else if (freeCapped.length && freeCapped[0].kind === 'direct') verdict = { code: 'reserver', best: freeCapped[0] };
  else if (freeCapped.length) verdict = { code: 'compromis', best: freeCapped[0] };
  else verdict = { code: 'rien', bestPaid: paid[0] || null };

  // attendre ou agir ? (sur le créneau idéal, sans la souplesse)
  const wait = waitAnalysis(q, directAll.filter(x => x.date === q.date && notGone(x) && dev(x.depMin) === 0), J, ctx);
  verdict.hasDirect = directAll.length > 0;
  if (verdict.best && ctx.globalC && hasHistory(ctx.odC, ctx.globalC)) {
    const b = verdict.best.legs[0];
    verdict.stillOpen = pStillOpenTomorrow(diffDays(b.date, today), isoWeekday(b.date), slotOf(b.depMin), ctx.odC, ctx.globalC);
  }

  // règles du compteur
  const warnings = [];
  if (ctx.resas) {
    const st = checkResas(ctx.resas, ctx.now || new Date());
    const need = verdict.best ? verdict.best.slots : 1;
    if (st.used + need > RULES.maxSlots) warnings.push({ kind: 'compteur', text: `Ton compteur est à ${st.used}/${RULES.maxSlots} : libère une réservation avant de réserver.` });
    if (verdict.best) {
      for (const leg of verdict.best.legs) {
        if (!leg.ok) continue;
        const clash = st.list.find(r => r.etat !== 'annulee' && r.etat !== 'passee' && r.tarif !== 'avantage' && r.date === leg.date && fold(r.o) === fold(leg.o));
        if (clash) warnings.push({ kind: 'ville', text: `Tu as déjà une réservation au départ de ${pretty(leg.o)} le ${frDay(leg.date)} (${clash.dep || ''}). Une seule réservation par jour et par ville de départ : annule-la d'abord.` });
      }
    }
  }

  return { J, today, verdict, free: freeCapped, partial, paid, deadlines, wait, warnings, refDur: ref };
}

function capConnections(list, max) {
  const out = [], perVia = new Map();
  for (const o of list) {
    if (o.kind === 'connection' || o.kind === 'split') {
      const k = o.kind + o.via;
      const n = perVia.get(k) || 0;
      if (n >= 2) continue;
      perVia.set(k, n + 1);
    }
    out.push(o);
    if (out.length >= max) break;
  }
  return out;
}
function capPer(list, max) { return capConnections(list, max); }

function waitAnalysis(q, sameDay, J, ctx) {
  const closed = sameDay.filter(x => !x.ok);
  const open = sameDay.filter(x => x.ok);
  const res = { closed: closed.length, open: open.length, perDep: [], any: null, available: false };
  if (!ctx.globalC || !hasHistory(ctx.odC, ctx.globalC) || J < 0 || J > RULES.openDaysBefore) return res;
  res.available = true;
  let none = 1;
  for (const x of closed) {
    const wd = isoWeekday(x.date), sl = slotOf(x.depMin);
    const p = pReopen(J, wd, sl, ctx.odC, ctx.globalC);
    const r = transitionRates(ctx.odC, ctx.globalC, wd, sl, bucketOf(Math.max(0, J - 1)));
    res.perDep.push({ dep: x, p, n: r.nFine, nRoute: r.nRoute });
    none *= 1 - p;
  }
  res.any = closed.length ? 1 - none : null;
  res.perDep.sort((a, b) => b.p - a.p);
  return res;
}

/* ---------- radar : lecture de la fenêtre de 30 jours ---------- */

export function radarStats(deps, today) {
  const z = () => [0, 0];
  const byWd = Array.from({ length: 7 }, z), bySlot = Array.from({ length: 6 }, z), byBucket = Array.from({ length: 6 }, z);
  const cells = new Map(), wdJ = new Map();
  let total = 0, open = 0;
  for (const x of deps) {
    const J = diffDays(x.date, today);
    if (J < 0) continue;
    const wd = isoWeekday(x.date), sl = slotOf(x.depMin), b = bucketOf(J), v = x.ok ? 1 : 0;
    total++; open += v;
    byWd[wd - 1][0]++; byWd[wd - 1][1] += v;
    bySlot[sl][0]++; bySlot[sl][1] += v;
    byBucket[b][0]++; byBucket[b][1] += v;
    const ck = `${wd}|${sl}`;
    if (!cells.has(ck)) cells.set(ck, [0, 0]);
    cells.get(ck)[0]++; cells.get(ck)[1] += v;
    const jk = `${wd}|${J}`;
    if (!wdJ.has(jk)) wdJ.set(jk, { wd, J, date: x.date, t: 0, o: 0 });
    const e = wdJ.get(jk); e.t++; e.o += v;
  }
  const rate = a => (a[0] ? a[1] / a[0] : 0);
  const insights = [];
  if (total) insights.push({ tone: 'neutre', text: `${open} départs ouverts sur ${total} dans la fenêtre de réservation (${Math.round(open / total * 100)} %).` });
  const cellList = [...cells.entries()].map(([k, v]) => { const [wd, sl] = k.split('|').map(Number); return { wd, sl, t: v[0], o: v[1], r: rate(v) }; });
  const best = cellList.filter(c => c.t >= 3).sort((a, b) => b.r - a.r || b.t - a.t)[0];
  if (best && best.r > 0) insights.push({ tone: 'bon', text: `Créneau le plus ouvert : ${WEEKDAYS_LONG[best.wd - 1]} ${SLOT_LABELS[best.sl]} (${best.o} départs ouverts sur ${best.t}).` });
  const dead = cellList.filter(c => c.t >= 4 && c.o === 0).sort((a, b) => b.t - a.t).slice(0, 2);
  for (const c of dead) insights.push({ tone: 'mauvais', text: `Fermé partout : ${WEEKDAYS_LONG[c.wd - 1]} ${SLOT_LABELS[c.sl]} (0 départ ouvert sur ${c.t}). Ne compte pas sur une place ici.` });
  const lastDay = addDays(today, 30), lastDeps = deps.filter(x => x.date === lastDay);
  if (lastDeps.length >= 2 && lastDeps.every(x => !x.ok)) insights.push({ tone: 'neutre', text: `La date la plus lointaine (${frDay(lastDay)}, J-30) est encore entièrement fermée : une date qui vient d'ouvrir apparaît souvent fermée dans l'open data, puis ses places arrivent au relevé suivant.` });
  const near = [0, 0], far = [0, 0];
  for (const x of deps) { const J = diffDays(x.date, today); if (J < 0) continue; const t = J <= 7 ? near : J >= 15 ? far : null; if (t) { t[0]++; t[1] += x.ok ? 1 : 0; } }
  if (near[0] >= 5 && far[0] >= 5) {
    const rn = rate(near), rf = rate(far);
    if (rn > rf + 0.15) insights.push({ tone: 'neutre', text: `Les départs proches (J-7 et moins) sont plus ouverts (${Math.round(rn * 100)} %) que les lointains (${Math.round(rf * 100)} %) : des places sont remises en vente à l'approche du départ.` });
    else if (rf > rn + 0.15) insights.push({ tone: 'neutre', text: `Les places se raréfient à l'approche du départ (${Math.round(rf * 100)} % ouverts au-delà de J-15, ${Math.round(rn * 100)} % à J-7 et moins) : réserve tôt.` });
  }
  return { total, open, byWd, bySlot, byBucket, cells: cellList, wdJ: [...wdJ.values()].sort((a, b) => a.wd - b.wd || a.J - b.J), insights };
}

/* ---------- explorer : où partir ? ---------- */

export function exploreDestinations(outDeps, retDeps, q) {
  const inWin = (x, f, t) => x.depMin >= toMin(f || '00:00') && x.depMin <= toMin(t || '23:59');
  const from = new Set(q.from);
  const map = new Map();
  for (const x of outDeps) {
    if (!x.ok || !from.has(x.o) || from.has(x.d) || !inWin(x, q.outFrom, q.outTo)) continue;
    if (q.outDates && !q.outDates.includes(x.date)) continue;
    if (!map.has(x.d)) map.set(x.d, { city: x.d, out: [], ret: [] });
    map.get(x.d).out.push(x);
  }
  if (q.withReturn) {
    for (const x of retDeps) {
      if (!x.ok || !from.has(x.d) || !map.has(x.o) || !inWin(x, q.retFrom, q.retTo)) continue;
      if (q.retDates && !q.retDates.includes(x.date)) continue;
      map.get(x.o).ret.push(x);
    }
  }
  const list = [...map.values()].map(e => ({
    ...e,
    minDur: Math.min(...e.out.map(x => x.dur)),
    both: !q.withReturn || e.ret.length > 0,
  }));
  list.sort((a, b) => (b.both - a.both) || (b.out.length + b.ret.length) - (a.out.length + a.ret.length) || a.minDur - b.minDur);
  return list;
}

/* ---------- historique (fichiers du robot) ---------- */

/** Pour une date de voyage : nombre de départs ouverts relevé après relevé, dans un créneau horaire. */
export function fillCurve(odFiles, snaps, date, fromMin = 0, toMinV = 1439) {
  const byIdx = new Map();
  for (const f of odFiles) for (const e of (f?.x?.[date] || [])) {
    const dm = toMin(e[2]);
    if (dm < fromMin || dm > toMinV) continue;
    const first = e[5], s = e[6];
    for (let k = 0; k < s.length; k++) {
      const idx = first + k;
      if (!byIdx.has(idx)) byIdx.set(idx, [0, 0]);
      const v = byIdx.get(idx);
      if (s[k] === '1') { v[0]++; v[1]++; } else if (s[k] === '0') v[1]++;
    }
  }
  const snapByIdx = new Map(snaps.map(s => [s.i, s]));
  return [...byIdx.entries()].filter(([i]) => snapByIdx.has(i)).map(([i, [o, t]]) => {
    const s = snapByIdx.get(i);
    return { i, day: s.day, J: diffDays(date, s.day), open: o, total: t };
  }).sort((a, b) => b.J - a.J);
}

export function departuresOf(odFiles, date) {
  const out = [];
  for (const f of odFiles) for (const e of (f?.x?.[date] || [])) out.push({ o: f.o, d: f.d, oi: e[0], di: e[1], dep: e[2], arr: e[3], trains: e[4], first: e[5], states: e[6] });
  return out.sort((a, b) => toMin(a.dep) - toMin(b.dep));
}

/* ---------- calendrier .ics ---------- */

export function buildICS(events) {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const dt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const stamp = dt(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aiguillage//MAX JEUNE//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${dt(e.start)}`,
      `DTEND:${dt(e.end || new Date(e.start.getTime() + 15 * 60000))}`, `SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.alarm != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.alarm}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (enc.encode(cur + ch).length > limit) { parts.push(cur); cur = ch; } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/* ---------- règles d'alerte (config.json) ---------- */

const DAY_NAMES = { lun: 1, lundi: 1, mar: 2, mardi: 2, mer: 3, mercredi: 3, jeu: 4, jeudi: 4, ven: 5, vendredi: 5, sam: 6, samedi: 6, dim: 7, dimanche: 7 };
export function parseDays(list) {
  if (!list || !list.length) return null;
  return new Set(list.map(v => typeof v === 'number' ? v : DAY_NAMES[fold(v).toLowerCase()] || +v).filter(n => n >= 1 && n <= 7));
}
/** Une règle d'alerte s'applique-t-elle à ce départ ? (sens = 'aller' ou 'retour' pour un aller-retour) */
export function ruleMatches(rule, x) {
  const de = (rule.de || []).map(fold), vers = (rule.vers || []).map(fold);
  const fwd = (de.includes(fold(x.o)) || de.includes(fold(x.oi))) && (vers.includes(fold(x.d)) || vers.includes(fold(x.di)));
  const back = /retour/.test(rule.sens || '') && (vers.includes(fold(x.o)) || vers.includes(fold(x.oi))) && (de.includes(fold(x.d)) || de.includes(fold(x.di)));
  if (!fwd && !back) return false;
  const days = parseDays(rule.jours);
  if (days && !days.has(isoWeekday(x.date))) return false;
  const h = back && rule.heures_retour ? rule.heures_retour : rule.heures;
  if (h && h.length === 2 && (x.depMin < toMin(h[0]) || x.depMin > toMin(h[1]))) return false;
  if (rule.dates && rule.dates.length === 2 && (x.date < rule.dates[0] || x.date > rule.dates[1])) return false;
  return fwd ? 'aller' : 'retour';
}

/* ---------- bilan à l'année ---------- */

/* Drapeaux d'un départ dans le résumé annuel. */
export const YF = { ever: 1, opening: 2, j7: 4, j1: 8 };
export const YEAR_METRICS = {
  ever: { label: 'Ouverts à un moment', bit: YF.ever, key: 'ever' },
  open: { label: 'À l’ouverture', bit: YF.opening, key: 'open' },
  j7: { label: 'À J-7', bit: YF.j7, key: 'j7' },
  j1: { label: 'La veille', bit: YF.j1, key: 'j1' },
};

function statesByJ(e, date, dayByIdx) {
  const first = e[5], s = e[6], st = {};
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch !== '1' && ch !== '0') continue;
    const day = dayByIdx.get(first + k);
    if (!day) continue;
    const J = diffDays(date, day);
    if (!(J in st)) st[J] = ch;
  }
  return st;
}

/**
 * Résumé compact d'une date de voyage (gardé pour toujours) :
 * [drapeaux connus, "HHMMf…"] avec 5 caractères par départ (heure, puis drapeaux en hexadécimal).
 * « À l'ouverture » = premier relevé complet (J-29, sinon J-28) : à J-30 la date apparaît souvent fermée.
 */
export function summarizeDate(entries, date, dayByIdx) {
  let known = YF.ever, out = '';
  for (const e of entries) {
    const st = statesByJ(e, date, dayByIdx);
    const pick = (...Js) => { for (const J of Js) if (J in st) return st[J]; return null; };
    let f = Object.values(st).includes('1') ? YF.ever : 0;
    const o = pick(29, 28), s7 = pick(7, 6, 8), s1 = pick(1, 2);
    if (o != null) { known |= YF.opening; if (o === '1') f |= YF.opening; }
    if (s7 != null) { known |= YF.j7; if (s7 === '1') f |= YF.j7; }
    if (s1 != null) { known |= YF.j1; if (s1 === '1') f |= YF.j1; }
    out += String(e[2]).replace(':', '') + f.toString(16);
  }
  return [known, out];
}

export function decodeSummary(rec) {
  const [known, s] = rec, deps = [];
  for (let i = 0; i + 5 <= s.length; i += 5) deps.push({ depMin: (+s.slice(i, i + 2)) * 60 + (+s.slice(i + 2, i + 4)), f: parseInt(s[i + 4], 16) });
  return { known, deps };
}

/** Série annuelle d'un trajet, limitée à un créneau horaire : une entrée par date de voyage. */
export function yearSeries(odFiles, snaps, fromMin, toMinV, today) {
  const dayByIdx = new Map((snaps || []).map(s => [s.i, s.day]));
  const acc = new Map();
  const add = (date, rec, partial) => {
    const { known, deps } = decodeSummary(rec);
    let a = acc.get(date);
    if (!a) acc.set(date, a = { date, n: 0, ever: 0, open: 0, j7: 0, j1: 0, known: 0, partial });
    a.known |= known;
    for (const d of deps) {
      if (d.depMin < fromMin || d.depMin > toMinV) continue;
      a.n++;
      if (d.f & YF.ever) a.ever++;
      if (d.f & YF.opening) a.open++;
      if (d.f & YF.j7) a.j7++;
      if (d.f & YF.j1) a.j1++;
    }
  };
  for (const f of odFiles) {
    for (const [date, rec] of Object.entries(f?.y || {})) add(date, rec, false);
    for (const [date, entries] of Object.entries(f?.x || {})) add(date, summarizeDate(entries, date, dayByIdx), date >= today);
  }
  return [...acc.values()].filter(a => a.n > 0).sort((a, b) => a.date.localeCompare(b.date));
}

/** Part de départs ouverts pour une date et un indicateur (null si inconnu). */
export function yearRate(a, metric) {
  const m = YEAR_METRICS[metric];
  if (!a || !a.n || !(a.known & m.bit)) return null;
  if (metric === 'ever' && a.partial) return a.ever ? a.ever / a.n : null;
  return a[m.key] / a.n;
}

/** Regroupe la série (par mois, par jour de semaine…) : clé -> [départs, ouverts]. Les dates en cours sont exclues. */
export function groupRates(series, metric, keyFn) {
  const m = YEAR_METRICS[metric], g = new Map();
  for (const a of series) {
    if (a.partial || !(a.known & m.bit)) continue;
    const k = keyFn(a);
    const t = g.get(k) || [0, 0];
    t[0] += a.n; t[1] += a[m.key];
    g.set(k, t);
  }
  return g;
}
