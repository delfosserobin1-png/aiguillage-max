import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../app/shared.js';

const row = (o, d, dep, arr, ok, train, date = '2026-12-04', oi, di) => ({
  date, train_no: train, origine: o, destination: d, origine_iata: oi || o.slice(0, 5), destination_iata: di || d.slice(0, 5),
  heure_depart: dep, heure_arrivee: arr, od_happy_card: ok ? 'OUI' : 'NON', axe: 'SUD EST',
});

test('replie les deux rames d’un même départ et garde « ouvert » si une rame l’est', () => {
  const deps = E.normalizeRows([row('PARIS', 'LYON', '18:00', '19:56', false, 6625), row('PARIS', 'LYON', '18:00', '19:56', true, 6675)]);
  assert.equal(deps.length, 1);
  assert.equal(deps[0].ok, true);
  assert.deepEqual(deps[0].trains, ['6625', '6675']);
  assert.equal(deps[0].dur, 116);
});

test('créneaux, tranches et jours de semaine', () => {
  assert.equal(E.slotOf(E.toMin('08:59')), 0);
  assert.equal(E.slotOf(E.toMin('17:00')), 4);
  assert.equal(E.bucketOf(0), 0); assert.equal(E.bucketOf(3), 1); assert.equal(E.bucketOf(30), 5);
  assert.equal(E.isoWeekday('2026-12-04'), 5);
  assert.equal(E.diffDays('2026-12-04', '2026-11-24'), 10);
});

test('heure de Paris -> UTC, été comme hiver', () => {
  assert.equal(E.parisToUTC('2026-12-04', '17:00').toISOString(), '2026-12-04T16:00:00.000Z');
  assert.equal(E.parisToUTC('2026-07-04', '17:00').toISOString(), '2026-07-04T15:00:00.000Z');
});

test('échéances MAX : J-30, J-7, J-2, veille 17 h', () => {
  const { list } = E.deadlinesFor('2026-12-04', '2026-11-24');
  const by = Object.fromEntries(list.map(d => [d.id, d]));
  assert.equal(by.ouverture.day, '2026-11-04');
  assert.equal(by.remboursement.day, '2026-11-27');
  assert.equal(by['confirmation-debut'].day, '2026-12-02');
  assert.equal(by['confirmation-fin'].day, '2026-12-03');
  assert.equal(by['confirmation-fin'].time, '17:00');
});

test('compteur, confirmation et règle « une réservation par jour et par ville »', () => {
  const now = E.parisToUTC('2026-12-03', '10:00');
  const resas = [
    { id: 'a', o: 'PARIS (intramuros)', d: 'LYON (intramuros)', date: '2026-12-04', dep: '18:00', tarif: 'max', statut: 'active' },
    { id: 'b', o: 'PARIS (intramuros)', d: 'LILLE (intramuros)', date: '2026-12-04', dep: '08:00', tarif: 'max', statut: 'active' },
    { id: 'c', o: 'LYON (intramuros)', d: 'PARIS (intramuros)', date: '2026-12-20', dep: '18:00', tarif: 'max', statut: 'active' },
    { id: 'd', o: 'LYON (intramuros)', d: 'PARIS (intramuros)', date: '2026-12-21', dep: '18:00', tarif: 'avantage', statut: 'active' },
  ];
  const st = E.checkResas(resas, now);
  assert.equal(st.used, 3);
  const a = st.list.find(r => r.id === 'a');
  assert.equal(a.etat, 'urgent');
  assert.equal(a.conflits.length, 1);
  assert.equal(st.list.find(r => r.id === 'c').etat, 'attente');
  assert.equal(st.list.find(r => r.id === 'd').etat, 'payant');
  const late = E.checkResas(resas, E.parisToUTC('2026-12-03', '17:30'));
  assert.equal(late.list.find(r => r.id === 'a').etat, 'expiree');
});

