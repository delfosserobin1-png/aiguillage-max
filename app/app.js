import * as E from './shared.js';

/* ================= outils ================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = n => esc(E.pretty(n));
const pct = x => (x >= 0.95 ? '> 95 %' : x > 0 && x < 0.05 ? '< 5 %' : `${Math.round(x * 100)} %`);
/* Typographie française : espaces fines insécables avant % : ; ? ! » et après «. */
const typo = h => h.replace(/(\d|[<>]) %/g, '$1 %').replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ').replace(/(\d) (h|min)\b/g, '$1 $2');
const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
// en dessous de 7 nuits de relevés, les chances de réouverture ne veulent encore rien dire : on ne les affiche pas
const NUITS_MIN = 7;
const nuitsReleves = () => (S.hist.meta?.snaps || []).filter(s => s.counted).length;
/* ---------- comptes : Rob et Flo ont chacun leurs données sur le téléphone ---------- */
const PROFILS = { rob: 'Rob', flo: 'Flo' };
const PERSO = ['resas', 'partages', 'trajet', 'flex', 'altOff', 'recents', 'explore'];
// ?compte=rob ou ?compte=flo : change de compte depuis un lien (porte de sortie si un écran bloque l'app)
(() => { try { const q = new URLSearchParams(location.search), c = q.get('compte'); if (!PROFILS[c]) return; localStorage.setItem('aiguillage.profil', c); q.delete('compte'); history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash); } catch { /* stockage indisponible */ } })();
const profil = (() => { try { const p = localStorage.getItem('aiguillage.profil'); return PROFILS[p] ? p : null; } catch { return null; } })();
const store = {
  get(k, d) { try { const v = localStorage.getItem(`aiguillage.${profil || 'invite'}.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { if (!profil) return; try { localStorage.setItem(`aiguillage.${profil}.${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
function chooseProfil(p) {
  try {
    // première fois sur ce téléphone : les données d'avant les comptes vont au compte choisi
    const fresh = !PERSO.some(k => localStorage.getItem(`aiguillage.${p}.${k}`) != null);
    for (const k of PERSO) {
      const v = localStorage.getItem('aiguillage.' + k);
      if (v != null && fresh) localStorage.setItem(`aiguillage.${p}.${k}`, v);
      localStorage.removeItem('aiguillage.' + k);
    }
    localStorage.setItem('aiguillage.profil', p);
  } catch { /* stockage indisponible */ }
  location.reload();
}
/* Pause d'un compte : pause.json, écrit à la publication depuis la variable GitHub PAUSE (rien dans le code ni dans
   son historique). Format : { "flo": { "titre": "…", "message": "…", "jusqua": "<date ISO, facultative>" } }.
   L'app vérifie au démarrage, toutes les 30 s et au retour sur l'écran : l'écran de pause apparaît et disparaît sans rafraîchir. */
let pauseEl = null;
async function checkPause() {
  if (!profil) return;
  let p;
  try { p = (await fetch('pause.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})))?.[profil]; } catch { return; }
  const end = p?.jusqua ? Date.parse(p.jusqua) : Infinity;
  if (!p || !(p.titre || p.message) || !(end > Date.now())) { pauseEl?.remove(); pauseEl = null; return; }
  let back = '';
  if (Number.isFinite(end)) {
    const d = new Date(end), day = E.parisDay(d), today = E.parisDay(), hour = E.fmtMin(E.parisMinutes(d));
    const when = day === today ? `à ${hour}` : day === E.addDays(today, 1) ? `demain à ${hour}` : `le ${E.frDay(day)} à ${hour}`;
    back = `<p style="color:#fff;opacity:.65;font-size:13px">L’app revient ${esc(when)}.</p>`;
  }
  const html = `${p.titre ? `<h2>${esc(p.titre)}</h2>` : ''}${p.message ? `<p>${esc(p.message)}</p>` : ''}${back}`;
  if (!pauseEl) {
    pauseEl = document.createElement('div');
    pauseEl.className = 'who-pick';
    pauseEl.setAttribute('role', 'alertdialog');
    pauseEl.setAttribute('aria-modal', 'true');
    document.body.append(pauseEl);
  }
  if (pauseEl.innerHTML !== html) pauseEl.innerHTML = html;
}
function initProfil() {
  $$('.brand .who').forEach(b => {
    const on = b.dataset.p === profil;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? `Compte de ${PROFILS[b.dataset.p]}` : `Passer au compte de ${PROFILS[b.dataset.p]}`;
    b.addEventListener('click', () => { if (b.dataset.p !== profil) chooseProfil(b.dataset.p); });
  });
  $$('#who [data-p]').forEach(b => b.addEventListener('click', () => chooseProfil(b.dataset.p)));
  $('#who').hidden = !!profil;
}
const ICON = {
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
};
const banner = (kind, html) => `<div class="banner ${kind}">${kind === 'info' ? ICON.info : ICON.warn}<div>${html}</div></div>`;
const loading = text => `<div class="loadline"><span class="spinner"></span>${esc(text)}</div>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2800, msg.length * 55));
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); }
  catch { toast('Copie impossible : sélectionne le texte à la main'); }
}
function download(name, text, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const SLOTS = {
  matin: ['05:00', '12:00', 'Matin'], midi: ['11:00', '14:30', 'Midi'], aprem: ['13:00', '18:00', 'Après-midi'],
  soir: ['17:00', '23:59', 'Soir'], jour: ['00:00', '23:59', 'Toute la journée'],
};
const SNCF_CONNECT = 'https://www.sncf-connect.com/';

/* ================= données ================= */

const S = {
  apiMeta: null, stations: [], names: [],
  hist: { meta: null, stats: null },
  resas: store.get('resas', []),
  partages: store.get('partages', []),
  config: null, cache: new Map(),
};

// fourchettes de prix officielles des tronçons payants, chargées après l'analyse (une requête par trajet)
async function loadFares(plan) {
  T.fares ||= new Map();
  const legs = [...plan.free, ...plan.partial, ...plan.paid].flatMap(o => o.legs).filter(l => !l.ok);
  const pairs = [...new Set(legs.map(l => `${l.o}|${l.d}`))].filter(k => !T.fares.has(k)).slice(0, 10);
  await Promise.all(pairs.map(async k => {
    const [o, d] = k.split('|');
    const q = (a, b) => getJSON(`${E.TARIFS_API}?where=${encodeURIComponent(`gare_origine like ${E.sqlStr(E.tarifPattern(a))} and gare_destination like ${E.sqlStr(E.tarifPattern(b))} and classe="2"`)}&limit=100`).then(j => E.pickFare(j.results)).catch(() => null);
    // la grille omet parfois un sens : on regarde l'autre sens si le TGV INOUI manque
    let f = await q(o, d);
    if (!f || f.kind !== 'avantage') { const r = await q(d, o); if (r && (!f || r.kind === 'avantage')) f = r; }
    T.fares.set(k, f);
  }));
  return pairs.length;
}

async function getJSON(url, { cache = true } = {}) {
  if (cache && S.cache.has(url)) return S.cache.get(url);
  const p = fetch(url).then(async r => {
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; e.body = await r.text().catch(() => ''); throw e; }
    return r.json();
  });
  if (cache) { S.cache.set(url, p); p.catch(() => S.cache.delete(url)); }
  return p;
}

async function apiMeta() {
  if (!S.apiMeta) {
    const j = await getJSON(E.API_BASE);
    const m = j.metas?.default || {};
    S.apiMeta = { fields: (j.fields || []).map(f => f.name), at: m.data_processed || m.modified || null };
  }
  return S.apiMeta;
}

/* Syntaxes ODSQL essayées pour filtrer par date ; la première acceptée par l'API est retenue. */
const DATE_SYNTAX = [
  E.dateRange,
  (a, b) => (a === b ? `date=date'${a}'` : `date>=date'${a}' and date<=date'${b}'`),
  (a, b) => (a === b ? `date="${a}"` : `date>="${a}" and date<="${b}"`),
];
let dateSyntax = 0;

/** Requête sur le jeu tgvmax. Si aucun filtre de date n'est accepté, on filtre côté navigateur. */
async function apiRows(where, range) {
  const meta = await apiMeta().catch(() => ({ fields: [] }));
  const sel = E.WANTED_FIELDS.filter(f => !meta.fields.length || meta.fields.includes(f)).join(',');
  const url = w => `${E.API_BASE}/exports/json?select=${encodeURIComponent(sel)}&where=${encodeURIComponent(w)}`;
  if (range) {
    for (let k = dateSyntax; k >= 0 && k < DATE_SYNTAX.length; k++) {
      try {
        const rows = E.normalizeRows(await getJSON(url(`${where} and ${DATE_SYNTAX[k](range[0], range[1])}`)));
        dateSyntax = k;
        return rows.filter(x => x.date >= range[0] && x.date <= range[1]);
      } catch (e) { if (e.status !== 400) throw e; }
    }
    dateSyntax = -1;
    return E.normalizeRows(await getJSON(url(where))).filter(x => x.date >= range[0] && x.date <= range[1]);
  }
  return E.normalizeRows(await getJSON(url(where)));
}

async function loadStations() {
  try { S.stations = await getJSON('data/stations.json'); }
  catch {
    try {
      const rows = await getJSON(`${E.API_BASE}/exports/json?select=origine&group_by=origine`);
      S.stations = rows.map(r => ({ n: r.origine, i: [], c: 0 }));
    } catch { S.stations = []; }
  }
  S.names = S.stations.map(s => s.n);
}

const histReady = (async () => {
  try { S.hist.meta = await getJSON('data/meta.json'); } catch { S.hist.meta = null; return; }
  const [stats, index] = await Promise.all([getJSON('data/stats.json').catch(() => null), getJSON('data/od-index.json').catch(() => null)]);
  S.hist.stats = stats;
  S.hist.index = index;
})();
const loadOd = (o, d) => {
  if (!S.hist.meta) return Promise.resolve(null);
  if (S.hist.index && !(S.hist.index[o] || []).includes(d)) return Promise.resolve(null);
  return getJSON('data/' + E.odPath(o, d)).catch(() => null);
};

function repoInfo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0] || '';
  const base = `https://github.com/${m[1]}/${repo}`;
  return { owner: m[1], repo, base, editConfig: `${base}/edit/main/config.json`, actions: `${base}/actions` };
}

function errorBanner(e) {
  if (e && e.status === 400) return banner('bad', `L'API SNCF a refusé la requête (${esc(e.body?.slice(0, 160) || e.message)}). Le format du jeu de données a peut-être changé.`);
  return banner('bad', `Impossible de joindre l'open data SNCF pour le moment (${esc(e?.message || 'erreur réseau')}). Vérifie ta connexion et réessaie.`);
}

/* ================= sélecteur de gare ================= */

function picker(root, { onPick } = {}) {
  const input = $('input', root), list = $('.sugg', root);
  let value = '', items = [], active = -1;
  const set = (name, silent = false) => {
    value = name || '';
    input.value = name ? E.pretty(name) : '';
    list.hidden = true;
    if (!silent) onPick?.(value);
  };
  const draw = () => {
    list.innerHTML = items.length
      ? items.map((s, k) => `<li role="option" data-k="${k}" aria-selected="${k === active}">${P(s.n)}${s.i?.length ? `<small>${esc(s.i.slice(0, 2).join(' '))}</small>` : ''}</li>`).join('')
      : '<li class="muted">Aucune gare avec ce nom</li>';
    list.hidden = false;
  };
  const search = () => {
    const q = E.fold(input.value.trim());
    if (!q) { list.hidden = true; items = []; return; }
    const scored = [];
    for (const s of S.stations) {
      const f = E.fold(s.n), i = f.indexOf(q);
      if (i < 0) continue;
      scored.push([i === 0 ? 0 : /[\s(\/-]/.test(f[i - 1]) ? 1 : 2, -(s.c || 0), s]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    items = scored.slice(0, 8).map(x => x[2]);
    active = items.length ? 0 : -1;
    draw();
  };
  input.addEventListener('input', () => { value = ''; search(); });
  input.addEventListener('keydown', e => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { set(items[Math.max(0, active)].n); e.preventDefault(); }
    else if (e.key === 'Escape') { list.hidden = true; }
  });
  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-k]');
    if (li) { e.preventDefault(); set(items[+li.dataset.k].n); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    list.hidden = true;
    if (value || !input.value.trim()) return;
    const q = E.fold(input.value.trim());
    const hit = S.stations.find(s => E.fold(s.n) === q || E.fold(E.pretty(s.n)) === q) || items[0];
    if (hit) set(hit.n);
  }, 160));
  return { get: () => value, set, input };
}

function slotChips(container, current, onPick) {
  container.innerHTML = Object.entries(SLOTS).map(([k, [, , l]]) => `<button type="button" class="chip" data-slot="${k}" aria-pressed="${k === current}">${l}</button>`).join('');
  container.addEventListener('click', e => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    $$('[data-slot]', container).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset.slot);
  });
}

/* ================= onglets ================= */

const TABS = ['trajet', 'explorer', 'resas', 'suivi', 'guide'];
function showTab() {
  const id = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'trajet';
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== id;
  $$('.tabs a').forEach(a => { if (a.dataset.tab === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (id === 'resas') renderResas();
  if (id === 'suivi') renderSuivi();
  window.scrollTo({ top: 0 });
}

/* ================= onglet Trajet ================= */

const T = {};
function initTrajet() {
  const saved = store.get('trajet', null);
  T.po = picker($('#p-o'), { onPick: refreshAlts });
  T.pd = picker($('#p-d'), { onPick: refreshAlts });
  T.flex = new Set(store.get('flex', ['h1', 'conn', 'split']));
  T.altOff = new Set(store.get('altOff', []));
  const date = $('#t-date');
  date.min = E.parisDay();
  date.value = saved?.date && saved.date >= E.parisDay() ? saved.date : E.addDays(E.parisDay(), 7);
  $('#t-from').value = saved?.from || SLOTS.soir[0];
  $('#t-to').value = saved?.to || SLOTS.soir[1];
  const cur = Object.entries(SLOTS).find(([, v]) => v[0] === $('#t-from').value && v[1] === $('#t-to').value)?.[0];
  slotChips($('#t-slots'), cur, k => { $('#t-from').value = SLOTS[k][0]; $('#t-to').value = SLOTS[k][1]; });
  for (const id of ['#t-from', '#t-to']) $(id).addEventListener('input', () => $$('#t-slots [data-slot]').forEach(x => x.setAttribute('aria-pressed', 'false')));
  if (saved?.o) T.po.set(saved.o, true);
  if (saved?.d) T.pd.set(saved.d, true);

  const syncFlex = () => {
    $$('#t-flex [data-flex]').forEach(b => b.setAttribute('aria-pressed', String(T.flex.has(b.dataset.flex))));
    $('#t-extend-note').hidden = !T.flex.has('extend');
    refreshAlts();
  };
  $('#t-flex').addEventListener('click', e => {
    const b = e.target.closest('[data-flex]');
    if (!b) return;
    const k = b.dataset.flex;
    if (T.flex.has(k)) T.flex.delete(k);
    else { T.flex.add(k); if (k === 'h1') T.flex.delete('h2'); if (k === 'h2') T.flex.delete('h1'); }
    store.set('flex', [...T.flex]);
    syncFlex();
  });
  syncFlex();
  $('#t-alts').addEventListener('click', e => {
    const b = e.target.closest('[data-alt]');
    if (!b) return;
    const n = b.dataset.alt;
    if (T.altOff.has(n)) T.altOff.delete(n); else T.altOff.add(n);
    store.set('altOff', [...T.altOff]);
    b.setAttribute('aria-pressed', String(!T.altOff.has(n)));
  });
  $('#t-swap').addEventListener('click', () => { const o = T.po.get(), d = T.pd.get(); T.po.set(d, true); T.pd.set(o, true); refreshAlts(); });
  $('#f-trajet').addEventListener('submit', e => { e.preventDefault(); analyse(); });
  $('#t-recent').addEventListener('click', e => {
    const b = e.target.closest('[data-recent]');
    if (!b) return;
    const [o, d] = JSON.parse(b.dataset.recent);
    T.po.set(o, true); T.pd.set(d, true); refreshAlts();
  });
  drawRecents();
}

function drawRecents() {
  const rec = store.get('recents', []);
  const el = $('#t-recent');
  el.hidden = !rec.length;
  el.innerHTML = rec.map(([o, d]) => `<button type="button" class="chip" data-recent='${esc(JSON.stringify([o, d]))}'>${P(o)} → ${P(d)}</button>`).join('');
}
function pushRecent(o, d) {
  const rec = store.get('recents', []).filter(([a, b]) => !(a === o && b === d));
  rec.unshift([o, d]);
  store.set('recents', rec.slice(0, 4));
  drawRecents();
}

function refreshAlts() {
  const box = $('#t-alts');
  if (!T.flex?.has('alt')) { box.hidden = true; return; }
  const o = T.po.get(), d = T.pd.get();
  const list = [...(o ? E.nearbyStations(o, S.names) : []), ...(d ? E.nearbyStations(d, S.names) : [])];
  box.hidden = false;
  box.innerHTML = list.length
    ? `<p class="note">Gares voisines prises en compte :</p><div class="chips">${list.map(n => `<button type="button" class="chip" data-alt="${esc(n)}" aria-pressed="${!T.altOff.has(n)}">${P(n)}</button>`).join('')}</div>`
    : `<p class="note">Pas de gare voisine connue pour ${o || d ? 'ces gares' : 'l\'instant'}.</p>`;
}

function readQuery() {
  const o = T.po.get(), d = T.pd.get(), date = $('#t-date').value;
  const from = $('#t-from').value || '00:00', to = $('#t-to').value || '23:59';
  const useAlt = T.flex.has('alt');
  const alts = n => (useAlt ? E.nearbyStations(n, S.names).filter(x => !T.altOff.has(x)) : []);
  return {
    o: [o], d: [d], oAlt: o ? alts(o) : [], dAlt: d ? alts(d) : [], date, from, to,
    flexH: T.flex.has('h2') ? 2 : T.flex.has('h1') ? 1 : 0, flexDays: T.flex.has('day') ? 1 : 0,
    allowAlt: useAlt, allowConn: T.flex.has('conn'), allowSplit: T.flex.has('split'), allowExtend: T.flex.has('extend'),
  };
}

let runId = 0;
async function analyse() {
  const out = $('#t-out');
  const q = readQuery();
  if (!q.o[0] || !q.d[0]) { out.innerHTML = banner('warn', 'Choisis une gare de départ et une gare d’arrivée dans la liste proposée.'); return; }
  if (!q.date) { out.innerHTML = banner('warn', 'Indique la date du voyage.'); return; }
  if (q.o[0] === q.d[0]) { out.innerHTML = banner('warn', 'Le départ et l’arrivée sont identiques.'); return; }
  store.set('trajet', { o: q.o[0], d: q.d[0], date: q.date, from: q.from, to: q.to });
  pushRecent(q.o[0], q.d[0]);
  const id = ++runId;
  const today = E.parisDay();
  const J = E.diffDays(q.date, today);
  out.innerHTML = `<div class="board loading"><p class="verdict">Lecture des quotas…</p><div class="big">--:--</div><p class="route">${P(q.o[0])} → ${P(q.d[0])}</p></div>`;
  $('#t-go').disabled = true;
  try {
    const Oall = [...q.o, ...q.oAlt], Dall = [...q.d, ...q.dAlt];
    const needDay = J >= 0 && J <= E.RULES.openDaysBefore;
    const [direct, fromO, toD] = await Promise.all([
      apiRows(`${E.orEq('origine', Oall)} and ${E.orEq('destination', Dall)}`),
      needDay && (q.allowConn || q.allowSplit || q.allowExtend) ? apiRows(E.orEq('origine', Oall), [q.date, q.date]) : [],
      needDay && (q.allowConn || q.allowSplit) ? apiRows(E.orEq('destination', Dall), [q.date, q.date]) : [],
    ]);
    await histReady;
    const odFiles = (await Promise.all(Oall.flatMap(a => Dall.map(b => loadOd(a, b))))).filter(Boolean);
    const odC = E.mergeCounters(odFiles.map(f => f.c));
    const globalC = S.hist.stats?.c || null;
    const plan = E.buildPlan(q, { direct, fromO, toD }, { today, resas: S.resas, odC, globalC });
    if (nuitsReleves() < NUITS_MIN) plan.wait.available = false;
    if (id !== runId) return;
    T.last = { q, plan, direct, odFiles, odC, globalC, today };
    renderTrajet();
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadFares(plan).then(n => { if (n && id === runId) renderTrajet(); });
  } catch (e) {
    if (id === runId) out.innerHTML = errorBanner(e);
    console.error(e);
  } finally {
    if (id === runId) $('#t-go').disabled = false;
  }
}

function trainsOf(legs) { return legs.map(l => l.trains.join('/')).join(' + '); }

const checkBtn = () => {
  const q = T.last?.q;
  const href = q?.o?.[0] && q?.d?.[0] && q.date ? E.sncfConnectLink(q.o[0], q.d[0], q.date, q.from) : SNCF_CONNECT;
  return `<a class="btn ghost" href="${esc(href)}" target="_blank" rel="noopener">Vérifier sur SNCF Connect</a>`;
};
const acts = o => (o.noCheck || (o.actions || []).some(x => x.includes(SNCF_CONNECT)) ? o.actions || [] : [...(o.actions || []), checkBtn()]);

function boardHTML() {
  const { q, plan } = T.last;
  const v = plan.verdict;
  const route = `${P(q.o[0])} → ${P(q.d[0])}`;
  const b = (o) => `<div class="board"><p class="verdict">${o.verdict}</p><div class="big ${o.cls || ''}">${o.big}</div>
    ${o.sub ? `<p class="sub">${o.sub}</p>` : ''}<p class="route">${o.route || route}</p>${o.facts?.length ? `<p class="facts">${o.facts.filter(Boolean).map(f => `<span>${f}</span>`).join('')}</p>` : ''}
    ${o.say ? `<p class="say">${o.say}</p>` : ''}${acts(o).length ? `<div class="actions">${acts(o).join('')}</div>` : ''}</div>`;
  if (v.code === 'passe') return b({ verdict: 'Cette date est passée', big: esc(E.frDay(q.date)), cls: 'date', noCheck: true, say: 'Choisis une date à venir.' });
  if (v.code === 'trop-tot') {
    return b({
      verdict: 'Trop tôt : les places MAX ouvrent à J-30', big: esc(E.frDay(v.openDay)), cls: 'date', noCheck: true,
      facts: [`Voyage le <b>${esc(E.frDayLong(q.date))}</b>`, `dans ${plural(plan.J, 'jour')}`],
      say: 'Le radar ci-dessous montre comment ton créneau se comporte sur les semaines déjà ouvertes : c’est ta meilleure indication pour le jour de l’ouverture.',
      actions: ['<button class="btn" data-act="ics">Me le rappeler</button>'],
    });
  }
  if (v.best) {
    const o = v.best, l0 = o.legs[0], lN = o.legs[o.legs.length - 1];
    const J = E.diffDays(o.date, plan.today);
    const route2 = o.kind === 'extend'
      ? `${P(l0.o)} → ${P(o.getOff)} <small class="muted">(billet jusqu'à ${P(l0.d)})</small>`
      : `${P(l0.o)} → ${P(lN.d)}${o.via ? ` <small>via ${P(o.via)}</small>` : ''}`;
    const closeRate = v.stillOpen != null ? 1 - v.stillOpen : null;
    const share = closeRate == null ? '' : closeRate < 0.05 ? 'moins de 5 %' : closeRate >= 0.95 ? 'plus de 95 %' : `environ ${Math.round(closeRate * 100)} %`;
    const urg = closeRate != null
      ? `À ce stade, ${share} des départs comparables se ferment d’un jour à l’autre. Les données datent du dernier relevé SNCF : vérifie vite sur SNCF Connect.`
      : 'Les données datent du dernier relevé SNCF (une fois par jour) : la place peut être partie entre-temps, vérifie sur SNCF Connect.';
    return b({
      verdict: v.code === 'reserver' ? 'Réserve maintenant'
        : `${v.hasDirect ? 'Rien en direct à 0 € dans ton créneau' : 'Pas de train direct MAX sur ce trajet'}. Meilleure option : ${esc(o.label.toLowerCase())}`,
      big: `${l0.dep}<span class="arr">→ ${o.kind === 'extend' ? E.fmtMin(o.getOffAt) : lN.arr}</span>`,
      route: route2,
      facts: [esc(E.frDay(o.date)), `J-${J}`, `train ${esc(trainsOf(o.legs))}`, esc(E.fmtDur(o.kind === 'extend' ? ((o.getOffAt - l0.depMin + 1440) % 1440) : o.dur)),
        o.slots > 1 ? `<b>${o.slots} réservations</b>` : null],
      say: urg,
      actions: [`<a class="btn" href="${esc(E.sncfConnectLink(l0.o, lN.d, l0.date, l0.dep))}" target="_blank" rel="noopener">Ouvrir SNCF Connect</a>`, '<button class="btn ghost" data-act="booked" data-opt="best">J’ai réservé</button>'],
    });
  }
  const w = plan.wait;
  const tot = w.open + w.closed;
  if (!v.hasDirect && !tot) {
    return b({
      verdict: 'Pas de train direct MAX, ni de combinaison à 0 €', big: '0<span class="arr">option avec tes critères</span>',
      facts: [esc(E.frDay(q.date)), `J-${plan.J}`],
      say: 'Active « Correspondances » et « Gares voisines », élargis le créneau, ou cherche depuis l’onglet Explorer.',
    });
  }
  const est = w.available && w.any != null;
  return b({
    verdict: 'Aucune place à 0 € pour l’instant',
    big: est ? pct(w.any) : `0<span class="arr">sur ${tot}</span>`,
    sub: est ? 'de chances qu’une place s’ouvre dans ton créneau d’ici le départ' : `départ${tot > 1 ? 's' : ''} ouvert${tot > 1 ? 's' : ''} dans ton créneau`,
    facts: [esc(E.frDay(q.date)), `J-${plan.J}`, `créneau ${esc(q.from)}–${esc(q.to)}`],
    say: est
      ? 'Estimation optimiste, calculée sur l’historique du robot : chaque départ est compté séparément.'
      : 'Pas encore assez d’historique pour estimer les réouvertures. Le plan ci-dessous te dit quoi faire en attendant.',
  });
}

function stepsHTML() {
  const { q, plan } = T.last;
  const v = plan.verdict, J = plan.J;
  const dl = Object.fromEntries(plan.deadlines.list.map(d => [d.id, d]));
  const steps = [];
  const conf = `Confirme entre le <b>${esc(E.frDay(dl['confirmation-debut'].day))}</b> et le <b>${esc(E.frDay(dl['confirmation-fin'].day))} à 17 h</b>, sinon la réservation est annulée.`;
  if (v.code === 'trop-tot') {
    steps.push(`Le <b>${esc(E.frDayLong(v.openDay))}</b>, les places MAX du ${esc(E.frDay(q.date))} ouvrent. Regarde SNCF Connect plusieurs fois dans la journée : dans l’open data, une date qui vient d’ouvrir apparaît souvent fermée et ses places n’y sont visibles qu’au relevé du lendemain.`);
    steps.push('Regarde le radar : si ton créneau est souvent fermé ces dernières semaines, prépare un plan B (autre horaire, gare voisine, veille).');
    steps.push('Une fois la date ouverte, relance l’analyse : la stratégie complète apparaîtra.');
  } else if (v.code === 'reserver') {
    steps.push(`Réserve le train <b>${esc(trainsOf(v.best.legs))}</b> sur SNCF Connect maintenant.`);
    steps.push('Appuie sur « J’ai réservé » : ta réservation rejoint ton compteur et tes rappels.');
    steps.push(conf);
  } else if (v.code === 'compromis') {
    steps.push(`Si le compromis te va, réserve maintenant : <b>${esc(v.best.label.toLowerCase())}</b> à ${esc(v.best.legs[0].dep)}${v.best.slots > 1 ? ` (${v.best.slots} réservations dans ton compteur)` : ''}.`);
    steps.push('Ajoute une alerte sur ton créneau idéal (onglet Suivi) : si une place s’y ouvre, tu échanges.');
    steps.push(conf);
  } else if (v.code === 'rien') {
    const w = plan.wait;
    const fresh = J >= 28 && !w.open && w.closed > 0;
    const likely = w.available && w.any != null && w.any >= 0.6;
    if (fresh) steps.push('Cette date vient d’ouvrir. Dans l’open data, une nouvelle date apparaît souvent fermée et ses places n’y sont visibles qu’au relevé du lendemain : regarde SNCF Connect aujourd’hui, plusieurs fois.');
    if (likely && J > E.RULES.freeRefundDaysBefore) {
      steps.push(`Bonne chance qu’une place s’ouvre (${pct(w.any)}) : active une alerte sur ce trajet (onglet Suivi) et attends.`);
      steps.push(`Si rien n’a bougé le <b>${esc(E.frDay(E.addDays(dl.remboursement.day, -1)))}</b>, prends un billet -30 % : il reste annulable sans frais jusqu’au <b>${esc(E.frDay(dl.remboursement.day))}</b> inclus.`);
    } else if (J > E.RULES.freeRefundDaysBefore) {
      steps.push(`Roue de secours : prends dès maintenant un billet -30 % (MAX AVANTAGE). Il reste annulable sans frais jusqu’au <b>${esc(E.frDay(dl.remboursement.day))}</b> inclus, et les prix montent en général à l’approche du départ.`);
      steps.push('Mets une alerte sur ce trajet (onglet Suivi) : si une place à 0 € s’ouvre, réserve-la puis annule le billet -30 %.');
      steps.push(`Le <b>${esc(E.frDay(dl.remboursement.day))}</b>, décide : garde le billet -30 % si rien n’a rouvert${plan.wait.available && plan.wait.any != null ? ` (chance estimée de réouverture : ${pct(plan.wait.any)})` : ''}.`);
    } else {
      steps.push('Regarde les options partielles ou payantes ci-dessous : un billet -30 % n’est plus remboursable sans frais à moins de 7 jours (19 € sur TGV INOUI).');
      steps.push('Active une alerte : le robot te prévient chaque matin si une place se libère.');
    }
    steps.push(`La veille (<b>${esc(E.frDay(dl['confirmation-fin'].day))}</b>) vers 17 h, regarde SNCF Connect : les réservations non confirmées sont annulées à ce moment-là.`);
  }
  if (!steps.length) return '';
  return `<div class="card"><h2>Ton plan</h2><ol class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
}

function optHTML(o, key, top) {
  const { q, plan } = T.last;
  const fromM = E.toMin(q.from);
  // prix des tronçons payants : fourchette de la grille officielle SNCF (Tarif Avantage), sinon plafond Carte Avantage
  const fareOf = l => T.fares?.get(`${l.o}|${l.d}`) || null;
  const rng = l => { const f = fareOf(l); if (f) return [f.min, f.max]; const c = E.capAvantage(l); return c != null ? [null, c] : null; };
  const fmtR = r => r[0] != null ? `${E.euros(r[0])}–${E.euros(r[1])} €` : `${E.euros(r[1])} € max`;
  const ranges = o.legs.filter(l => !l.ok).map(rng);
  const sumR = ranges.length && ranges.every(Boolean) ? [ranges.every(r => r[0] != null) ? ranges.reduce((a, r) => a + r[0], 0) : null, ranges.reduce((a, r) => a + r[1], 0)] : null;
  const price = o.free ? '<span class="price free">0 €</span>'
    : o.kind === 'mixed' ? `<span class="price part">0 € + ${sumR ? fmtR(sumR) : 'payant'}</span>`
    : `<span class="price paid">${sumR ? fmtR(sumR) : 'payant'}</span>`;
  // le lien ouvre SNCF Connect une heure plus tôt, pour voir aussi les trains voisins (0 €, OUIGO moins chers)
  const paidTxt = l => { const f = fareOf(l), c = E.capAvantage(l); return `, payant : ${f ? `${fmtR([f.min, f.max])} ${f.kind === 'ouigo' ? 'en OUIGO (sans réduction)' : 'avec ta Carte Avantage'}, selon la grille SNCF` : c != null ? `${c} € max avec la Carte Avantage` : 'prix sur SNCF Connect'} · <a href="${esc(E.sncfConnectLink(l.o, l.d, l.date, E.fmtMin(Math.max(0, E.toMin(l.dep) - 60))))}" target="_blank" rel="noopener">comparer les prix</a>`; };
  const l0 = o.legs[0], lN = o.legs[o.legs.length - 1];
  const legs = o.kind === 'extend'
    ? `<li><span class="st ok"></span><span><b>${l0.dep}</b> ${P(l0.o)} → descente à ${P(o.getOff)} <b>${E.fmtMin(o.getOffAt)}</b></span></li><li class="via">Billet jusqu'à ${P(l0.d)} (${l0.arr}), train ${esc(l0.trains.join('/'))}</li>`
    : o.legs.map((l, i) => `${i ? `<li class="via">${o.kind === 'split' ? 'Tu restes dans le train' : `Changement à ${P(l.o)}${o.changeStation ? ' (autre gare)' : ''}, attente ${E.fmtDur(o.wait)}`}</li>` : ''}
      <li><span class="st ${l.ok ? 'ok' : 'no'}"></span><span><b>${l.dep}</b> ${P(l.o)} → ${P(l.d)} <span class="muted">${l.arr}, train ${esc(l.trains.join('/'))}${l.ok ? '' : paidTxt(l)}</span></span></li>`).join('');
  const flags = [];
  // solidité : le départ ouvert le plus fragile de l'option, d'après l'historique
  const Oq = [...q.o, ...q.oAlt], Dq = [...q.d, ...q.dAlt];
  const sol = o.legs.filter(l => l.ok).map(l => E.solidity(l, plan.today, Oq.includes(l.o) && Dq.includes(l.d) ? T.last.odC : null, T.last.globalC))
    .filter(Boolean).sort((a, b) => b.close - a.close)[0];
  // tant que l'historique est court, on dit sur combien de nuits de relevés l'estimation repose
  const nuits = (S.hist.meta?.snaps || []).filter(s => s.counted).length;
  if (sol) flags.push(`<span class="flag${sol.level === 'fragile' ? ' warn' : ''}">${esc(sol.label)}${nuits < 14 ? ` (estimé sur ${plural(nuits, 'nuit')})` : ''}</span>`);
  if (o.dayShift) flags.push(`<span class="flag">${o.dayShift > 0 ? 'le lendemain' : 'la veille'} (${esc(E.frDay(o.date))})</span>`);
  if (o.dev) flags.push(`<span class="flag">${o.depMin < fromM ? 'plus tôt' : 'plus tard'} que ton créneau de ${E.fmtDur(o.dev)}</span>`);
  if (o.slots > 1) flags.push(`<span class="flag">${o.slots} réservations au compteur</span>`);
  if (o.alt) flags.push('<span class="flag">gare voisine</span>');
  if (o.changeStation) flags.push('<span class="flag warn">changement de gare</span>');
  if (o.kind === 'connection') flags.push('<span class="flag warn">billets séparés : pas de garantie en cas de retard</span>');
  if (o.kind === 'extend') flags.push('<span class="flag warn">vérifie les conditions SNCF</span>');
  if (plan.refDur && o.dur - plan.refDur > 20 && o.kind !== 'extend') flags.push(`<span class="flag">+${E.fmtDur(o.dur - plan.refDur)} de trajet</span>`);
  if (o.date === plan.today) flags.push('<span class="flag">aujourd’hui</span>');
  return `<div class="opt${top ? ' best' : ''}">
    <div class="opt-head"><div><div class="opt-time">${l0.dep}<span class="d">→ ${o.kind === 'extend' ? E.fmtMin(o.getOffAt) : lN.arr}</span></div><span class="kind">${esc(o.label)}</span></div>${price}</div>
    <ul class="legs">${legs}</ul>${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
    <button class="btn quiet small" data-act="booked" data-opt="${key}">J’ai réservé</button></div>`;
}

function optionsHTML() {
  const { plan, q, direct } = T.last;
  const parts = [];
  // jauge du jour, sur l'échelle du simulateur SNCF (directs du trajet cherché, relevé du matin)
  const g = E.dayGauge((direct || []).filter(x => x.date === q.date && q.o.includes(x.o) && q.d.includes(x.d)));
  if (g) parts.push(`<div class="card"><p class="small" style="margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill ${{ places: 'confirmee', dernieres: 'a-confirmer', max: 'urgent' }[g.level]}">${g.label}</span><span>${g.open} direct${g.open > 1 ? 's' : ''} sur ${g.total} à 0 € ce jour-là, au relevé du matin</span></p></div>`);
  if (plan.free.length) parts.push(`<div class="card"><h2>${plural(plan.free.length, 'option')} à 0 € <small>${plan.free.length > 1 ? 'disponibles' : 'disponible'} à l’heure d’import${S.apiMeta?.at ? ` (${E.fmtMin(E.parisMinutes(new Date(S.apiMeta.at)))})` : ''}</small></h2><div class="opts">${plan.free.map((o, i) => optHTML(o, `free:${i}`, i === 0)).join('')}</div></div>`);
  else if (plan.verdict.code !== 'trop-tot' && plan.verdict.code !== 'passe') parts.push(`<div class="card"><h2>Options à 0 €</h2><p class="lead">Aucune avec tes critères. Élargis ce que tu acceptes (horaires, gares voisines, correspondances) ou regarde le radar pour un autre jour.</p></div>`);
  if (plan.partial.length) parts.push(`<details class="card more"><summary>En partie gratuit (${plan.partial.length})</summary><div class="opts">${plan.partial.map((o, i) => optHTML(o, `partial:${i}`)).join('')}</div></details>`);
  if (plan.paid.length) parts.push(`<details class="card more"><summary>Payant, au prix Carte Avantage (${plan.paid.length})</summary><p class="small">FloRoBot ne connaît que les plafonds Carte Avantage des TGV INOUI et Intercités. Il ne voit ni les prix réels, ni les OUIGO, souvent moins chers : compare sur SNCF Connect.</p><div class="opts">${plan.paid.map((o, i) => optHTML(o, `paid:${i}`)).join('')}</div></details>`);
  return parts.join('');
}

function deadlinesHTML() {
  const { plan } = T.last;
  if (plan.J < 0) return '';
  const list = plan.deadlines.list;
  const next = list.find(d => !d.past);
  return `<div class="card"><h2>Les échéances</h2><ul class="dl">${list.map(d => `<li class="${d.past ? 'past' : ''}${d === next ? ' next' : ''}">
      <div class="when">${esc(E.frShort(d.day))}<small>${esc(E.frDay(d.day).split(' ')[0])}${d.time && d.time !== '00:00' && d.time !== '23:59' ? ` ${d.time}` : ''}</small></div>
      <div>${esc(d.label)}${d.hypothesis ? ' <span class="tag-h">à tester</span>' : ''}</div></li>`).join('')}</ul>
    <div class="actions"><button class="btn quiet small" data-act="ics">Ajouter les rappels à mon agenda</button></div></div>`;
}

function waitHTML() {
  const { plan, q } = T.last;
  if (plan.J < 0 || plan.J > E.RULES.openDaysBefore || plan.verdict.code === 'reserver') return '';
  const w = plan.wait;
  if (!w.closed) return '';
  const title = plan.verdict.code === 'compromis' ? 'Attendre ton créneau idéal ?' : 'Attendre ou payer ?';
  const meta = S.hist.meta;
  if (!w.available) {
    const since = meta ? `Le robot collecte depuis le ${esc(E.frDayLong(meta.first))} (${plural(meta.snaps.length, 'relevé')}).` : 'Le robot n’a pas encore fait son premier relevé.';
    return `<div class="card"><h2>${title}</h2><p class="lead">${w.closed} départ${w.closed > 1 ? 's' : ''} fermé${w.closed > 1 ? 's' : ''} dans ton créneau. ${since} Les chances de réouverture s’afficheront après ${NUITS_MIN} nuits de relevés (${plural(nuitsReleves(), 'nuit')} pour l’instant).</p></div>`;
  }
  const rows = w.perDep.slice(0, 6).map(r => `<div class="bar"><span class="lab">${r.dep.dep} ${r.dep.trains.length ? `<small class="muted">${esc(r.dep.trains[0])}</small>` : ''}</span><span class="track"><span class="fill" style="width:${Math.max(2, Math.round(r.p * 100))}%"></span></span><span class="v">${pct(r.p)}</span></div>`).join('');
  const nMin = Math.min(...w.perDep.map(r => r.nRoute));
  let advice;
  if (w.any == null) advice = '';
  else if (w.any < 0.2) advice = plan.J > 7 ? 'Peu probable : prends le billet -30 % tant qu’il est remboursable, et garde l’alerte au cas où.' : 'Peu probable : n’attends pas une réouverture, vise une autre option.';
  else if (w.any < 0.5) advice = 'Possible, sans plus : roue de secours conseillée, alerte activée.';
  else advice = 'Assez probable : tu peux attendre, alerte activée, en gardant un œil sur les échéances.';
  return `<div class="card"><h2>${title}</h2>
    <p class="lead">Chance qu’un départ fermé rouvre d’ici le jour du départ, selon l’historique du ${esc(q.from)}–${esc(q.to)} sur ce trajet :</p>
    <div class="bars">${rows}</div>
    ${advice ? `<p class="note"><b>${esc(advice)}</b></p>` : ''}
    <p class="note">Fiabilité ${E.reliability(nMin)} (${plural(nMin, 'observation')} sur ce trajet, complétées par l’ensemble du réseau). Chaque départ est estimé séparément : la chance « au moins un » est optimiste.</p></div>`;
}

function renderTrajet() {
  const out = $('#t-out');
  const { plan } = T.last;
  const parts = [boardHTML()];
  for (const w of plan.warnings) parts.push(banner('warn', esc(w.text)));
  parts.push(stepsHTML(), optionsHTML(), waitHTML(), deadlinesHTML());
  parts.push(`<div class="seg" role="tablist"><button type="button" role="tab" data-viz="radar" aria-selected="${(T.viz || 'radar') === 'radar'}">Radar</button><button type="button" role="tab" data-viz="hist" aria-selected="${T.viz === 'hist'}">Historique</button><button type="button" role="tab" data-viz="year" aria-selected="${T.viz === 'year'}">Année</button></div><div id="t-viz" class="tab-page"></div>`);
  out.innerHTML = typo(parts.filter(Boolean).join(''));
  drawViz();
}

function drawViz() {
  const el = $('#t-viz');
  if (!el) return;
  const v = T.viz || 'radar';
  el.innerHTML = typo(v === 'radar' ? radarPanel() : v === 'year' ? yearPanel() : histPanel());
  $$('.seg [data-viz]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.viz === (T.viz || 'radar'))));
}

function onTrajetClick(e) {
  const t = e.target.closest('[data-act],[data-viz],[data-day],[data-ymetric],[data-yday]');
  if (!t || !T.last) return;
  if (t.dataset.viz) { T.viz = t.dataset.viz; drawViz(); return; }
  if (t.dataset.ymetric) { T.yearMetric = t.dataset.ymetric; drawViz(); return; }
  if (t.dataset.yday) { showYearDay(t.dataset.yday); return; }
  if (t.dataset.day) { showDay(t.dataset.day); return; }
  if (t.dataset.act === 'booked') {
    const [grp, i] = t.dataset.opt === 'best' ? ['best'] : t.dataset.opt.split(':');
    const o = grp === 'best' ? T.last.plan.verdict.best : T.last.plan[grp][+i];
    if (!o) return;
    for (const l of o.legs) addResa({ o: l.o, d: o.kind === 'extend' ? l.d : l.d, date: l.date, dep: l.dep, arr: l.arr, train: l.trains.join('/'), tarif: l.ok ? 'max' : 'avantage' });
    toast(o.legs.length > 1 ? `${o.legs.length} réservations ajoutées à ton compteur` : 'Réservation ajoutée à ton compteur');
    return;
  }
  if (t.dataset.act === 'ics') icsForTrip();
}

function icsForTrip() {
  const { q, plan } = T.last;
  const route = `${E.pretty(q.o[0])} → ${E.pretty(q.d[0])}`;
  const ev = [];
  const mk = (id, day, time, title, desc, alarm = 0) => ev.push({ uid: `${id}-${q.date}-${E.slugify(q.o[0])}-${E.slugify(q.d[0])}@aiguillage`, start: E.parisToUTC(day, time), title, description: desc, alarm });
  for (const d of plan.deadlines.list) {
    if (d.past) continue;
    if (d.id === 'ouverture') mk('ouverture', d.day, '07:00', `Ouverture MAX : ${route} du ${E.frDay(q.date)}`, 'Les places MAX JEUNE de ce jour ouvrent à J-30. Relance l’app.', 0);
    if (d.id === 'remboursement') mk('j7', d.day, '18:00', `Dernier jour pour annuler un billet -30 % sans frais (${route})`, 'Après aujourd’hui, l’annulation coûte 19 € sur TGV INOUI.', 0);
    if (d.id === 'confirmation-debut') mk('confirmer', d.day, '09:00', `Confirmer ma résa MAX ${route}`, 'Espace MAX : confirme ton voyage (jusqu’à la veille 17 h).', 0);
    if (d.id === 'confirmation-fin') mk('derniere-limite', d.day, '15:00', `Dernière limite 17 h : confirmer ${route}`, 'Sans confirmation avant 17 h, la réservation est annulée automatiquement.', 0);
    if (d.id === 'liberations') mk('liberations', d.day, '17:05', `Places libérées ? ${route} de demain`, 'Les réservations non confirmées viennent d’être annulées : regarde SNCF Connect.', 0);
  }
  if (!ev.length) { toast('Aucune échéance à venir pour ce voyage'); return; }
  download(`aiguillage-${q.date}.ics`, E.buildICS(ev));
}

/* ---------- radar ---------- */

function radarPanel() {
  const { q, direct, today } = T.last;
  const O = new Set([...q.o, ...(q.allowAlt ? q.oAlt : [])]), D = new Set([...q.d, ...(q.allowAlt ? q.dAlt : [])]);
  const deps = direct.filter(x => O.has(x.o) && D.has(x.d) && x.date >= today);
  if (!deps.length) return `<div class="card empty"><b>Aucun train MAX sur ce trajet</b>Ce trajet n’apparaît pas dans le jeu de données MAX des 30 prochains jours. Essaie les gares voisines ou une correspondance.</div>`;
  const st = E.radarStats(deps, today);
  T.radarDeps = deps;
  const wd = E.isoWeekday(q.date);
  return `<div class="card radar"><h2>Radar des quotas <small>${esc(E.frShort(today))} → ${esc(E.frShort(E.addDays(today, 30)))}</small></h2>
    <p class="legend"><span><i class="ok"></i>départ ouvert à 0 €</span><span><i class="no"></i>fermé</span><span><i class="band"></i>ton créneau</span></p>
    ${radarSVG(deps, today, q)}
    <p class="note">Touche une ligne pour voir les départs du jour.</p>
    <div id="t-daydetail"></div></div>
    <div class="card"><h2>Ce que dit la fenêtre</h2><ul class="insights">${st.insights.map(i => `<li class="${i.tone}">${esc(i.text)}</li>`).join('')}</ul></div>
    <div class="card"><h2>Jour × créneau</h2><p class="lead small">Départs ouverts sur départs proposés, dans les 30 prochains jours. Plus la case est foncée, plus c’est ouvert.</p>${heatHTML(st, wd, q)}</div>
    ${weekdayHTML(st, wd, q)}`;
}

function radarSVG(deps, today, q) {
  const W = Math.min(560, Math.max(300, ($('#t-out')?.clientWidth || 360) - 34));
  const L = 62, R = 6, T0 = 20, rowH = 20, n = 31;
  const x0 = 270, x1 = 1440;
  const X = m => L + (Math.max(x0, Math.min(x1, m)) - x0) / (x1 - x0) * (W - L - R);
  const H = T0 + n * rowH + 4;
  const byDay = new Map();
  for (const x of deps) { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); }
  const fx = E.toMin(q.from), tx = Math.min(1439, E.toMin(q.to));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Départs ouverts et fermés sur les 31 prochains jours">`;
  s += `<rect class="band" x="${X(fx)}" y="${T0 - 2}" width="${Math.max(2, X(tx) - X(fx))}" height="${n * rowH + 4}" rx="4"/>`;
  for (const h of [6, 9, 12, 15, 18, 21]) s += `<line class="gl" x1="${X(h * 60)}" x2="${X(h * 60)}" y1="${T0 - 4}" y2="${T0 + n * rowH}"/><text x="${X(h * 60)}" y="12" font-size="11" text-anchor="middle">${h} h</text>`;
  for (let k = 0; k < n; k++) {
    const date = E.addDays(today, k), wd = E.isoWeekday(date), y = T0 + k * rowH;
    const sel = date === q.date;
    s += `<g class="${wd >= 6 ? 'we' : ''}"><rect class="rowhit${sel ? ' sel' : ''}" data-day="${date}" x="0" y="${y}" width="${W}" height="${rowH}" rx="4"/>`;
    s += `<text class="day" x="2" y="${y + 14}" font-size="12"${sel ? ' font-weight="700"' : ''}>${E.WEEKDAYS[wd - 1]} ${E.frShort(date)}</text>`;
    for (const x of (byDay.get(date) || [])) {
      const cx = X(x.depMin).toFixed(1), cy = y + rowH / 2;
      s += x.ok ? `<circle class="dot-ok" cx="${cx}" cy="${cy}" r="4.6"/>` : `<circle class="dot-no" cx="${cx}" cy="${cy}" r="3.1"/>`;
    }
    s += '</g>';
  }
  return s + '</svg>';
}

function showDay(date) {
  $$('.radar .rowhit').forEach(r => r.classList.toggle('sel', r.dataset.day === date));
  const list = (T.radarDeps || []).filter(x => x.date === date);
  const el = $('#t-daydetail');
  if (!el) return;
  const J = E.diffDays(date, T.last.today);
  el.innerHTML = typo(`<div class="daydetail"><h3 class="section-title">${esc(E.frDayLong(date))} <small class="muted">J-${J}</small></h3>
    <ul class="deplist">${list.map(x => `<li><span class="st ${x.ok ? 'ok' : 'no'}"></span><span class="t">${x.dep} <small class="muted">${x.arr}</small></span><span class="small">${P(x.o)} → ${P(x.d)}</span><span class="small muted">${esc(x.trains.join('/'))}</span></li>`).join('')}</ul>
    <div class="actions"><button class="btn quiet small" data-act="pickday" data-date="${date}">Analyser ce jour</button></div></div>`);
  $('[data-act="pickday"]', el).addEventListener('click', () => { $('#t-date').value = date; analyse(); });
}

function heatHTML(st, wdMe, q) {
  const cell = new Map(st.cells.map(c => [`${c.wd}|${c.sl}`, c]));
  const lvl = r => (r === 0 ? 0 : r < 0.2 ? 1 : r < 0.4 ? 2 : r < 0.6 ? 3 : r < 0.8 ? 4 : 5);
  const fx = E.toMin(q.from), tx = E.toMin(q.to);
  const mine = sl => E.SLOT_BOUNDS[sl] <= tx && E.SLOT_BOUNDS[sl + 1] > fx;
  const short = ['< 9 h', '9–12', '12–15', '15–17', '17–20', '> 20 h'];
  const head = `<tr><th></th>${short.map(l => `<th scope="col">${esc(l)}</th>`).join('')}</tr>`;
  const rows = E.WEEKDAYS.map((w, i) => `<tr><th scope="row">${w}</th>${E.SLOT_LABELS.map((_, sl) => {
    const c = cell.get(`${i + 1}|${sl}`);
    const me = i + 1 === wdMe && mine(sl) ? ' me' : '';
    if (!c) return `<td class="empty${me}">–</td>`;
    return `<td class="l${lvl(c.r)}${me}" title="${c.o} ouverts sur ${c.t}">${c.o}/${c.t}</td>`;
  }).join('')}</tr>`).join('');
  return `<table class="heat">${head}${rows}</table><p class="note">Cases encadrées : ton jour et ton créneau.</p>`;
}

function weekdayHTML(st, wd, q) {
  const fx = E.toMin(q.from), tx = E.toMin(q.to);
  const rows = [];
  const days = [...new Set(T.radarDeps.filter(x => E.isoWeekday(x.date) === wd).map(x => x.date))].sort();
  for (const date of days) {
    const list = T.radarDeps.filter(x => x.date === date && x.depMin >= fx && x.depMin <= tx);
    if (!list.length) continue;
    const o = list.filter(x => x.ok).length;
    rows.push({ date, J: E.diffDays(date, T.last.today), o, t: list.length });
  }
  if (rows.length < 2) return '';
  return `<div class="card"><h2>Ton créneau, semaine après semaine</h2>
    <p class="lead small">Les ${esc(E.WEEKDAYS_LONG[wd - 1])}s de ${esc(q.from)} à ${esc(q.to)}, du plus proche au plus lointain. Si les dates lointaines sont ouvertes et les proches fermées, les places partent vite : réserve dès l’ouverture.</p>
    <div class="bars">${rows.map(r => `<div class="bar${r.date === q.date ? ' me' : ''}"><span class="lab">${esc(E.frShort(r.date))} <small class="muted">J-${r.J}</small></span><span class="track"><span class="fill" style="width:${r.t ? Math.max(2, Math.round(r.o / r.t * 100)) : 0}%"></span></span><span class="v">${r.o}/${r.t}</span></div>`).join('')}</div></div>`;
}

/* ---------- historique ---------- */

function histPanel() {
  const { q, odFiles, odC, globalC, today } = T.last;
  const meta = S.hist.meta;
  if (!meta) return `<div class="card empty"><b>Le robot n’a pas encore fait de relevé</b>Il passe chaque matin après la publication SNCF. L’historique des quotas apparaîtra ici dès le premier passage.</div>`;
  if (!odFiles.length) return `<div class="card empty"><b>Pas encore d’historique pour ce trajet</b>Le robot relève tout le réseau depuis le ${esc(E.frDayLong(meta.first))}, mais ce trajet n’y figure pas (aucun train MAX direct).</div>`;
  const fx = E.toMin(q.from), tx = Math.min(1439, E.toMin(q.to));
  const wd = E.isoWeekday(q.date), sl = E.slotOf((fx + tx) / 2);
  const snaps = meta.snaps || [];
  const target = E.fillCurve(odFiles, snaps, q.date, fx, tx);
  const prev = [];
  for (let k = 1; k <= 3; k++) {
    const d = E.addDays(q.date, -7 * k);
    const c = E.fillCurve(odFiles, snaps, d, fx, tx);
    if (c.length >= 2) prev.push({ date: d, c });
  }
  const parts = [];
  parts.push(`<div class="card"><h2>Comment ton créneau se remplit</h2>
    <p class="lead small">Départs ouverts entre ${esc(q.from)} et ${esc(q.to)}, relevé après relevé, du plus loin (J-30) au jour du départ.</p>
    ${curveSVG(target, prev)}
    <p class="note">Historique depuis le ${esc(E.frDayLong(meta.first))} : ${plural(snaps.length, 'relevé')}.${target.length < 2 ? ' Ta date n’a pas encore assez de relevés pour tracer une courbe.' : ''}</p></div>`);
  if (E.hasHistory(odC, globalC) && nuitsReleves() >= NUITS_MIN) {
    const cur = E.bucketOf(Math.max(0, E.diffDays(q.date, today) - 1));
    const rows = [5, 4, 3, 2, 1, 0].map(b => {
      const r = E.transitionRates(odC, globalC, wd, sl, b);
      return `<tr class="${b === cur ? 'me' : ''}"><td>${esc(E.BUCKET_LABELS[b])}</td><td>${pct(r.reopen)}</td><td>${pct(r.close)}</td><td>${E.reliability(r.nFine)} <small class="muted">(${r.nFine})</small></td></tr>`;
    }).join('');
    parts.push(`<div class="card"><h2>D’un jour à l’autre</h2>
      <p class="lead small">Pour un départ du ${esc(E.WEEKDAYS_LONG[wd - 1])} ${esc(E.SLOT_LABELS[sl])} sur ce trajet : chance qu’il change d’état entre deux relevés.</p>
      <table class="probs"><thead><tr><th>À l'approche</th><th>Fermé qui rouvre</th><th>Ouvert qui ferme</th><th>Fiabilité</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">Ligne en gras : là où tu en es. Quand les données manquent pour ce créneau précis, le calcul s’appuie sur tout le trajet puis sur le réseau entier.</p></div>`);
  }
  const deps = E.departuresOf(odFiles, q.date).filter(x => E.toMin(x.dep) >= fx && E.toMin(x.dep) <= tx);
  if (deps.length) {
    const lastI = snaps.length ? snaps[snaps.length - 1].i : 0;
    const firstI = Math.max(0, lastI - 30);
    const row = x => {
      let cells = '';
      for (let i = firstI; i <= lastI; i++) {
        const k = i - x.first, ch = k >= 0 && k < x.states.length ? x.states[k] : '';
        cells += `<i class="${ch === '1' ? 'o' : ch === '0' ? 'c' : 'a'}"></i>`;
      }
      const last = x.states[x.states.length - 1];
      return `<div class="strip"><span><b>${x.dep}</b></span><span class="cells">${cells}</span><span class="now">${last === '1' ? 'ouvert' : last === '0' ? 'fermé' : '—'}</span></div>`;
    };
    parts.push(`<div class="card"><h2>Tes départs, relevé par relevé</h2>
      <p class="legend"><span><i class="ok"></i>ouvert</span><span><i class="no"></i>fermé</span><span>un carré par relevé, le plus récent à droite</span></p>
      <div class="strips">${deps.map(row).join('')}</div></div>`);
  }
  return parts.join('');
}

function curveSVG(target, prev) {
  const series = [...prev.map(p => ({ cls: 's0', pts: p.c, label: E.frShort(p.date) })), { cls: 's1', pts: target, label: 'ta date' }].filter(s => s.pts.length);
  if (!series.length) return '<p class="muted small">Pas encore de points à tracer.</p>';
  const W = Math.min(560, Math.max(300, ($('#t-out')?.clientWidth || 360) - 34)), H = 190, L = 30, R = 46, T0 = 10, B = 24;
  const maxY = Math.max(1, ...series.flatMap(s => s.pts.map(p => p.total)));
  const X = J => L + (30 - Math.max(0, Math.min(30, J))) / 30 * (W - L - R);
  const Y = v => T0 + (1 - v / maxY) * (H - T0 - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du nombre de départs ouverts">`;
  const ticks = maxY <= 5 ? Array.from({ length: maxY + 1 }, (_, i) => i) : [0, Math.round(maxY / 2), maxY];
  for (const t of ticks) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`;
  for (const J of [30, 21, 14, 7, 0]) s += `<text x="${X(J)}" y="${H - 6}" text-anchor="middle">J-${J}</text>`;
  for (const se of series) {
    const pts = se.pts.slice().sort((a, b) => b.J - a.J);
    s += `<polyline class="${se.cls}" points="${pts.map(p => `${X(p.J).toFixed(1)},${Y(p.open).toFixed(1)}`).join(' ')}"/>`;
    const last = pts[pts.length - 1];
    if (se.cls === 's1') for (const p of pts) s += `<circle class="s1p" cx="${X(p.J).toFixed(1)}" cy="${Y(p.open).toFixed(1)}" r="3.5"><title>J-${p.J} : ${p.open} ouverts sur ${p.total}</title></circle>`;
    s += `<text class="${se.cls}t" x="${X(last.J) + 5}" y="${Y(last.open) + 4}">${esc(se.label)}</text>`;
  }
  return `<p class="legend"><span><i class="line" style="background:var(--accent)"></i>ta date</span>${prev.length ? `<span><i class="line" style="background:var(--closed)"></i>mêmes jours, semaines précédentes</span>` : ''}</p><div class="curve">${s}</svg></div>`;
}

/* ---------- bilan à l'année ---------- */

const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = ym => MONTH_FMT.format(new Date(E.parseDay(ym + '-01')));
const METRIC_HELP = {
  ever: 'Part des départs de ton créneau ouverts à 0 € au moins une fois avant le départ.',
  open: 'Part des départs ouverts au premier relevé complet après l’ouverture des ventes (J-29).',
  j7: 'Part des départs encore ouverts une semaine avant le départ.',
  j1: 'Part des départs ouverts la veille du départ.',
};
const lvl = r => (r == null ? 'none' : r === 0 ? 'l0' : r < 0.2 ? 'l1' : r < 0.4 ? 'l2' : r < 0.6 ? 'l3' : r < 0.8 ? 'l4' : 'l5');

function yearPanel() {
  const { q, odFiles, today } = T.last;
  const meta = S.hist.meta;
  if (!meta) return `<div class="card empty"><b>Le robot n’a pas encore fait de relevé</b>Le bilan à l’année se remplira chaque matin dès son premier passage.</div>`;
  if (!odFiles.length) return `<div class="card empty"><b>Pas encore d’historique pour ce trajet</b>Aucun train MAX direct sur ce trajet dans les relevés du robot.</div>`;
  const fx = E.toMin(q.from), tx = Math.min(1439, E.toMin(q.to));
  const series = E.yearSeries(odFiles, meta.snaps, fx, tx, today);
  T.yearSeries = series;
  const metric = T.yearMetric || 'ever';
  const done = series.filter(a => !a.partial);
  const parts = [];
  const chips = Object.entries(E.YEAR_METRICS).map(([k, m]) => `<button type="button" class="chip" data-ymetric="${k}" aria-pressed="${k === metric}">${m.label}</button>`).join('');
  parts.push(`<div class="card"><h2>Bilan à l’année <small>${esc(q.from)}–${esc(q.to)}</small></h2>
    <div class="chips">${chips}</div>
    <p class="lead small" style="margin-top:10px">${METRIC_HELP[metric]}</p>
    ${done.length < 7 ? banner('info', `Le bilan se construit : historique depuis le ${esc(E.frDayLong(meta.first))}. Chaque date passée s’ajoute ici pour toujours ; les dates à venir sont en pointillés.`) : ''}
    ${calendarHTML(series, metric, today)}
    <p class="legend" style="margin-top:10px"><span>0 %</span>${[0, 1, 2, 3, 4, 5].map(i => `<i class="cal-key l${i}"></i>`).join('')}<span>100 %</span><span><i class="cal-key partial"></i>à venir</span></p>
    <p class="note">Touche un jour pour le détail.</p><div id="y-detail"></div></div>`);
  const byMonth = E.groupRates(series, metric, a => a.date.slice(0, 7));
  const netMonth = networkMonths(metric);
  if (byMonth.size) {
    parts.push(`<div class="card"><h2>Par mois</h2><div class="bars">${[...byMonth.entries()].map(([ym, [n, o]]) => {
      const r = n ? o / n : 0, net = netMonth.get(ym);
      return `<div class="bar"><span class="lab">${esc(monthLabel(ym))}</span><span class="track"><span class="fill" style="width:${Math.max(2, Math.round(r * 100))}%"></span></span><span class="v">${pct(r)}</span></div>${net != null ? `<div class="bar sub"><span class="lab small muted">réseau</span><span class="track"><span class="fill net" style="width:${Math.max(2, Math.round(net * 100))}%"></span></span><span class="v muted">${pct(net)}</span></div>` : ''}`;
    }).join('')}</div><p class="note">Dates passées seulement, pondérées par le nombre de départs.</p></div>`);
    const byWd = E.groupRates(series, metric, a => E.isoWeekday(a.date));
    parts.push(`<div class="card"><h2>Par jour de semaine</h2><div class="bars">${[1, 2, 3, 4, 5, 6, 7].filter(w => byWd.has(w)).map(w => {
      const [n, o] = byWd.get(w), r = n ? o / n : 0;
      return `<div class="bar${w === E.isoWeekday(q.date) ? ' me' : ''}"><span class="lab">${E.WEEKDAYS_LONG[w - 1]}</span><span class="track"><span class="fill" style="width:${Math.max(2, Math.round(r * 100))}%"></span></span><span class="v">${o}/${n}</span></div>`;
    }).join('')}</div></div>`);
  }
  parts.push(networkCurveHTML());
  return parts.join('');
}

function calendarHTML(series, metric, today) {
  if (!series.length) return '<p class="muted small">Aucun départ dans ce créneau pour l’instant.</p>';
  const by = new Map(series.map(a => [a.date, a]));
  const first = series[0].date.slice(0, 7), last = series[series.length - 1].date.slice(0, 7);
  const months = [];
  for (let ym = first; ym <= last; ym = E.addDays(ym + '-01', 32).slice(0, 7)) months.push(ym);
  return `<div class="months">${months.map(ym => {
    const d1 = ym + '-01', offset = E.isoWeekday(d1) - 1;
    const days = E.diffDays(E.addDays(E.addDays(d1, 32).slice(0, 7) + '-01', 0), d1);
    let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(w => `<span class="wd">${w}</span>`).join('') + '<span class="blank"></span>'.repeat(offset);
    for (let k = 0; k < days; k++) {
      const date = E.addDays(d1, k), a = by.get(date);
      const r = a ? E.yearRate(a, metric) : null;
      const cls = `d ${a ? lvl(r) : 'none'}${a && a.partial ? ' partial' : ''}${date === today ? ' today' : ''}`;
      cells += a ? `<button type="button" class="${cls}" data-yday="${date}" title="${esc(E.frDay(date))}${r != null ? ` : ${Math.round(r * 100)} %` : ''}">${k + 1}</button>` : `<span class="${cls}">${k + 1}</span>`;
    }
    return `<div class="month"><h3>${esc(monthLabel(ym))}</h3><div class="cal">${cells}</div></div>`;
  }).join('')}</div>`;
}

function showYearDay(date) {
  const a = (T.yearSeries || []).find(x => x.date === date);
  const el = $('#y-detail');
  if (!a || !el) return;
  const k = bit => (a.known & bit ? null : '—');
  const val = (bit, v) => k(bit) || `${v}/${a.n}`;
  el.innerHTML = typo(`<div class="daydetail"><h3 class="section-title">${esc(E.frDayLong(date))}${a.partial ? ' <small class="muted">en cours</small>' : ''}</h3>
    <dl class="kv"><dt>Départs dans ton créneau</dt><dd>${a.n}</dd>
    <dt>Ouverts à un moment</dt><dd>${a.ever}/${a.n}${a.partial ? ' (pour l’instant)' : ''}</dd>
    <dt>À l’ouverture (J-29)</dt><dd>${val(E.YF.opening, a.open)}</dd>
    <dt>À J-7</dt><dd>${val(E.YF.j7, a.j7)}</dd>
    <dt>La veille</dt><dd>${val(E.YF.j1, a.j1)}</dd></dl>
    <p class="note">« — » : le robot n’a pas de relevé à ce moment-là pour cette date.</p></div>`);
  $$('.cal .d').forEach(b => b.classList.toggle('sel', b.dataset.yday === date));
}

function networkMonths(metric) {
  const y = S.hist.stats?.y || {}, out = new Map(), acc = new Map();
  const idx = { ever: [1, 0], open: [2, 3], j7: [4, 5], j1: [6, 7] }[metric];
  for (const [date, t] of Object.entries(y)) {
    const ym = date.slice(0, 7), v = acc.get(ym) || [0, 0];
    v[0] += t[idx[1]]; v[1] += t[idx[0]];
    acc.set(ym, v);
  }
  for (const [ym, [n, o]] of acc) if (n) out.set(ym, o / n);
  return out;
}

function networkCurveHTML() {
  const daily = (S.hist.stats?.daily || []).filter(d => d.deps);
  if (!daily.length) return '';
  const last = daily[daily.length - 1];
  if (daily.length < 2) return `<div class="card"><h2>Tout le réseau</h2><p class="lead small">Au dernier relevé, ${pct(last.open / last.deps)} des départs des 30 prochains jours étaient ouverts à 0 € (${last.open.toLocaleString('fr-FR')} sur ${last.deps.toLocaleString('fr-FR')}). La courbe apparaîtra dès le deuxième relevé.</p></div>`;
  const W = Math.min(560, Math.max(300, ($('#t-out')?.clientWidth || 360) - 34)), H = 170, L = 34, R = 10, T0 = 10, B = 24;
  const ys = daily.map(d => d.open / d.deps), maxY = Math.min(1, Math.max(0.1, ...ys) * 1.15);
  const X = i => L + (daily.length === 1 ? 0 : i / (daily.length - 1)) * (W - L - R);
  const Y = v => T0 + (1 - v / maxY) * (H - T0 - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Part des départs ouverts sur tout le réseau, relevé après relevé">`;
  for (const t of [0, maxY / 2, maxY]) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 5}" y="${Y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`;
  const ticks = [0, Math.floor((daily.length - 1) / 2), daily.length - 1];
  for (const i of [...new Set(ticks)]) s += `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle'}">${E.frShort(daily[i].day)}</text>`;
  s += `<polyline class="s1" points="${daily.map((d, i) => `${X(i).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(' ')}"/>`;
  return `<div class="card"><h2>Tout le réseau</h2><p class="lead small">Part des départs des 30 prochains jours ouverts à 0 €, relevé après relevé (dernier : ${pct(ys[ys.length - 1])}).</p><div class="curve">${s}</svg></div></div>`;
}

/* ================= onglet Explorer ================= */

const X = {};
const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const slotSpan = set => { const w = [...set].map(k => SLOTS[k]); return [w.map(x => x[0]).sort()[0], w.map(x => x[1]).sort().at(-1)]; };

function multiChips(container, set) {
  container.innerHTML = Object.entries(SLOTS).map(([k, [, , l]]) => `<button type="button" class="chip" data-slot="${k}">${l}</button>`).join('');
  const draw = () => $$('[data-slot]', container).forEach(x => x.setAttribute('aria-pressed', String(set.has(x.dataset.slot))));
  container.addEventListener('click', e => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    const k = b.dataset.slot;
    if (k === 'jour') { set.clear(); set.add('jour'); } else {
      set.delete('jour');
      if (set.has(k)) set.delete(k); else set.add(k);
      if (!set.size) set.add('jour');
    }
    draw();
  });
  draw();
}

function initExplorer() {
  const saved = store.get('explore', {});
  X.p = picker($('#p-e'));
  if (saved.o) X.p.set(saved.o, true);
  X.out = new Set(saved.outSlots || [saved.outSlot || 'jour']);
  X.ret = new Set(saved.retSlots || [saved.retSlot || 'aprem']);
  const shortcuts = { we: 'Ce week-end', we2: 'Le week-end suivant', demain: 'Demain' };
  const pickShortcut = k => {
    if (k === 'demain') { X.a = E.addDays(E.parisDay(), 1); X.b = null; return; }
    const w = weekendDates(k === 'we2' ? 1 : 0);
    X.a = w.out[0]; X.b = w.ret[0];
  };
  pickShortcut('we');
  $('#e-when').innerHTML = Object.entries(shortcuts).map(([k, l]) => `<button type="button" class="chip" data-when="${k}">${l}</button>`).join('');
  $('#e-when').addEventListener('click', e => {
    const b = e.target.closest('[data-when]');
    if (!b) return;
    pickShortcut(b.dataset.when);
    drawRange();
  });
  $('#e-cal').addEventListener('click', e => {
    const c = e.target.closest('[data-day]');
    if (!c) return;
    const d = c.dataset.day;
    if (!X.a || X.b || d < X.a) { X.a = d; X.b = null; } else X.b = d;
    drawRange();
  });
  $('#e-sum').addEventListener('click', e => { if (e.target.closest('[data-noret]')) { X.b = null; drawRange(); } });
  drawRange();
  multiChips($('#e-outslots'), X.out);
  multiChips($('#e-retslots'), X.ret);
  $('#f-exp').addEventListener('submit', e => { e.preventDefault(); explore(); });
  $('#e-out').addEventListener('click', e => {
    const b = e.target.closest('[data-analyse]');
    if (!b) return;
    const { o, d, date } = JSON.parse(b.dataset.analyse);
    T.po.set(o, true); T.pd.set(d, true); $('#t-date').value = date;
    const [f, t] = slotSpan(X.out);
    $('#t-from').value = f; $('#t-to').value = t;
    location.hash = '#trajet';
    analyse();
  });
}

/* Calendrier des 30 jours ouverts à la réservation : 1er appui = aller, 2e = retour. */
function drawRange() {
  const today = E.parisDay(), last = E.addDays(today, 30);
  const start = E.addDays(today, 1 - E.isoWeekday(today)), end = E.addDays(last, 7 - E.isoWeekday(last));
  let html = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(w => `<span class="wd">${w}</span>`).join('');
  for (let d = start; d <= end; d = E.addDays(d, 1)) {
    const off = d < today || d > last, n = +d.slice(8);
    const cls = ['d', off && 'off', d === today && 'today', d === X.a && 'a', d === X.b && 'b', X.a && X.b && d > X.a && d < X.b && 'in'].filter(Boolean).join(' ');
    const month = n === 1 || d === today ? `<small>${esc(MONTH_SHORT.format(E.parseDay(d)))}</small>` : '';
    html += off ? `<span class="${cls}">${n}</span>`
      : `<button type="button" class="${cls}" data-day="${d}" aria-pressed="${d === X.a || d === X.b}" aria-label="${esc(E.frDayLong(d))}">${month}${n}</button>`;
  }
  $('#e-cal').innerHTML = html;
  $('#e-sum').innerHTML = X.a
    ? `<span>Aller : <b>${esc(E.frDay(X.a))}</b></span>${X.b
      ? `<span>Retour : <b>${esc(E.frDay(X.b))}</b></span><button type="button" data-noret>Sans retour</button>`
      : '<span class="muted">Retour : touche une 2e date, ou laisse vide pour un aller simple</span>'}`
    : '<span class="muted">Touche la date de l’aller.</span>';
  $('#e-retbox').hidden = !X.b;
}

function weekendDates(offsetWeeks) {
  const today = E.parisDay();
  const wd = E.isoWeekday(today);
  let fri = E.addDays(today, (5 - wd + 7) % 7);
  if (wd === 6) fri = E.addDays(today, -1);
  if (wd === 7) fri = E.addDays(today, 5);
  fri = E.addDays(fri, 7 * offsetWeeks);
  const out = [fri, E.addDays(fri, 1)].filter(d => d >= today);
  return { out, ret: [E.addDays(fri, 2)] };
}

function timesByDate(list) {
  const by = new Map();
  for (const x of list) { if (!by.has(x.date)) by.set(x.date, []); by.get(x.date).push(x); }
  return [...by.entries()].map(([d, xs]) => `<div class="tday"><span class="tdate">${esc(E.frDay(d))}</span><span class="tlist">${xs.map(x => `<span class="tchip" title="arrivée ${x.arr}, train ${esc(x.trains.join('/'))}">${x.dep}</span>`).join('')}</span></div>`).join('');
}

async function explore() {
  const out = $('#e-out');
  const o = X.p.get();
  if (!o) { out.innerHTML = banner('warn', 'Choisis ta gare de départ dans la liste.'); return; }
  if (!X.a) { out.innerHTML = banner('warn', 'Touche la date de l’aller dans le calendrier.'); return; }
  const withReturn = !!X.b;
  const outDates = [X.a], retDates = withReturn ? [X.b] : [];
  store.set('explore', { o, outSlots: [...X.out], retSlots: [...X.ret] });
  out.innerHTML = loading('Recherche des destinations à 0 €…');
  try {
    const wins = set => [...set].map(k => [SLOTS[k][0], SLOTS[k][1]]);
    const outR = [X.a, X.a], retR = [X.b, X.b];
    const [outDeps, retDeps] = await Promise.all([
      apiRows(`${E.orEq('origine', [o])} and od_happy_card="OUI"`, outR),
      withReturn ? apiRows(`${E.orEq('destination', [o])} and od_happy_card="OUI"`, retR) : [],
    ]);
    const list = E.exploreDestinations(outDeps, retDeps, { from: [o], outWins: wins(X.out), retWins: wins(X.ret), withReturn, outDates, retDates });
    const label = `${outDates.map(E.frDay).join(' ou ')}${withReturn ? `, retour ${retDates.map(E.frDay).join(' ou ')}` : ''}`;
    if (!list.length) { out.innerHTML = `<div class="card empty"><b>Aucune destination à 0 €</b>Depuis ${P(o)} (${esc(label)}), dans ce créneau. Élargis le créneau ou essaie une autre date.</div>`; return; }
    const both = list.filter(x => x.both).length;
    out.innerHTML = typo(`<div class="card"><h2>${plural(list.length, 'destination')} <small>${withReturn ? `dont ${both} avec retour à 0 €` : ''}</small></h2><p class="lead small">Depuis ${P(o)}, ${esc(label)}.</p>
      ${list.map(dst => `<details class="dest${dst.both ? '' : ' noret'}"><summary><span class="city">${P(dst.city)}</span><span class="meta">dès ${E.fmtDur(dst.minDur)} de trajet</span><span class="counts"><b>${dst.out.length}</b> aller${dst.out.length > 1 ? 's' : ''}${withReturn ? `<br><b>${dst.ret.length}</b> retour${dst.ret.length > 1 ? 's' : ''}` : ''}</span></summary>
        <div class="inner"><h4>Aller, heures de départ</h4>${timesByDate(dst.out)}
        ${withReturn ? `<h4>Retour, heures de départ</h4>${dst.ret.length ? timesByDate(dst.ret) : '<p class="small muted">Aucun retour à 0 € dans ce créneau pour l’instant.</p>'}` : ''}
        <div class="actions"><button class="btn quiet small" data-analyse='${esc(JSON.stringify({ o, d: dst.city, date: dst.out[0].date }))}'>Analyser ce trajet</button></div></div></details>`).join('')}</div>`);
  } catch (e) { out.innerHTML = errorBanner(e); console.error(e); }
}

/* ================= onglet Mes résas ================= */

function saveResas() { store.set('resas', S.resas); }
function addResa(r) {
  S.resas.push({ id: Math.random().toString(36).slice(2, 10), statut: 'active', ...r });
  S.resas.sort((a, b) => a.date.localeCompare(b.date) || (a.dep || '').localeCompare(b.dep || ''));
  saveResas();
}

const PILL = {
  attente: r => `confirmation dès le ${E.frShort(r.confirmDu)}`, 'a-confirmer': r => `à confirmer avant le ${E.frShort(r.confirmAu)} 17 h`,
  urgent: () => 'à confirmer avant 17 h aujourd’hui', confirmee: () => 'confirmée', expiree: () => 'non confirmée : annulée ?',
  annulee: () => 'annulée', passee: () => 'voyage passé', payant: () => 'billet -30 %',
};

function initResas() {
  R.po = picker($('#p-ro'));
  R.pd = picker($('#p-rd'));
  $('#r-date').value = E.addDays(E.parisDay(), 7);
  $('#f-resa').addEventListener('submit', e => {
    e.preventDefault();
    const o = R.po.get(), d = R.pd.get(), date = $('#r-date').value;
    if (!o || !d || !date) { toast('Indique au moins les gares et la date'); return; }
    addResa({ o, d, date, dep: $('#r-dep').value, arr: '', train: $('#r-train').value.trim(), voiture: $('#r-voiture').value.trim(), place: $('#r-place').value.trim(), tarif: $('#r-tarif').value });
    $('#r-add').open = false;
    renderResas();
    toast('Réservation ajoutée');
  });
  $('#tab-resas').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = S.resas.find(x => x.id === b.dataset.id);
    if (b.dataset.r === 'ics') { icsForResas(); return; }
    if (b.dataset.r === 'unshare') { S.partages = S.partages.filter(x => x.k !== b.dataset.id); store.set('partages', S.partages); renderShared(); return; }
    if (!r) return;
    if (b.dataset.r === 'share') { shareResa(r); return; }
    if (b.dataset.r === 'confirm') r.statut = r.statut === 'confirmee' ? 'active' : 'confirmee';
    if (b.dataset.r === 'cancel') r.statut = r.statut === 'annulee' ? 'active' : 'annulee';
    if (b.dataset.r === 'del') S.resas = S.resas.filter(x => x !== r);
    saveResas();
    renderResas();
  });
}
const R = {};

function renderResas() {
  const st = E.checkResas(S.resas);
  const pips = Array.from({ length: st.max }, (_, i) => `<i class="${i < st.used ? 'on' : ''}"></i>`).join('');
  $('#r-counter').innerHTML = `<div class="counter"><div><div class="num">${st.used}<small> / ${st.max}</small></div><div class="small muted">réservations à 0 € en cours</div></div><div class="pips" aria-hidden="true">${pips}</div></div>
    ${st.used >= st.max ? banner('warn', 'Compteur plein : tu ne peux plus réserver à 0 € tant qu’un trajet n’est pas passé ou annulé.') : ''}`;
  const upcoming = st.list.filter(r => r.etat !== 'passee' && r.etat !== 'annulee');
  const old = st.list.filter(r => r.etat === 'passee' || r.etat === 'annulee');
  const card = r => `<div class="resa${r.etat === 'annulee' || r.etat === 'passee' ? ' dim' : ''}">
      <div class="l1"><span class="when">${esc(E.frDay(r.date))}${r.dep ? ` ${esc(r.dep)}` : ''}</span><span class="pill ${r.etat}">${esc(PILL[r.etat]?.(r) || r.etat)}</span></div>
      <div class="small">${P(r.o)} → ${P(r.d)}${r.train ? ` <span class="muted">train ${esc(r.train)}</span>` : ''}${seat(r)}${r.tarif === 'avantage' ? ' <span class="muted">(-30 %)</span>' : ''}</div>
      ${r.conflits.length ? banner('warn', `Deux réservations au départ de ${P(r.o)} ce jour-là : la règle n’en autorise qu’une par jour et par ville.`) : ''}
      <div class="actions">${r.tarif !== 'avantage' && r.etat !== 'passee' && r.etat !== 'annulee' ? `<button class="btn quiet small" data-r="confirm" data-id="${r.id}">${r.statut === 'confirmee' ? 'Annuler la confirmation' : 'J’ai confirmé'}</button>` : ''}
      ${r.etat !== 'passee' ? `<button class="btn quiet small" data-r="cancel" data-id="${r.id}">${r.statut === 'annulee' ? 'Rétablir' : 'Annulée'}</button>` : ''}
      ${r.etat !== 'passee' && r.etat !== 'annulee' ? `<button class="btn quiet small" data-r="share" data-id="${r.id}">Partager mon trajet</button>` : ''}
      <button class="btn ghost small" data-r="del" data-id="${r.id}">Supprimer</button></div></div>`;
  $('#r-list').innerHTML = `<h2>Mes réservations</h2>${upcoming.length ? upcoming.map(card).join('') : '<div class="empty"><b>Aucune réservation suivie</b>Ajoute-les depuis l’analyse d’un trajet (« J’ai réservé ») ou à la main. Elles restent sur ce téléphone.</div>'}
    ${upcoming.length ? '<div class="actions"><button class="btn quiet small" data-r="ics">Ajouter les rappels de confirmation à mon agenda</button></div>' : ''}
    ${old.length ? `<details class="more"><summary>Passées ou annulées (${old.length})</summary>${old.map(card).join('')}</details>` : ''}`;
  renderShared();
  $('#r-rules').innerHTML = `<h2>Les règles à retenir</h2><ul class="insights">
    <li>${E.RULES.maxSlots} réservations à 0 € maximum en même temps ; une place se libère quand tu voyages ou annules.</li>
    <li>Une seule réservation par jour au départ d’une même ville.</li>
    <li>Confirmation obligatoire entre J-2 et la veille 17 h, sinon annulation automatique.</li>
    <li>Billet 0 € : annulation gratuite jusqu’au départ. Pense à libérer ta place si tu ne pars plus.</li>
    <li>Billet -30 % : remboursement gratuit jusqu’à J-7 inclus, puis 19 € sur TGV INOUI.</li></ul>
    <p class="note">Ces réservations sont un aide-mémoire stocké sur ce téléphone, dans ton compte : l’app ne se connecte jamais à ton compte SNCF.</p>`;
}

const seat = r => (r.voiture || r.place ? ` <span class="muted">${[r.voiture && `voiture ${esc(r.voiture)}`, r.place && `place ${esc(r.place)}`].filter(Boolean).join(', ')}</span>` : '');

/* ---------- partager un trajet : un lien, rien n'est envoyé ailleurs ---------- */
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
async function shareResa(r) {
  const who = PROFILS[profil] || 'Quelqu’un';
  const t = { de: who, o: r.o, d: r.d, date: r.date, dep: r.dep || '', train: r.train || '', voiture: r.voiture || '', place: r.place || '' };
  const url = `${location.origin}${location.pathname}?partage=${b64e(JSON.stringify(t))}#resas`;
  const text = `${who} partage son trajet : ${E.pretty(r.o)} → ${E.pretty(r.d)}, ${E.frDay(r.date)}${r.dep ? ` à ${r.dep}` : ''}${r.train ? `, train ${r.train}` : ''}${r.voiture ? `, voiture ${r.voiture}` : ''}${r.place ? `, place ${r.place}` : ''}.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Mon trajet', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Lien copié : envoie-le à qui tu veux');
  } catch (e) { if (e?.name !== 'AbortError') toast('Partage impossible sur ce téléphone'); }
}
function receiveShare() {
  const p = new URLSearchParams(location.search);
  const raw = p.get('partage');
  if (!raw) return;
  history.replaceState(null, '', location.pathname + location.hash);
  try {
    const t = JSON.parse(b64d(raw));
    if (!t.o || !t.d || !t.date) throw new Error('incomplet');
    const k = [t.de, t.o, t.d, t.date, t.dep, t.train].join('|');
    if (!S.partages.some(x => x.k === k)) S.partages.push({ ...t, k });
    S.partages.sort((a, b) => a.date.localeCompare(b.date) || (a.dep || '').localeCompare(b.dep || ''));
    store.set('partages', S.partages);
    location.hash = '#resas';
    setTimeout(() => toast(`Trajet de ${t.de} ajouté`), 300);
  } catch { toast('Ce lien de trajet est illisible'); }
}
function renderShared() {
  const el = $('#r-shared');
  const list = S.partages.filter(t => t.date >= E.parisDay());
  el.hidden = !list.length;
  if (!list.length) return;
  el.innerHTML = `<h2>Trajets partagés avec toi</h2>${list.map(t => `<div class="resa">
      <div class="l1"><span class="when">${esc(E.frDay(t.date))}${t.dep ? ` ${esc(t.dep)}` : ''}</span><span class="pill confirmee">${esc(t.de)}</span></div>
      <div class="small">${P(t.o)} → ${P(t.d)}${t.train ? ` <span class="muted">train ${esc(t.train)}</span>` : ''}${seat(t)}</div>
      <div class="actions"><button class="btn ghost small" data-r="unshare" data-id="${esc(t.k)}">Retirer</button></div></div>`).join('')}
    <p class="note">Ces trajets ne comptent pas dans tes 6 réservations.</p>`;
}

/* ---------- actualiser : relit la publication SNCF du jour ---------- */
async function refreshNow() {
  const before = S.apiMeta?.at || null;
  $('#fresh-t').textContent = 'Vérification…';
  S.cache.clear();
  S.apiMeta = null;
  const at = await freshness();
  if (!$('#tab-trajet').hidden && T.last) analyse();
  toast(at && before && at !== before ? 'Nouvelles données SNCF chargées'
    : 'Déjà à jour : la SNCF publie une fois par jour, vers 6 h 30. Pour le temps réel, vérifie sur SNCF Connect.');
}

function icsForResas() {
  const st = E.checkResas(S.resas);
  const ev = [];
  for (const r of st.list) {
    if (['annulee', 'passee', 'payant', 'confirmee'].includes(r.etat)) continue;
    const route = `${E.pretty(r.o)} → ${E.pretty(r.d)}`;
    if (r.confirmDu >= E.parisDay()) ev.push({ uid: `c1-${r.id}@aiguillage`, start: E.parisToUTC(r.confirmDu, '09:00'), title: `Confirmer ma résa MAX ${route}`, description: `Voyage le ${E.frDay(r.date)} ${r.dep || ''}. Confirmation possible jusqu’à la veille 17 h.`, alarm: 0 });
    ev.push({ uid: `c2-${r.id}@aiguillage`, start: E.parisToUTC(r.confirmAu, '15:00'), title: `Dernière limite 17 h : confirmer ${route}`, description: 'Sans confirmation avant 17 h, la réservation est annulée automatiquement.', alarm: 0 });
  }
  if (!ev.length) { toast('Aucune confirmation à venir'); return; }
  download('aiguillage-confirmations.ics', E.buildICS(ev));
}

/* ================= onglet Suivi ================= */

const B = { jours: new Set(), sens: 'aller-retour' };
async function renderSuivi() {
  await histReady;
  const meta = S.hist.meta, repo = repoInfo();
  if (!S.config) S.config = await getJSON('config.json').catch(() => ({ alertes: [] }));
  const snaps = meta?.snaps || [];
  const last = snaps[snaps.length - 1];
  const hours = snaps.filter(s => s.at).slice(-14).map(s => E.parisMinutes(new Date(s.at)));
  const typical = hours.length ? E.fmtMin(hours.slice().sort((a, b) => a - b)[Math.floor(hours.length / 2)]) : null;
  $('#s-robot').innerHTML = `<h2>Le robot</h2>${meta ? `<dl class="kv">
      <dt>Dernier relevé</dt><dd>${esc(E.frDayLong(last.day))}${last.at ? ` (publié à ${E.fmtMin(E.parisMinutes(new Date(last.at)))})` : ''}</dd>
      <dt>Historique depuis</dt><dd>${esc(E.frDayLong(meta.first))}, ${plural(snaps.length, 'relevé')}</dd>
      <dt>Réseau suivi</dt><dd>${plural(meta.odCount || 0, 'trajet')}, ${last.deps.toLocaleString('fr-FR')} départs dont ${last.open.toLocaleString('fr-FR')} ouverts</dd>
      ${typical ? `<dt>Publication SNCF</dt><dd>en général vers ${typical}</dd>` : ''}</dl>`
    : '<p class="lead">Pas encore de relevé. Le robot passe chaque matin après la publication SNCF ; reviens demain.</p>'}
    ${repo ? `<div class="actions"><a class="btn quiet small" href="${repo.actions}" target="_blank" rel="noopener">Voir le robot sur GitHub</a></div>` : ''}`;

  const rules = (S.config.alertes || []).filter(r => !r.pour || r.pour === profil);
  const arrival = a => (a[0] > '00:00' ? `arrivée ${a[0]}–${a[1]}` : a[1] === '23:59' ? 'arrivée avant minuit' : `arrivée avant ${a[1]}`);
  const leg = (j, h, a) => [j?.length ? j.join(', ') : 'tous les jours', h?.length === 2 ? `départ ${h[0]}–${h[1]}` : 'toute la journée', a?.length === 2 ? arrival(a) : null].filter(Boolean).join(', ');
  const desc = r => {
    const back = /retour/.test(r.sens || '');
    const lines = [`Aller : ${leg(r.jours, r.heures, r.arrivee)}`];
    if (back) lines.push(`Retour : ${leg(r.jours_retour?.length ? r.jours_retour : r.jours, r.heures_retour || r.heures, r.arrivee_retour || r.arrivee)}`);
    if (r.dates?.length === 2) lines.push(`Du ${E.frShort(r.dates[0])} au ${E.frShort(r.dates[1])}`);
    if (r.note) lines.push(r.note);
    return lines;
  };
  $('#s-alerts').innerHTML = `<h2>Mes alertes</h2>${rules.length
    ? `<ul class="alerts-list">${rules.map(r => `<li><b>${esc(r.nom || `${E.pretty(r.de[0])} → ${E.pretty(r.vers[0])}`)}</b>${desc(r).map(l => `<div class="small muted">${esc(l)}</div>`).join('')}</li>`).join('')}</ul>`
    : '<p class="lead">Aucune alerte pour l’instant. Crée-en une ci-dessous : chaque matin, le robot t’envoie une notification ntfy quand un départ s’ouvre ou se ferme.</p>'}
    <p class="note">Notifications : appli ntfy, abonnée au canal secret donné à l’installation.</p>`;

  if (!B.ready) {
    $('#s-builder').innerHTML = `<h2>Créer une alerte</h2><form class="form" id="f-alert" autocomplete="off" novalidate>
      <div class="field picker" id="p-ao"><label for="a-o">De</label><input id="a-o" type="text" placeholder="Gare de départ" spellcheck="false"><ul class="sugg" role="listbox" hidden></ul></div>
      <div class="field picker" id="p-ad"><label for="a-d">Vers</label><input id="a-d" type="text" placeholder="Gare d'arrivée" spellcheck="false"><ul class="sugg" role="listbox" hidden></ul></div>
      <div class="field"><span class="label">Sens</span><div class="chips" id="a-sens"><button type="button" class="chip" data-sens="aller">Aller</button><button type="button" class="chip" data-sens="aller-retour">Aller et retour</button></div></div>
      <div class="field"><span class="label">Jours (aucun = tous)</span><div class="chips" id="a-jours">${E.WEEKDAYS.map(w => `<button type="button" class="chip" data-j="${w}">${w}</button>`).join('')}</div></div>
      <div class="grid2"><div class="field"><label for="a-h1">Départ après</label><input type="time" id="a-h1" value="17:00"></div><div class="field"><label for="a-h2">Départ avant</label><input type="time" id="a-h2" value="22:00"></div></div>
      <div class="grid2" id="a-ret"><div class="field"><label for="a-r1">Retour après</label><input type="time" id="a-r1" value="15:00"></div><div class="field"><label for="a-r2">Retour avant</label><input type="time" id="a-r2" value="22:00"></div></div>
      <button class="btn block" type="submit">Générer l’alerte</button></form><div id="a-out"></div>`;
    B.po = picker($('#p-ao')); B.pd = picker($('#p-ad'));
    const syncSens = () => { $$('#a-sens [data-sens]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sens === B.sens))); $('#a-ret').hidden = B.sens !== 'aller-retour'; };
    $('#a-sens').addEventListener('click', e => { const b = e.target.closest('[data-sens]'); if (b) { B.sens = b.dataset.sens; syncSens(); } });
    $('#a-jours').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b) return; const j = b.dataset.j; if (B.jours.has(j)) B.jours.delete(j); else B.jours.add(j); b.setAttribute('aria-pressed', String(B.jours.has(j))); });
    syncSens();
    $('#f-alert').addEventListener('submit', e => { e.preventDefault(); buildAlert(); });
    $('#s-builder').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(B.text); });
    B.ready = true;
  }

  $('#s-about').innerHTML = `<h2>À propos</h2>
    <p class="small">FloRoBot lit le jeu de données ouvert « tgvmax » de SNCF Voyageurs (data.sncf.com), publié une fois par jour : un départ y est ouvert ou fermé, sans nombre de places. Les disponibilités sont indicatives ; la vérité est sur SNCF Connect au moment où tu réserves.</p>
    <p class="small">L’app ne réserve rien à ta place et ne se connecte pas à ton compte : les CGV de SNCF Connect interdisent les robots de réservation. Il t’aide à décider vite et au bon moment.</p>
    <p class="small muted">Données : SNCF Voyageurs, <a href="https://data.sncf.com/pages/licence" target="_blank" rel="noopener">licence open data SNCF</a>. Projet indépendant, non affilié à la SNCF.</p>`;
}

function buildAlert() {
  const o = B.po.get(), d = B.pd.get();
  if (!o || !d) { toast('Choisis les deux gares dans la liste'); return; }
  const rule = { nom: `${E.pretty(o)} → ${E.pretty(d)}${B.jours.size ? ` (${[...B.jours].join(', ')})` : ''}`, de: [o], vers: [d], sens: B.sens };
  if (profil) rule.pour = profil;
  if (B.jours.size) rule.jours = E.WEEKDAYS.filter(w => B.jours.has(w));
  rule.heures = [$('#a-h1').value || '00:00', $('#a-h2').value || '23:59'];
  if (B.sens === 'aller-retour') rule.heures_retour = [$('#a-r1').value || '00:00', $('#a-r2').value || '23:59'];
  const cfg = JSON.parse(JSON.stringify(S.config || { alertes: [] }));
  cfg.alertes = [...(cfg.alertes || []), rule];
  B.text = JSON.stringify(cfg, null, 2);
  const repo = repoInfo();
  $('#a-out').innerHTML = `<p class="lead small" style="margin-top:14px">Voici ton fichier de configuration avec la nouvelle alerte. Pour l’activer :</p>
    <ol class="steps"><li>Copie le texte.</li><li>${repo ? `Ouvre <a href="${repo.editConfig}" target="_blank" rel="noopener">config.json sur GitHub</a>` : 'Ouvre config.json dans ton dépôt GitHub'}, remplace tout son contenu, puis « Commit changes ».</li><li>Le robot en tient compte dès son prochain passage.</li></ol>
    <pre class="code">${esc(B.text)}</pre><div class="actions"><button class="btn" type="button" data-copy>Copier</button>${repo ? `<a class="btn ghost" href="${repo.editConfig}" target="_blank" rel="noopener">Ouvrir config.json</a>` : ''}</div>`;
}

/* ================= démarrage ================= */

async function freshness() {
  const el = $('#fresh-t');
  try {
    const m = await apiMeta();
    if (!m.at) throw new Error();
    const d = new Date(m.at), day = E.parisDay(d), today = E.parisDay();
    const when = day === today ? 'ce matin' : day === E.addDays(today, -1) ? 'hier' : E.frDay(day);
    el.textContent = `Données ${when}, ${E.fmtMin(E.parisMinutes(d))}`;
    return m.at;
  } catch {
    await histReady;
    const last = S.hist.meta?.snaps?.at(-1);
    el.textContent = last ? `Dernier relevé : ${E.frDay(last.day)}` : 'Données SNCF indisponibles';
  }
}

function fromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.get('o') || !p.get('d')) return false;
  T.po.set(p.get('o'), true); T.pd.set(p.get('d'), true);
  if (p.get('date')) $('#t-date').value = p.get('date');
  if (p.get('from')) $('#t-from').value = p.get('from');
  if (p.get('to')) $('#t-to').value = p.get('to');
  history.replaceState(null, '', location.pathname + '#trajet');
  return true;
}

async function main() {
  initProfil();
  checkPause();
  setInterval(() => { if (!document.hidden) checkPause(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPause(); });
  receiveShare();
  initTrajet();
  initExplorer();
  initResas();
  $('#t-out').addEventListener('click', onTrajetClick);
  $('#fresh').addEventListener('click', refreshNow);
  window.addEventListener('hashchange', showTab);
  showTab();
  freshness();
  await loadStations();
  refreshAlts();
  if (fromUrl()) { location.hash = '#trajet'; analyse(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
