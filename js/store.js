/* NOC SmartTrack demo - browser storage: seeded demo DB in localStorage, uploaded files in IndexedDB, client-side demo login. */
(function (G) {
  'use strict';
  const N = G.NOC, { sha256, nowIso, todayIST, diffDays, addDaysD, parseDate, DAY } = N;
  const LS_DB = 'noc_demo_db_v1', LS_SESSION = 'noc_demo_session_v1', LS_LANG = 'noc_demo_lang';
  const ROOT = (document.currentScript && new URL('../', document.currentScript.src).href) || new URL('./', location.href).href;
  N.ROOT = ROOT;
  const SALT = u => 'noc-demo:' + u + ':';
  N.hashPw = (u, p) => sha256(SALT(u) + p);
  let lastSaved = '';

  /* ---------- seed -> hydrated DB ---------- */
  const SHIFT = ['applications', 'documents', 'bank_guarantees', 'technical_proposals', 'observations', 'clarifications', 'noc_certificates', 'notifications', 'audit_log', 'mis_records', 'users'];
  function shiftText(s, n) {
    if (!n || typeof s !== 'string') return s;
    return s
      .replace(/(^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (m, p, y, mo, d) => p + addDaysD(y + '-' + mo + '-' + d, n))
      .replace(/(^|[^\d])(\d{2})\.(\d{2})\.(\d{4})(?!\d)/g, (m, p, d, mo, y) => { const s2 = addDaysD(y + '-' + mo + '-' + d, n); return p + s2.slice(8, 10) + '.' + s2.slice(5, 7) + '.' + s2.slice(0, 4); })
      .replace(/(^|[^\d])(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})(?!\d)/g, (m, p, d, mon, y) => { const s2 = addDaysD(y + '-' + N.p2(N.MON.indexOf(mon) + 1) + '-' + d, n); return p + s2.slice(8, 10) + ' ' + N.MON[+s2.slice(5, 7) - 1] + ' ' + s2.slice(0, 4); });
  }
  function decodeInf(v) { if (v === 'Infinity') return Infinity; if (Array.isArray(v)) return v.map(decodeInf); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = decodeInf(v[k]); return o; } return v; }
  const jparse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

  function hydrate(seed) {
    const delta = diffDays(seed.meta.snapshot_ist_date, todayIST());
    const T = JSON.parse(JSON.stringify(seed.tables));
    const now = Date.parse(nowIso());
    for (const t of SHIFT) for (const r of T[t]) for (const k in r) {
      if (typeof r[k] === 'string') {
        r[k] = shiftText(r[k], delta);
        if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(r[k]) && Date.parse(r[k]) > now) r[k] = new Date(now - 60000).toISOString().slice(0, 19) + 'Z';
      }
    }
    // JSON columns -> objects
    for (const a of T.applications) { a.bg_calc = jparse(a.bg_calc_json); a.addl_bg_calc = jparse(a.addl_bg_calc_json); a.load_sheet = jparse(a.load_sheet_json); delete a.bg_calc_json; delete a.addl_bg_calc_json; delete a.load_sheet_json; }
    for (const r of T.rules) { r.refs = jparse(r.refs_json) || []; delete r.refs_json; }
    for (const c of T.noc_certificates) { c.snapshot = jparse(c.snapshot_json); delete c.snapshot_json; }
    for (const u of T.users) u.pw_hash = N.hashPw(u.username, 'demo123');
    // hash-chain the audit log (JS formula)
    let prev = '';
    for (const r of T.audit_log) { r.prev_hash = prev; r.hash = N.chainHash(prev, r); prev = r.hash; }
    const DB = { v: 1, meta: { snapshot_ist_date: seed.meta.snapshot_ist_date, shifted_days: delta, hydrated_at: nowIso(), hydrated_ist: todayIST() }, T };
    N.DB = DB; N.invalidateRules();
    // NOC text / fingerprint for the seeded certificates (rebuilt with the same functions used at issue time)
    const rs = N.RS();
    for (const c of T.noc_certificates) {
      const app = N.APP(c.app_id), load = c.snapshot.load_kva, issuer = N.U(c.issued_by);
      if (c.kind === 'CONDITIONAL') { c.temp_kw = app.temp_load_kw || 0; c.conditions = N.condsConditional(c.temp_kw, c.valid_upto, rs); }
      else c.conditions = N.condsFinal(app, load, c.valid_upto, rs);
      c.authority = N.approvingAuthority(load, rs)[1]; c.issuer = issuer ? issuer.name : ''; c.issuer_desig = (issuer && (issuer.designation || N.ROLE_NAME[issuer.role])) || '';
      c.fingerprint = sha256(N.sortedJson(c.snapshot));
    }
    return DB;
  }
  async function loadSeed() {
    if (N.SEED) return N.SEED;
    const r = await fetch(ROOT + 'data/seed.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Could not load demo seed data (' + r.status + ')');
    N.SEED = await r.json(); N.CFG = decodeInf(N.SEED.config); return N.SEED;
  }
  function persist() {
    lastSaved = JSON.stringify(N.DB);
    try { localStorage.setItem(LS_DB, lastSaved); N.storageError = null; } catch (e) { N.storageError = 'Browser storage is full or blocked - changes will be lost on reload.'; }
  }
  N.save = () => { N.invalidateRules(); persist(); };
  N.rollback = () => { if (lastSaved) { N.DB = JSON.parse(lastSaved); N.invalidateRules(); } };
  N.init = async function (opts) {
    opts = opts || {};
    const seed = await loadSeed();
    let raw = null; try { raw = localStorage.getItem(LS_DB); } catch (e) { /* blocked */ }
    let DB = null;
    if (raw) { try { DB = JSON.parse(raw); if (DB.v !== 1) DB = null; } catch (e) { DB = null; } }
    if (DB) { N.DB = DB; lastSaved = raw; N.invalidateRules(); }
    else { hydrate(seed); if (opts.readonly) N.ephemeral = true; else persist(); }
    return N.DB;
  };
  N.resetDemo = async function () {
    const seed = await loadSeed();
    try { await N.files.clear(); } catch (e) { /* ignore */ }
    hydrate(seed); persist();
    const cur = N.currentUser(); if (cur && !N.U(cur.id)) N.logout();
  };

  /* ---------- session ---------- */
  N.currentUser = () => { let id = null; try { id = parseInt(localStorage.getItem(LS_SESSION), 10); } catch (e) { /* */ } const u = id ? N.U(id) : null; return u && u.active ? u : null; };
  N.login = function (username, password) {
    const u = N.T('users').find(x => x.username === String(username).trim().toLowerCase());
    if (!u || !u.active || u.pw_hash !== N.hashPw(u.username, password)) return null;
    u.last_login = nowIso(); N.auditLog(u, 'LOGIN', null, '', '', 'client-side demo login'); N.save();
    try { localStorage.setItem(LS_SESSION, String(u.id)); } catch (e) { /* */ }
    return u;
  };
  N.logout = () => { try { localStorage.removeItem(LS_SESSION); } catch (e) { /* */ } };
  N.getLang = () => { try { return localStorage.getItem(LS_LANG) || 'en'; } catch (e) { return 'en'; } };
  N.setLang = l => { try { localStorage.setItem(LS_LANG, l); } catch (e) { /* */ } };

  /* ---------- uploaded files (IndexedDB, with in-memory fallback) ---------- */
  const mem = new Map(); let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const rq = indexedDB.open('noc_demo_files', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('files');
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    }).catch(() => null);
    return dbp;
  }
  const tx = (db, mode, fn) => new Promise((res, rej) => { const t = db.transaction('files', mode), r = fn(t.objectStore('files')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  N.files = {
    async put(id, blob) { mem.set(id, blob); const db = await idb(); if (db) { try { await tx(db, 'readwrite', s => s.put(blob, id)); } catch (e) { /* kept in memory */ } } },
    async get(id) { const db = await idb(); if (db) { try { const b = await tx(db, 'readonly', s => s.get(id)); if (b) return b; } catch (e) { /* */ } } return mem.get(id) || null; },
    async clear() { mem.clear(); const db = await idb(); if (db) await tx(db, 'readwrite', s => s.clear()); },
  };
  N.readFile = f => new Promise((res, rej) => { if (f.arrayBuffer) f.arrayBuffer().then(b => res(new Uint8Array(b)), rej); else { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); } });
})(window);