test('stratégie : direct ouvert = réserver ; sinon correspondance, découpage et billet prolongé', () => {
  const today = '2026-11-24';
  const D = '2026-12-04';
  const rows = [
    row('PARIS (intramuros)', 'LYON (intramuros)', '18:00', '19:56', false, 6625, D, 'FRPLY', 'FRLPD'),
    row('PARIS (intramuros)', 'VALENCE TGV', '18:00', '20:10', true, 6625, D, 'FRPLY', 'FRVAF'),
    row('PARIS (intramuros)', 'DIJON VILLE', '17:45', '19:22', true, 6701, D, 'FRPLY', 'FRDIJ'),
    row('DIJON VILLE', 'LYON (intramuros)', '20:00', '21:40', true, 6801, D, 'FRDIJ', 'FRLPD'),
    row('PARIS (intramuros)', 'MACON LOCHE TGV', '17:30', '19:05', true, 6611, D, 'FRPLY', 'FRMLT'),
    row('MACON LOCHE TGV', 'LYON (intramuros)', '19:07', '19:40', true, 6611, D, 'FRMLT', 'FRLPD'),
    row('PARIS (intramuros)', 'LYON (intramuros)', '17:30', '19:40', false, 6611, D, 'FRPLY', 'FRLPD'),
  ];
  const deps = E.normalizeRows(rows);
  const q = { o: ['PARIS (intramuros)'], d: ['LYON (intramuros)'], oAlt: [], dAlt: [], date: D, from: '17:00', to: '20:00',
    flexH: 0, allowConn: true, allowSplit: true, allowExtend: true };
  const data = { direct: deps, fromO: deps, toD: deps };
  const plan = E.buildPlan(q, data, { today, nowMin: 600 });
  assert.equal(plan.verdict.code, 'compromis');
  const kinds = plan.free.map(o => o.kind);
  assert.ok(kinds.includes('split'), 'découpage du 6611 à Mâcon');
  assert.ok(kinds.includes('connection'), 'correspondance à Dijon');
  assert.ok(kinds.includes('extend'), 'billet prolongé jusqu’à Valence');
  const split = plan.free.find(o => o.kind === 'split');
  assert.equal(split.slots, 2);
  const conn = plan.free.find(o => o.kind === 'connection');
  assert.equal(conn.wait, 38);
  const ext = plan.free.find(o => o.kind === 'extend');
  assert.equal(ext.getOff, 'LYON (intramuros)');

  const open = E.normalizeRows([...rows, row('PARIS (intramuros)', 'LYON (intramuros)', '19:00', '20:56', true, 6627, D, 'FRPLY', 'FRLPD')]);
  const plan2 = E.buildPlan(q, { direct: open, fromO: open, toD: open }, { today, nowMin: 600 });
  assert.equal(plan2.verdict.code, 'reserver');
  assert.equal(plan2.verdict.best.legs[0].dep, '19:00');

  const early = E.buildPlan({ ...q, date: '2027-01-15' }, { direct: [] }, { today });
  assert.equal(early.verdict.code, 'trop-tot');
  assert.equal(early.verdict.openDay, '2026-12-16');
});

test('le compteur plein et le conflit de ville apparaissent dans les avertissements', () => {
  const D = '2026-12-04';
  const deps = E.normalizeRows([row('PARIS (intramuros)', 'LYON (intramuros)', '19:00', '20:56', true, 6627, D, 'FRPLY', 'FRLPD')]);
  const resas = Array.from({ length: 6 }, (_, i) => ({ id: String(i), o: i ? 'NANTES' : 'PARIS (intramuros)', d: 'X', date: E.addDays(D, i === 0 ? 0 : i), tarif: 'max', statut: 'active' }));
  const plan = E.buildPlan({ o: ['PARIS (intramuros)'], d: ['LYON (intramuros)'], date: D, from: '17:00', to: '21:00' }, { direct: deps }, { today: '2026-11-24', nowMin: 600, resas, now: E.parisToUTC('2026-11-24', '10:00') });
  assert.equal(plan.verdict.code, 'reserver');
  assert.ok(plan.warnings.some(w => w.kind === 'compteur'));
  assert.ok(plan.warnings.some(w => w.kind === 'ville'));
});

test('probabilités : lissage vers le réseau quand le trajet manque de données', () => {
  const globalC = { '5|4|2': [800, 100, 30, 300], '1|1|2': [500, 20, 10, 200] };
  const sparse = { '5|4|2': [1, 0, 1, 0] };
  const r = E.transitionRates(sparse, globalC, 5, 4, 2);
  assert.ok(r.reopen > 0.05 && r.reopen < 0.5, `réouverture lissée ${r.reopen}`);
  assert.ok(E.hasHistory(sparse, globalC));
  const p = E.pReopen(5, 5, 4, sparse, globalC);
  assert.ok(p > r.reopen && p < 1);
  assert.equal(E.pReopen(0, 5, 4, sparse, globalC), 0);
});

