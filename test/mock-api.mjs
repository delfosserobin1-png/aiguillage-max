/*
 * Faux serveur Opendatasoft pour les tests : comprend le sous-ensemble ODSQL utilisé par l'app
 * (parenthèses, and/or, comparaisons champ/littéral, littéraux date'…').
 */
const REJECT = new Set((process.env.MOCK_REJECT || '').split(',').filter(Boolean));
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    if (c === '"') {
      let j = i + 1, v = '';
      while (j < s.length && s[j] !== '"') { if (s[j] === '\\') j++; v += s[j]; j++; }
      out.push({ t: 'lit', v }); i = j + 1; continue;
    }
    if (c === '`' && REJECT.has('backtick')) throw Object.assign(new Error('ODSQL: backtick refusé (simulation)'), { status: 400 });
    if (c === '`') { const j = s.indexOf('`', i + 1); out.push({ t: 'field', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    const op = s.slice(i).match(/^(>=|<=|!=|=|>|<)/);
    if (op) { out.push({ t: 'op', v: op[1] }); i += op[1].length; continue; }
    const dl = s.slice(i).match(/^date'([^']+)'/);
    if (dl && REJECT.has('dateliteral')) throw Object.assign(new Error('ODSQL: littéral date refusé (simulation)'), { status: 400 });
    if (dl) { out.push({ t: 'lit', v: dl[1] }); i += dl[0].length; continue; }
    const w = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (w) {
      const lw = w[0].toLowerCase();
      out.push(lw === 'and' || lw === 'or' || lw === 'not' ? { t: lw } : { t: 'field', v: w[0] });
      i += w[0].length; continue;
    }
    throw Object.assign(new Error(`ODSQL: caractère inattendu « ${c} »`), { status: 400 });
  }
  return out;
}

export function compile(where) {
  const tk = tokenize(where);
  let p = 0;
  const peek = () => tk[p], next = () => tk[p++];
  const expr = () => { let l = term(); while (peek()?.t === 'or') { next(); const r = term(); const a = l; l = row => a(row) || r(row); } return l; };
  const term = () => { let l = fact(); while (peek()?.t === 'and') { next(); const r = fact(); const a = l; l = row => a(row) && r(row); } return l; };
  const fact = () => {
    const t = next();
    if (!t) throw Object.assign(new Error('ODSQL: fin inattendue'), { status: 400 });
    if (t.t === 'not') { const f = fact(); return row => !f(row); }
    if (t.t === '(') { const e = expr(); if (next()?.t !== ')') throw Object.assign(new Error('ODSQL: parenthèse'), { status: 400 }); return e; }
    if (t.t === 'field') {
      const op = next(), lit = next();
      if (op?.t !== 'op' || lit?.t !== 'lit') throw Object.assign(new Error('ODSQL: comparaison invalide'), { status: 400 });
      const f = t.v, v = lit.v;
      return row => {
        const x = String(row[f] ?? '');
        switch (op.v) { case '=': return x === v; case '!=': return x !== v; case '>=': return x >= v; case '<=': return x <= v; case '>': return x > v; case '<': return x < v; }
        return false;
      };
    }
    throw Object.assign(new Error('ODSQL: jeton inattendu'), { status: 400 });
  };
  const f = expr();
  if (p !== tk.length) throw Object.assign(new Error('ODSQL: reste non lu'), { status: 400 });
  return f;
}

export function handle(url, rows, meta) {
  const u = new URL(url);
  if (/\/datasets\/tgvmax\/?$/.test(u.pathname)) {
    return { status: 200, body: { dataset_id: 'tgvmax', metas: { default: { data_processed: meta.at, modified: meta.at, records_count: rows.length } }, fields: meta.fields.map(name => ({ name })) } };
  }
  if (/\/exports\/json$/.test(u.pathname)) {
    try {
      const where = u.searchParams.get('where');
      const sel = (u.searchParams.get('select') || '').split(',').filter(Boolean);
      const gb = u.searchParams.get('group_by');
      for (const f of sel) if (!meta.fields.includes(f)) return { status: 400, body: { message: `Unknown field: ${f}` } };
      const pred = where ? compile(where) : () => true;
      let out = rows.filter(pred);
      if (gb) { const seen = new Set(); out = out.filter(r => !seen.has(r[gb]) && seen.add(r[gb])).map(r => ({ [gb]: r[gb] })); }
      else if (sel.length) out = out.map(r => Object.fromEntries(sel.map(f => [f, r[f]])));
      return { status: 200, body: out };
    } catch (e) { return { status: e.status || 500, body: { message: e.message } }; }
  }
  return { status: 404, body: { message: 'not found' } };
}