test('fichier .ics valide (fins de ligne CRLF, lignes pliées à 75 octets)', () => {
  const ics = E.buildICS([{ uid: 'x@y', start: new Date('2026-12-02T08:00:00Z'), title: 'Confirmer ma résa MAX Paris (intramuros) → Lyon (intramuros), très long titre pour tester le pliage', alarm: 0 }]);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261202T080000Z'));
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, l);
});

test('règles d’alerte : sens, jours, heures', () => {
  const rule = { de: ['PARIS (intramuros)'], vers: ['LYON (intramuros)'], sens: 'aller-retour', jours: ['ven', 'dim'], heures: ['17:00', '21:00'], heures_retour: ['15:00', '22:00'] };
  const [fri] = E.normalizeRows([row('PARIS (intramuros)', 'LYON (intramuros)', '18:00', '19:56', true, 1, '2026-12-04')]);
  const [sunBack] = E.normalizeRows([row('LYON (intramuros)', 'PARIS (intramuros)', '21:30', '23:26', true, 2, '2026-12-06')]);
  const [monday] = E.normalizeRows([row('PARIS (intramuros)', 'LYON (intramuros)', '18:00', '19:56', true, 3, '2026-12-07')]);
  assert.equal(E.ruleMatches(rule, fri), 'aller');
  assert.equal(E.ruleMatches(rule, sunBack), 'retour');
  assert.equal(E.ruleMatches(rule, monday), false);
});

test('règles d’alerte : jours et arrivée propres au retour', () => {
  const rule = { de: ['PARIS (intramuros)'], vers: ['VANNES'], sens: 'aller-retour', jours: ['jeu', 'ven'], heures: ['19:30', '23:59'],
    jours_retour: ['dim'], heures_retour: ['12:00', '23:59'], arrivee_retour: ['00:00', '20:30'] };
  const dep = (o, d, h1, h2, n, date) => E.normalizeRows([row(o, d, h1, h2, true, n, date)])[0];
  assert.equal(E.ruleMatches(rule, dep('PARIS (intramuros)', 'VANNES', '22:15', '01:25', 1, '2026-12-03')), 'aller');
  assert.equal(E.ruleMatches(rule, dep('PARIS (intramuros)', 'VANNES', '18:00', '20:25', 2, '2026-12-04')), false);
  assert.equal(E.ruleMatches(rule, dep('VANNES', 'PARIS (intramuros)', '17:46', '20:09', 3, '2026-12-06')), 'retour');
  assert.equal(E.ruleMatches(rule, dep('VANNES', 'PARIS (intramuros)', '18:26', '21:16', 4, '2026-12-06')), false);
  assert.equal(E.ruleMatches(rule, dep('VANNES', 'PARIS (intramuros)', '17:46', '20:09', 5, '2026-12-04')), false);
  assert.equal(E.ruleMatches(rule, dep('PARIS (intramuros)', 'VANNES', '20:00', '22:29', 6, '2026-12-06')), false);
  const midnight = { ...rule, arrivee_retour: ['00:00', '23:59'] };
  assert.equal(E.ruleMatches(midnight, dep('VANNES', 'PARIS (intramuros)', '20:14', '22:42', 7, '2026-12-06')), 'retour');
  assert.equal(E.ruleMatches(midnight, dep('VANNES', 'PARIS (intramuros)', '21:26', '00:04', 8, '2026-12-06')), false);
});

test('gares voisines', () => {
  const all = ['PARIS (intramuros)', 'MASSY TGV', 'MARNE LA VALLEE CHESSY', 'LYON (intramuros)', 'LYON ST EXUPERY TGV', 'AIX EN PROVENCE TGV', 'MARSEILLE ST CHARLES'];
  assert.deepEqual(E.nearbyStations('PARIS (intramuros)', all), ['MARNE LA VALLEE CHESSY', 'MASSY TGV']);
  assert.deepEqual(E.nearbyStations('LYON (intramuros)', all), ['LYON ST EXUPERY TGV']);
  assert.deepEqual(E.nearbyStations('MARSEILLE ST CHARLES', all), ['AIX EN PROVENCE TGV']);
});

test('bilan annuel : résumé compact d’une date et série par créneau', () => {
  const date = '2026-12-20';
  const snaps = Array.from({ length: 31 }, (_, i) => ({ i, day: E.addDays('2026-11-20', i) }));
  const dayByIdx = new Map(snaps.map(s => [s.i, s.day]));
  // A : fermé à J-30, ouvert de J-29 à J-21, fermé ensuite, rouvert la veille
  const sA = '0' + '1'.repeat(9) + '0'.repeat(19) + '11';
  const eA = ['FRPLY', 'FRLPD', '18:00', '19:56', '6625', 0, sA];
  const eB = ['FRPLY', 'FRLPD', '19:00', '20:56', '6627', 0, '0'.repeat(31)];
  const rec = E.summarizeDate([eA, eB], date, dayByIdx);
  assert.equal(rec[0], 15);
  assert.equal(rec[1], '1800b19000');
  const d = E.decodeSummary(rec);
  assert.deepEqual(d.deps.map(x => [x.depMin, x.f]), [[1080, 11], [1140, 0]]);

  const files = [{ x: {}, y: { [date]: rec } }];
  const all = E.yearSeries(files, snaps, 0, 1439, '2026-12-25');
  assert.equal(all.length, 1);
  assert.deepEqual([all[0].n, all[0].ever, all[0].open, all[0].j7, all[0].j1], [2, 1, 1, 0, 1]);
  assert.equal(E.yearRate(all[0], 'ever'), 0.5);
  const late = E.yearSeries(files, snaps, E.toMin('18:30'), 1439, '2026-12-25');
  assert.deepEqual([late[0].n, late[0].ever], [1, 0]);

  // date encore en cours : calculée depuis le détail, marquée « partielle »
  const live = E.yearSeries([{ x: { [date]: [eA] }, y: {} }], snaps.slice(0, 12), 0, 1439, '2026-12-01');
  assert.equal(live[0].partial, true);
  assert.equal(live[0].known & E.YF.j7, 0);
  assert.equal(E.groupRates(live, 'ever', a => a.date.slice(0, 7)).size, 0);
});

test('explorer : plusieurs créneaux à la fois', () => {
  const out = E.normalizeRows([
    row('PARIS (intramuros)', 'LYON (intramuros)', '08:00', '10:00', true, 1, '2026-12-04'),
    row('PARIS (intramuros)', 'LYON (intramuros)', '12:30', '14:30', true, 2, '2026-12-04'),
    row('PARIS (intramuros)', 'LYON (intramuros)', '15:00', '17:00', true, 3, '2026-12-04'),
  ]);
  const q = { from: ['PARIS (intramuros)'], outDates: ['2026-12-04'], withReturn: false };
  const deps = w => E.exploreDestinations(out, [], { ...q, outWins: w })[0]?.out.map(x => x.dep) || [];
  assert.deepEqual(deps([['05:00', '12:00'], ['13:00', '18:00']]), ['08:00', '15:00']);
  assert.deepEqual(deps([['11:00', '14:30']]), ['12:30']);
  assert.deepEqual(E.exploreDestinations(out, [], { ...q, outFrom: '00:00', outTo: '23:59' })[0].out.length, 3);
});

test('veille de voyage : départs de demain suivis, par règle et par sens', () => {
  const rule = { de: ['PARIS'], vers: ['LYON'], sens: 'aller-retour', jours: ['ven'], jours_retour: ['dim'], heures: ['17:00', '23:59'] };
  const deps = E.normalizeRows([
    row('PARIS', 'LYON', '18:00', '19:56', true, 1, '2026-12-04'),
    row('PARIS', 'LYON', '19:00', '20:56', false, 2, '2026-12-04'),
    row('PARIS', 'LYON', '08:00', '09:56', true, 3, '2026-12-04'),
    row('LYON', 'PARIS', '18:00', '19:56', true, 4, '2026-12-06'),
  ]);
  const fri = E.tomorrowLegs([rule], deps, '2026-12-03');
  assert.equal(fri.length, 1);
  assert.deepEqual([fri[0].sens, fri[0].open, fri[0].total], ['aller', 1, 2]);
  const sun = E.tomorrowLegs([rule], deps, '2026-12-05');
  assert.deepEqual(sun.map(l => [l.sens, l.open, l.total]), [['retour', 1, 1]]);
  assert.equal(E.tomorrowLegs([rule], deps, '2026-12-04').length, 0);
});
