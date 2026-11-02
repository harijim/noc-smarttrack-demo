/* NOC SmartTrack - static demo. Business logic ported 1:1 from the Python app
   (rules, bgcalc, loadcalc, timeline, scheduling, notify, audit, workflow, misimport, reports). */
(function (G) {
  'use strict';
  const N = G.NOC, { pyRound, fmtF, fmtG, num, inr, roundUp, addMonths, addDaysD, diffDays, wdayPy, nowIso, istDate, todayIST, fmtD, fmtDMY, sha256, sortedJson } = N;
  class WorkflowError extends Error { }
  N.WorkflowError = WorkflowError;

  /* ---------- table helpers ---------- */
  const T = n => N.DB.T[n];
  const byId = (t, id) => (id == null ? null : T(t).find(r => r.id === id) || null);
  function insert(t, row) {
    const rows = T(t); let id = 0; for (const r of rows) if (r.id > id) id = r.id;
    row.id = id + 1; rows.push(row); return row;
  }
  const U = id => byId('users', id), APP = id => byId('applications', id);
  const docsOf = a => T('documents').filter(d => d.app_id === a.id);
  const bgsOf = a => T('bank_guarantees').filter(g => g.app_id === a.id);
  const certsOf = a => T('noc_certificates').filter(c => c.app_id === a.id);
  const obsOf = a => T('observations').filter(o => o.app_id === a.id);
  const propsOf = a => T('technical_proposals').filter(p => p.app_id === a.id);
  const clarsOf = o => T('clarifications').filter(c => c.observation_id === o.id);
  const divOf = a => byId('divisions', a.division_id);
  const promoterOf = a => U(a.promoter_id);
  const nowMs = () => Date.parse(nowIso());
  const cf = (x, n) => { const s = fmtF(Math.abs(x), n), [i, f] = s.split('.'); return (x < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
  const g = fmtG;

  /* ---------- rules ---------- */
  function cast(v, vt) {
    if (vt === 'int') return Math.trunc(parseFloat(v));
    if (vt === 'float') return parseFloat(v);
    if (vt === 'bool') return ['1', 'true', 'yes', 'on'].indexOf(String(v).toLowerCase()) >= 0;
    return String(v);
  }
  function RS() {
    if (N._rs && N._rsDb === N.DB) return N._rs;
    const v = {}; for (const r of T('rules')) v[r.key] = cast(r.value, r.vtype);
    N._rsDb = N.DB;
    return (N._rs = {
      get(k) { if (!(k in v)) throw new Error('Unknown rule ' + k); return v[k]; },
      ints(k) { return String(v[k]).replace(/ /g, '').split(',').filter(Boolean).map(x => parseInt(x, 10)); },
    });
  }
  N.invalidateRules = () => { N._rs = null; };
  const checklistFor = cons => T('checklist_items').filter(r => r.active && (r.constitution === 'ALL' || r.constitution === cons)).sort((a, b) => a.sort - b.sort);
  function approvingAuthority(kva, rs) {
    const se = rs.get('route.se_limit_kva'), nodal = rs.get('route.nodal_threshold_kva');
    if (kva <= se) return ['DS', 'SE/DS (Circle)'];
    if (kva <= nodal) return ['DS', 'CE/DS (Zone)'];
    return ['NODAL', 'CE/Commercial via Nodal Officer / SE-Regulation'];
  }

  /* ---------- BG calculator ---------- */
  function scdFor(refDate) {
    const rows = T('scd_rates').slice().sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
    if (!rows.length) throw new WorkflowError('No Standard Cost Data rates configured');
    let pick = null; for (const r of rows) if (r.effective_from <= refDate) pick = r;
    return pick || rows[0];
  }
  function computeBg(loadKva, ldCost, rs, scd, ldIncl) {
    const pct = rs.get('bg.pct'), mode = rs.get('bg.mode'), est = rs.get('bg.establishment_pct'), step = rs.get('bg.round_up_to');
    const out = { mode, pct, load_kva: loadKva, scd_effective_from: scd ? scd.effective_from : '', warnings: [] };
    if (mode === 'flat_per_kva') {
      const rate = rs.get('bg.flat_rate_per_kva');
      if (rate <= 0) out.warnings.push('Flat rate per kVA is not configured (Admin > Rules: bg.flat_rate_per_kva) - BG shown as 0.');
      const base = loadKva * rate, raw = base * pct / 100.0;
      Object.assign(out, { lines: [['Flat basis: ' + g(loadKva) + ' kVA x Rs ' + g(rate) + '/kVA', pyRound(base)]], total: pyRound(base), raw, bg: roundUp(raw, step), formula: g(pct) + '% x (kVA x flat rate)' });
      return out;
    }
    const r11 = scd.rate_11kv, slc = scd.rate_slc;
    const conn = pyRound(r11 * loadKva), sl = pyRound(slc * loadKva), ld = pyRound(ldIncl ? ldCost : ldCost * (1 + est / 100.0));
    const total = conn + sl + ld, raw = total * pct / 100.0;
    Object.assign(out, {
      rate_11kv: r11, rate_slc: slc, connectivity: conn, slc: sl, ld_total: ld, total, raw, bg: roundUp(raw, step),
      lines: [['11 kV connectivity (normative): Rs ' + g(r11) + ' x ' + g(loadKva) + ' kVA', conn], ['System loading charges: Rs ' + g(slc) + ' x ' + g(loadKva) + ' kVA', sl], ['LD system estimate incl. ' + g(est) + '% establishment charges', ld]],
      formula: g(pct) + '% x (11 kV connectivity + SLC + LD estimate incl. ' + g(est) + '% establishment); rounded up to Rs ' + Math.trunc(step),
    });
    return out;
  }
  const computeAdditional = (oldBg, nw) => Math.max(0, nw.bg - Math.trunc(oldBg));

  /* ---------- load calculator ---------- */
  const CATS = {
    RES_PLOT: ['Residential plots (area based)', 'res', 'Reg. 12(2)(a)', 'size = plot size (sq yd), qty = number of plots'],
    RES_FLAT: ['Residential flats (covered area based)', 'res', 'Reg. 12(2)(b)', 'size = covered area per flat (sq ft), qty = flats'],
    GH: ['Group housing (area based, no detailed layout)', 'res', 'Reg. 12(2)(c) 37 W/sq yd', 'size = site area (sq yd)'],
    SHOP_S: ['Shops / showrooms / offices up to 50 sq yd', 'comm', 'Reg. 12(2)(d) 10 kW per shop per floor', 'qty = shops, floors'],
    SHOP_L: ['Shops / showrooms / offices above 50 sq yd', 'comm', 'Reg. 12(2)(e) 175 W/sq yd per shop per floor', 'size = area per shop (sq yd), qty = shops, floors'],
    COMMON: ['Dispensary, school, hospital & other common services', 'common', 'Reg. 12(2)(f) 35 W/sq yd', 'size = area (sq yd)'],
    COMMON_SWM: ['SWM site / community centre (working rule: common service)', 'common', 'Reg. 12(2)(f) via working rule - to be ratified', 'size = area (sq yd)'],
    ACTUAL: ['EV charging / STP / water works / street light / lifts / fire fighting (as actual)', 'actual', 'Reg. 12(2)(g) as per actual', 'kw = actual connected kW (each), qty'],
    HOTEL_A: ['Hotel / mall site (area based)', 'comm', 'Reg. 12(2)(h) 290 W/sq yd', 'size = site area (sq yd)'],
    HOTEL_C: ['Hotel / mall (covered area, layout per Pb. Govt norms & FAR)', 'comm', 'Reg. 12(2)(i) 175 W/sq yd', 'size = covered area (sq yd)'],
    IND: ['Industrial / IT park plots (tiered formula)', 'ind', 'Reg. 12(2) industrial table; demand factor built in', 'size = plot size (sq yd), qty = plots'],
  };
  const ACTUAL_SUBS = [['EV', 'EV charging station(s)'], ['STP', 'Sewage treatment plant'], ['WATER', 'Water works'], ['STREET', 'Street lighting'], ['LIFT', 'Lifts'], ['FIRE', 'Fire fighting'], ['OTHER', 'Other (as actual)']];
  const CFG = () => N.CFG;
  const bandV = (bands, x) => { for (const [ub, v] of bands) if (x <= ub) return v; return bands[bands.length - 1][1]; };
  const indKw = size => { for (const [ub, base, w, lb] of CFG().IND_TIERS) if (size <= ub) return base + w * Math.max(0, size - lb) / 1000.0; return 0.0; };
  const fl = (x, d) => { const v = parseFloat(x); return isNaN(v) ? d : v; };
  function lineKw(l) {
    const c = l.cat, size = fl(l.size, 0) || 0, qty = fl(l.qty, 1) || (l.qty === 0 || l.qty === '0' ? 0 : 1), flr = fl(l.floors, 1) || 1, kw = fl(l.kw, 0) || 0, C = CFG();
    const q = (l.qty === '' || l.qty == null) ? 1 : (parseFloat(l.qty) || 0); // python: float(qty or 1) -> 0 stays 0 only if "0" string... keep falsy->1
    const qq = (l.qty ? parseFloat(l.qty) : 1), ff = (l.floors ? parseFloat(l.floors) : 1);
    void q; void qty; void flr;
    switch (c) {
      case 'RES_PLOT': return bandV(C.RES_PLOT_BANDS, size) * qq;
      case 'RES_FLAT': return bandV(C.RES_FLAT_BANDS, size) * qq;
      case 'GH': return size * C.GH_W_SQYD / 1000.0;
      case 'SHOP_S': return C.SHOP_SMALL_KW * qq * ff;
      case 'SHOP_L': return size * C.SHOP_LARGE_W_SQYD / 1000.0 * qq * ff;
      case 'COMMON': case 'COMMON_SWM': return size * C.COMMON_W_SQYD / 1000.0;
      case 'ACTUAL': return kw * qq;
      case 'HOTEL_A': return size * C.HOTEL_AREA_W_SQYD / 1000.0;
      case 'HOTEL_C': return size * C.HOTEL_COVERED_W_SQYD / 1000.0;
      case 'IND': return indKw(size) * qq;
    }
    return 0.0;
  }
  function pySum(a) { // Python 3.12+ float sum (Neumaier compensated)
    let s = 0, c = 0;
    for (const x of a) { const t = s + x; if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x; else c += (x - t) + s; s = t; }
    return s + c;
  }
  function gridLand(kva, rs) {
    const mva = kva / 1000.0;
    if (mva > rs.get('land.grid_mva_2')) return { sqyd: rs.get('land.grid_sqyd_2'), cite: 'Reg. 12(3) para (3rd Amendment): > 50 MVA -> 3000 sq yd' };
    if (mva > rs.get('land.grid_mva_1')) return { sqyd: rs.get('land.grid_sqyd_1'), cite: 'Reg. 12(3): > 10 MVA -> 1500 sq yd (up to 50 MVA)' };
    return { sqyd: 0, cite: 'Reg. 12(3): no grid S/S land at or below 10 MVA' };
  }
  function loadCompute(sheet, rs) {
    const pf = rs.get('load.pf');
    const dfs = { res: rs.get('load.df_residential_pct') / 100, comm: rs.get('load.df_commercial_pct') / 100, common: rs.get('load.df_common_pct') / 100, actual: 1.0, ind: 1.0 };
    const groups = { res: 0.0, comm: 0.0, common: 0.0, actual: 0.0, ind: 0.0 }, rows = [];
    for (const l of (sheet.lines || [])) {
      const c = l.cat; if (!(c in CATS)) continue;
      const k = (c === 'COMMON_SWM' && !rs.get('load.swm_community_as_common')) ? 0.0 : lineKw(l);
      const gr = CATS[c][1]; groups[gr] += k;
      rows.push(Object.assign({}, l, { kw_conn: pyRound(k, 3), group: gr, cite: CATS[c][2], df: dfs[gr], kw_dem: pyRound(k * dfs[gr], 3) }));
    }
    const demand = pySum(Object.keys(dfs).map(k => groups[k] * dfs[k]));
    const kva = pf ? demand / pf : 0;
    const gr3 = {}; for (const k in groups) gr3[k] = pyRound(groups[k], 3);
    return { rows, groups: gr3, dfs, demand_kw: pyRound(demand, 3), pf, kva: pyRound(kva, 2), mva: pyRound(kva / 1000, 3), ref: CFG().LOAD_REF, land: gridLand(kva, rs) };
  }
  function loadVerify(sheet, declared, rs, meta) {
    meta = meta || {};
    const res = loadCompute(sheet, rs), flags = [], lines = sheet.lines || [];
    const cats = new Set(lines.map(l => l.cat)), subs = new Set(lines.filter(l => l.cat === 'ACTUAL').map(l => l.sub));
    const ctype = meta.colony_type || '', tol = rs.get('load.tolerance_pct') / 100.0;
    if (!lines.length) flags.push(['warn', 'No load-sheet lines entered.', '']);
    if (declared && res.kva) {
      const d = (declared - res.kva) / res.kva;
      if (d < -tol) flags.push(['high', 'Declared load ' + fmtF(declared, 1) + ' kVA is ' + fmtF(-d * 100, 1) + '% BELOW the norm-based ' + fmtF(res.kva, 1) + ' kVA - possible omission / under-declaration (BG would be understated).', 'Reg. 12(2), 12(4)']);
      else if (d > tol) flags.push(['warn', 'Declared load ' + fmtF(declared, 1) + ' kVA is ' + fmtF(d * 100, 1) + '% ABOVE the norm-based ' + fmtF(res.kva, 1) + ' kVA - possible inflated area / double counting.', 'Reg. 12(2)']);
      else flags.push(['ok', 'Declared load agrees with the norm-based load within ' + fmtF(tol * 100, 0) + '%.', 'Reg. 12(2)']);
    }
    const plot = meta.plot_area_sqyd, cov = meta.covered_area_sqyd; let far = meta.far;
    if (!far && plot && cov && rs.get('load.far_default_calc')) {
      far = cov / plot;
      flags.push(['info', 'FAR not given - derived as covered area / plot area = ' + fmtF(far, 2) + ' (working rule, to be ratified).', 'Working rule']);
    }
    const mx = rs.get('load.max_far');
    if (far && mx && far > mx) flags.push(['high', 'FAR ' + fmtF(far, 2) + ' exceeds the configured limit ' + fmtF(mx, 2) + ' - covered area may be inflated.', 'Scrutiny aid (limit set by admin)']);
    if (['RESIDENTIAL', 'COMMERCIAL', 'MIXED'].indexOf(ctype) >= 0) {
      if (!subs.has('EV')) flags.push(['warn', "No EV charging load entered. Category (g) is 'as per actual' - confirm EV provision or record NIL.", 'Reg. 12(2)(g); 3rd Amendment Reg. 12(9)']);
      for (const [sub, txt] of [['STREET', 'street lighting'], ['WATER', 'water works'], ['STP', 'STP']])
        if (!subs.has(sub)) flags.push(['info', 'No ' + txt + ' load entered (as-actual item) - confirm not applicable.', 'Reg. 12(2)(g)']);
      if (ctype === 'RESIDENTIAL' && cats.has('RES_FLAT') && !subs.has('LIFT')) flags.push(['warn', 'Flats declared but no lift load entered.', 'Reg. 12(2)(g)']);
      if (!cats.has('COMMON_SWM')) flags.push(['warn', 'No SWM site / community centre entry - confirm none is provided in the layout.', 'Working rule (to be ratified)']);
    }
    if (ctype === 'MIXED' && !['SHOP_S', 'SHOP_L', 'HOTEL_A', 'HOTEL_C'].some(c => cats.has(c)))
      flags.push(['high', 'Mixed-use project but no commercial component in the load sheet - possible omission of commercial load.', 'Reg. 12(2)(d)-(e),(h)-(i)']);
    if (res.land.sqyd) flags.push(['info', 'Grid S/S land of ' + Math.trunc(res.land.sqyd) + ' sq yd required: ' + res.land.cite + '.', res.land.cite]);
    res.flags = flags; return res;
  }

  /* ---------- timeline ---------- */
  const holidaySet = () => new Set(T('holidays').map(h => h.day));
  const isWorking = (d, weekend, hol) => weekend.indexOf(wdayPy(d)) < 0 && !hol.has(d);
  function addDays(start, n, rs, hol) {
    if (rs.get('timeline.day_basis') !== 'working') return addDaysD(start, n);
    const weekend = rs.ints('calendar.weekend_days'); let d = start, left = n;
    while (left > 0) { d = addDaysD(d, 1); if (isWorking(d, weekend, hol)) left--; }
    return d;
  }
  function pausedDays(app, rs) {
    if (!rs.get('timeline.pause_while_with_promoter')) return 0;
    let secs = app.paused_seconds || 0;
    if (app.pause_started_at) secs += Math.max(0, Math.trunc((nowMs() - Date.parse(app.pause_started_at)) / 1000));
    return Math.floor(secs / 86400);
  }
  function _state(due, doneAt, rs, today) {
    today = today || todayIST();
    if (doneAt) { const dd = istDate(doneAt); return { due, remaining: diffDays(dd, due), state: dd > due ? 'done_late' : 'done', done: dd }; }
    const rem = diffDays(today, due);
    return { due, remaining: rem, state: rem < 0 ? 'overdue' : (rem <= rs.get('timeline.priority_flag_days') ? 'approaching' : 'ok'), done: null };
  }
  function clock10(app, rs, hol) {
    if (!app.complete_submission_at) return null;
    const start = istDate(app.complete_submission_at);
    const due = addDays(start, rs.get('timeline.conditional_noc_days') + pausedDays(app, rs), rs, hol);
    const r = _state(due, app.conditional_noc_at, rs); r.start = start; r.paused = !!app.pause_started_at;
    if (['WITHDRAWN', 'REJECTED'].indexOf(app.status) >= 0 && !app.conditional_noc_at) r.state = 'closed';
    return r;
  }
  function clockWindow(app, rs) {
    if (!app.conditional_noc_at) return null;
    const start = istDate(app.conditional_noc_at), due = addMonths(start, rs.get('timeline.technical_window_months'));
    const r = _state(due, app.final_noc_at, rs); r.start = start;
    if (app.status === 'EXPIRED') r.state = 'expired';
    return r;
  }
  function clockOverall(app, rs, hol) {
    const basis = rs.get('timeline.ageing_basis');
    const s = basis === 'application' ? app.received_at : (app.complete_submission_at || null);
    if (!s) return null;
    const start = istDate(s), due = addDays(start, rs.get('timeline.overall_days') + pausedDays(app, rs), rs, hol);
    const end = app.final_noc_at || (['WITHDRAWN', 'REJECTED', 'EXPIRED'].indexOf(app.status) >= 0 ? app.closed_at : null);
    const r = _state(due, end, rs); r.start = start; r.age = diffDays(start, end ? istDate(end) : todayIST());
    return r;
  }
  const allClocks = (app, rs, hol) => { hol = hol || holidaySet(); return { c10: clock10(app, rs, hol), win: clockWindow(app, rs), overall: clockOverall(app, rs, hol) }; };
  function flagOf(app, rs, hol) {
    if (['SUBMITTED', 'RETURNED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(app.status) < 0) return 'none';
    const cs = allClocks(app, rs, hol), st = [];
    for (const k of ['c10', 'win', 'overall']) { const c = cs[k]; if (c && ['ok', 'approaching', 'overdue'].indexOf(c.state) >= 0) st.push(c.state); }
    for (const s of ['overdue', 'approaching', 'ok']) if (st.indexOf(s) >= 0) return s;
    return 'none';
  }

  /* ---------- scheduling ---------- */
  function capacity(day, stage, rs, hol) {
    const ov = T('slot_overrides').find(o => o.day === day && o.stage === stage);
    if (ov) return ov.capacity;
    if (!isWorking(day, rs.ints('calendar.weekend_days'), hol)) return 0;
    return rs.get(stage === 'CONDITIONAL' ? 'slots.conditional_per_day' : 'slots.final_per_day');
  }
  const usedSlots = (day, stage) => T('applications').filter(a => a.slot_date === day && a.slot_stage === stage).length;
  function nextSlot(from, stage, rs) {
    const hol = holidaySet(); let d = from;
    for (let i = 0; i < 120; i++) { const cap = capacity(d, stage, rs, hol); if (cap && usedSlots(d, stage) < cap) return d; d = addDaysD(d, 1); }
    return from;
  }
  function plan(apps, stage, from, dueOf, rs) {
    const hol = holidaySet(), taken = {}, out = [];
    for (const a of apps.slice().sort((x, y) => (x.seq || 1e9) - (y.seq || 1e9))) {
      let d = from;
      for (let i = 0; i < 120; i++) { const cap = capacity(d, stage, rs, hol); if (cap && usedSlots(d, stage) + (taken[d] || 0) < cap) break; d = addDaysD(d, 1); }
      taken[d] = (taken[d] || 0) + 1; const due = dueOf(a);
      out.push({ app: a, day: d, due, atRisk: !!(due && d > due) });
    }
    return out;
  }
  function daySummary(stage, from, n, rs) {
    const hol = holidaySet(), rows = []; n = n || 10;
    for (let i = 0; i < n; i++) { const d = addDaysD(from, i), cap = capacity(d, stage, rs, hol), u = usedSlots(d, stage); rows.push({ day: d, cap, used: u, free: Math.max(0, cap - u) }); }
    return rows;
  }

  /* ---------- audit / notify ---------- */
  const chainHash = (prev, r) => sha256(prev + sortedJson({ ts: r.ts, a: r.actor_name, r: r.actor_role, app: r.app_id, act: r.action, f: r.from_status, t: r.to_status, d: r.detail }));
  function auditLog(actor, action, app, frm, to, detail) {
    const A = T('audit_log'), last = A[A.length - 1], prev = last ? last.hash : '';
    const row = { ts: nowIso(), actor_id: actor ? actor.id : null, actor_name: actor ? actor.name : 'system', actor_role: actor ? actor.role : 'system', app_id: app ? app.id : null, action, from_status: frm || '', to_status: to || '', detail: String(detail || '').slice(0, 2000), prev_hash: prev };
    row.hash = chainHash(prev, row); return insert('audit_log', row);
  }
  function verifyChain() {
    let prev = '', n = 0;
    for (const r of T('audit_log')) { if (r.prev_hash !== prev || r.hash !== chainHash(prev, r)) return [false, r.id]; prev = r.hash; n++; }
    return [true, n];
  }
  function notify(users, kind, title, body, app, dedupe) {
    let sent = 0;
    for (const u of users) {
      if (!u) continue;
      if (dedupe && T('notifications').some(n => n.user_id === u.id && n.dedupe_key === dedupe)) continue;
      insert('notifications', { user_id: u.id, app_id: app ? app.id : null, kind, title: String(title).slice(0, 200), body: body || '', created_at: nowIso(), read_at: null, dedupe_key: dedupe || '' });
      sent++;
    }
    return sent;
  }
  const roleUsers = (role, divId) => T('users').filter(u => u.role === role && u.active && !(divId && role === 'ds' && u.division_id !== divId));
  function nextCounter(name) {
    let c = T('counters').find(x => x.name === name); if (!c) { c = { name, value: 0 }; T('counters').push(c); }
    c.value += 1; return c.value;
  }
  const istYear = () => parseInt(todayIST().slice(0, 4), 10);

  /* ---------- visibility ---------- */
  function visibleApps(user) {
    let q = T('applications');
    if (user.role === 'promoter') q = q.filter(a => a.promoter_id === user.id);
    else if (user.role === 'ds') q = q.filter(a => a.division_id === user.division_id && a.status !== 'DRAFT');
    else q = q.filter(a => a.status !== 'DRAFT');
    return q.slice().sort((a, b) => ((a.seq == null ? 1e9 : a.seq) - (b.seq == null ? 1e9 : b.seq)) || (b.id - a.id));
  }
  function canView(user, app) {
    if (user.role === 'promoter') return app.promoter_id === user.id;
    if (app.status === 'DRAFT') return false;
    if (user.role === 'ds') return app.division_id === user.division_id;
    return true;
  }

  /* ---------- workflow ---------- */
  function refreshBg(app, rs) {
    rs = rs || RS();
    const ref = app.received_at ? istDate(app.received_at) : todayIST(), scd = scdFor(ref);
    const calc = computeBg(app.estimated_load_kva || 0, app.ld_cost || 0, rs, scd);
    app.bg_required = calc.bg; app.bg_calc = calc; return calc;
  }
  const routeFor = (app, rs) => approvingAuthority(app.estimated_load_kva || 0, rs);
  function currentDocs(app, category) {
    category = category || 'APPLICATION'; const o = {};
    for (const d of docsOf(app)) if (d.category === category && d.is_current) o[d.code] = d;
    return o;
  }
  function readiness(app, rs) {
    rs = rs || RS(); const missing = [], docs = currentDocs(app);
    for (const it of checklistFor(app.constitution)) if (it.mandatory && !(it.code in docs)) missing.push('Document: ' + it.label);
    if (!app.project_name || !app.location) missing.push('Project name and location');
    if ((app.estimated_load_kva || 0) <= 0) missing.push('Estimated load (kVA) - use the load sheet or enter directly');
    if ((app.ld_cost || 0) <= 0 && rs.get('bg.mode') === 'reg_12_4') missing.push('Estimated cost of LD system');
    if (!app.fee_ref) missing.push('NOC fee receipt / reference');
    const bgs = bgsOf(app).filter(x => x.kind === 'BG35' && x.status !== 'REJECTED');
    if (!bgs.length) missing.push('Bank guarantee details and BG copy (35%)');
    else {
      const tot = pySum(bgs.map(x => x.amount));
      if (tot + 0.5 < (app.bg_required || 0)) missing.push('BG amount ' + inr(tot) + ' is below the required ' + inr(app.bg_required));
      if (!bgs.some(x => x.doc_id)) missing.push('Scanned copy of the BG');
    }
    return missing;
  }
  function setPause(app, on) {
    const now = nowIso();
    if (on && !app.pause_started_at) app.pause_started_at = now;
    else if (!on && app.pause_started_at) { app.paused_seconds = (app.paused_seconds || 0) + Math.trunc((Date.parse(now) - Date.parse(app.pause_started_at)) / 1000); app.pause_started_at = null; }
  }
  function fcfsBlockers(app, stage) {
    let out = T('applications').filter(a => a.status === (stage === 'CONDITIONAL' ? 'FORWARDED' : 'CONDITIONAL_NOC') && a.seq != null && app.seq != null && a.seq < app.seq && a.id !== app.id).sort((a, b) => a.seq - b.seq);
    if (stage === 'FINAL') out = out.filter(a => !finalMissing(a).length);
    return out;
  }
  function fcfsGate(app, stage, rs, actor, reason) {
    const mode = rs.get('fcfs.enforcement'); if (mode === 'off') return '';
    const b = fcfsBlockers(app, stage); if (!b.length) return '';
    const msg = 'FCFS: earlier file(s) ready and waiting: ' + b.slice(0, 5).map(x => x.app_no).join(', ');
    if (mode === 'strict' && actor.role !== 'admin') throw new WorkflowError(msg + '. Process them first (strict FCFS).');
    auditLog(actor, 'FCFS_OUT_OF_ORDER', app, '', '', msg + (reason ? ' | reason: ' + reason : ''));
    return msg;
  }
  function submit(app, actor) {
    const rs = RS();
    if (['DRAFT', 'RETURNED'].indexOf(app.status) < 0) throw new WorkflowError('Application is not in a submittable state');
    refreshBg(app, rs);
    const miss = readiness(app, rs);
    if (miss.length) throw new WorkflowError('Cannot submit - incomplete: ' + miss.join('; '));
    const frm = app.status, now = nowIso(); let act;
    if (app.seq == null) {
      app.seq = nextCounter('fcfs'); app.app_no = 'NS/' + istYear() + '/' + String(app.seq).padStart(5, '0');
      app.received_at = now; app.complete_submission_at = now; app.route = routeFor(app, rs)[0]; app.priority = false; act = 'SUBMIT';
    } else { setPause(app, false); act = 'RESUBMIT'; }
    app.status = 'SUBMITTED'; app.return_remark = '';
    auditLog(actor, act, app, frm, 'SUBMITTED', 'FCFS #' + app.seq + ' ' + app.app_no + '; load ' + g(app.estimated_load_kva) + ' kVA; BG required ' + inr(app.bg_required));
    notify(roleUsers('ds', app.division_id), 'submitted', 'New application ' + app.app_no, app.project_name + ' (' + g(app.estimated_load_kva) + ' kVA) - 10-day clock started.', app);
    notify([actor], 'ack', 'Application ' + app.app_no + ' received', 'FCFS no. ' + app.seq + '. Timestamp ' + istDate(now) + '.', app);
    return app;
  }
  function withdraw(app, actor, reason) {
    if (['DRAFT', 'SUBMITTED', 'RETURNED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(app.status) < 0) throw new WorkflowError('Cannot withdraw in this state');
    const frm = app.status; app.status = 'WITHDRAWN'; app.withdraw_reason = reason; app.closed_at = nowIso(); setPause(app, false);
    auditLog(actor, 'WITHDRAW', app, frm, 'WITHDRAWN', reason);
  }
  function reviewDoc(doc, actor, status, remark) {
    if (['VERIFIED', 'INCOMPLETE'].indexOf(status) < 0) throw new WorkflowError('Bad status');
    if (status === 'INCOMPLETE' && !String(remark).trim()) throw new WorkflowError('A remark is required when marking a document incomplete');
    doc.status = status; doc.review_remark = String(remark).trim(); doc.reviewed_by = actor.id; doc.reviewed_at = nowIso();
    auditLog(actor, 'DOC_' + status, APP(doc.app_id), '', '', (doc.label || doc.code) + ': ' + remark);
  }
  function returnToPromoter(app, actor, remark) {
    if (['SUBMITTED', 'FORWARDED'].indexOf(app.status) < 0) throw new WorkflowError('Only files under scrutiny can be returned');
    if (!String(remark).trim()) throw new WorkflowError('A remark is required');
    const frm = app.status; app.status = 'RETURNED'; app.return_remark = String(remark).trim(); setPause(app, true);
    auditLog(actor, 'RETURN', app, frm, 'RETURNED', remark);
    notify([promoterOf(app)], 'returned', app.app_no + ' returned for clarification', remark, app);
  }
  function forward(app, actor) {
    const rs = RS();
    if (app.status !== 'SUBMITTED') throw new WorkflowError('Only submitted files can be forwarded');
    const docs = currentDocs(app), need = checklistFor(app.constitution).filter(i => i.mandatory);
    const bad = need.filter(i => !(i.code in docs) || docs[i.code].status !== 'VERIFIED').map(i => i.label);
    if (bad.length) throw new WorkflowError('Verify these documents first: ' + bad.join('; '));
    app.status = 'FORWARDED'; app.docs_complete_at = nowIso(); app.slot_stage = 'CONDITIONAL'; app.slot_date = nextSlot(todayIST(), 'CONDITIONAL', rs);
    auditLog(actor, 'FORWARD', app, 'SUBMITTED', 'FORWARDED', 'Documents verified; processing slot suggested ' + app.slot_date);
    notify(roleUsers('commercial'), 'forwarded', app.app_no + ' forwarded for BG verification / Conditional NOC', app.project_name + ', ' + g(app.estimated_load_kva) + ' kVA. Suggested slot ' + app.slot_date + '.', app);
  }
  function verifyBg(bg, actor, ok, remark, bankRef) {
    remark = remark || ''; bankRef = bankRef || '';
    if (ok === false && !remark.trim()) throw new WorkflowError('A remark is required to reject a BG');
    bg.status = ok ? 'VERIFIED' : 'REJECTED'; bg.remark = remark.trim(); bg.bank_confirmation_ref = bankRef.trim(); bg.verified_by = actor.id; bg.verified_at = nowIso();
    const app = APP(bg.app_id);
    auditLog(actor, ok ? 'BG_VERIFIED' : 'BG_REJECTED', app, '', '', bg.kind + ' ' + bg.bg_no + ' ' + inr(bg.amount) + ' ' + bankRef + ' ' + remark);
    if (!ok) notify([promoterOf(app)], 'bg_rejected', 'BG ' + bg.bg_no + ' rejected', remark, app);
  }
  const verifiedBgTotal = (app, kinds) => { kinds = kinds || ['BG35']; return pySum(bgsOf(app).filter(x => kinds.indexOf(x.kind) >= 0 && x.status === 'VERIFIED').map(x => x.amount)); };

  /* NOC conditions (text identical to the Python workflow) */
  function condsConditional(tempKw, due, rs) {
    const months = rs.get('timeline.conditional_validity_months');
    return [
      'This Conditional NOC is issued on the basis of the application, documents and the 35% bank guarantee verified by PSPCL and is valid up to ' + fmtDMY(due) + ' (' + months + ' months) [per PSPCL requirement document; see Rules & References].',
      'A temporary connection for site/camp office and related temporary needs (excluding development works) may be released up to ' + g(tempKw) + ' kW, subject to Supply Code 2024 Reg. 12(5) (smart prepaid meter).',
      'Within ' + rs.get('timeline.technical_window_months') + ' months the promoter shall complete the technical proposal process, load verification and furnish any clarification / additional BG sought by PSPCL, failing which this NOC lapses.',
      'The bank guarantee shall remain valid for the period of the NOC and shall be extended as required by Supply Code 2024 Reg. 12(4).',
      'This Conditional NOC does not authorise erection or energisation of the LD system. The Final NOC will be issued after technical and load verification.',
    ];
  }
  function condsFinal(app, load, valid, rs) {
    const land = gridLand(load, rs);
    const c = [
      "Final NOC for electrical connectivity to the colony/complex '" + app.project_name + "' for an estimated load of " + cf(load, 2) + ' kVA, valid up to ' + fmtDMY(valid) + ' (5 years or licence validity, whichever is earlier - Supply Code 2024 Reg. 12(4)).',
      'The promoter shall erect the Local Distribution (LD) system as per the electrical layout plan approved by PSPCL, within the timeline committed.',
      'The bank guarantee(s) shall remain valid for the NOC period and shall be extended for each block of 3 years with the Standard Cost Data increase (Reg. 12(4)) till completion of the LD system and deposit of all charges including System Loading Charges.',
      'Connectivity charges (11 kV normative cost) and System Loading Charges shall be deposited as per Reg. 12(3) at the Standard Cost Data prevailing at the time of deposit.',
    ];
    if (land.sqyd) c.push('Land of ' + g(land.sqyd) + ' sq. yards with suitable dimensions shall be provided at collector rates for a grid sub-station with right of way (' + land.cite + ').');
    if (app.scheme === 'SINGLE_POINT') c.push('Performance bank guarantee of ' + g(rs.get('bg.perf_pct')) + '% of the estimated LD cost shall be furnished under the single point supply agreement (3rd Amendment / Model Agreement).');
    return c;
  }
  const ROLE_NAME = { commercial: 'Commercial / Nodal Officer', admin: 'CE Commercial', ds: 'DS Division Officer' };
  function certSnapshot(app, cert, rs) {
    const bgs = bgsOf(app).filter(x => x.status === 'VERIFIED').map(x => ({ bg_no: x.bg_no, bank: x.bank, amount: x.amount, valid_upto: x.valid_upto ? fmtDMY(x.valid_upto) : '-', kind: x.kind === 'BG35' ? '35% BG' : 'Additional' }));
    const load = app.verified_load_kva || app.estimated_load_kva;
    return { noc_no: cert.noc_no, kind: cert.kind, app_no: app.app_no, project: app.project_name, load_kva: load, bgs, issued: cert.issued_at.replace('Z', ''), valid_upto: cert.valid_upto || '', rules: { bg_pct: rs.get('bg.pct'), mode: rs.get('bg.mode') } };
  }
  function makeCert(app, actor, kind, validUpto, conditions) {
    const rs = RS(), n = nextCounter('noc_' + kind.toLowerCase());
    const nocNo = 'PSPCL/NOC/' + (kind === 'CONDITIONAL' ? 'C' : 'F') + '/' + istYear() + '/' + String(n).padStart(4, '0');
    const cert = { app_id: app.id, kind, noc_no: nocNo, code: N.randHex(20), issued_at: nowIso(), valid_upto: validUpto, issued_by: actor.id, status: 'VALID' };
    const snap = certSnapshot(app, cert, rs);
    cert.snapshot = snap; cert.fingerprint = sha256(sortedJson(snap)); cert.conditions = conditions;
    cert.authority = approvingAuthority(snap.load_kva, rs)[1]; cert.issuer = actor.name; cert.issuer_desig = actor.designation || ROLE_NAME[actor.role] || '';
    return insert('noc_certificates', cert);
  }
  function issueConditional(app, actor, tempKw, reason) {
    const rs = RS(); tempKw = tempKw || 0;
    if (app.status !== 'FORWARDED') throw new WorkflowError('File must be forwarded by DS (documents verified) before a Conditional NOC');
    if (verifiedBgTotal(app) + 0.5 < app.bg_required) throw new WorkflowError('Verified BG (' + inr(verifiedBgTotal(app)) + ') is below the required ' + inr(app.bg_required) + ' - verify the BG first');
    const cap = rs.get('temp.max_kw');
    if (rs.get('temp.enforce_cap') && tempKw > cap) throw new WorkflowError('Temporary load ' + g(tempKw) + ' kW exceeds the cap of ' + g(cap) + ' kW (Supply Code 2024 Reg. 12(5))');
    const warn = fcfsGate(app, 'CONDITIONAL', rs, actor, reason);
    const today = todayIST(), capDay = capacity(today, 'CONDITIONAL', rs, holidaySet());
    const issuedToday = T('noc_certificates').filter(c => c.kind === 'CONDITIONAL' && c.issued_at.slice(0, 10) === nowIso().slice(0, 10)).length;
    if (rs.get('slots.enforce_capacity') && capDay && issuedToday >= capDay && actor.role !== 'admin') throw new WorkflowError('Daily capacity for Conditional NOC (' + capDay + ') reached for today');
    const due = addMonths(today, rs.get('timeline.conditional_validity_months'));
    const cert = makeCert(app, actor, 'CONDITIONAL', due, condsConditional(tempKw, due, rs));
    app.status = 'CONDITIONAL_NOC'; app.conditional_noc_at = nowIso(); app.temp_load_kw = tempKw; app.slot_date = null; app.slot_stage = '';
    cert.temp_kw = tempKw;
    auditLog(actor, 'ISSUE_CONDITIONAL_NOC', app, 'FORWARDED', 'CONDITIONAL_NOC', cert.noc_no + '; temp ' + g(tempKw) + ' kW; window to ' + due + '; ' + warn);
    notify([promoterOf(app)].concat(roleUsers('ds', app.division_id)), 'cond_noc', 'Conditional NOC issued: ' + app.app_no, cert.noc_no + ' valid to ' + fmtD(due) + '. Technical window ends the same day.', app);
    return [cert, warn];
  }
  const needWindow = app => { if (app.status !== 'CONDITIONAL_NOC') throw new WorkflowError('Only available while the Conditional NOC window is open'); };
  function submitTech(app, actor, feeder, dtPlan, load, remarks, doc) {
    needWindow(app); const v = propsOf(app).length + 1;
    const tp = insert('technical_proposals', { app_id: app.id, version: v, feeder_source: feeder, dt_plan: dtPlan, proposed_load_kva: load || null, remarks: remarks || '', doc_id: doc ? doc.id : null, status: 'SUBMITTED', review_remark: '', submitted_by: actor.id, submitted_at: nowIso() });
    app.tech_submitted_at = nowIso(); app.tech_accepted_at = null;
    auditLog(actor, 'TECH_PROPOSAL_SUBMITTED', app, '', '', 'v' + v + '; feeder ' + feeder + '; load ' + (load == null ? 'None' : (Number.isInteger(load) ? load.toFixed(1) : load)));
    notify(roleUsers('commercial'), 'tech', 'Technical proposal v' + v + ': ' + app.app_no, feeder, app);
    return tp;
  }
  function reviewTech(tp, actor, accept, remark) {
    const app = APP(tp.app_id); needWindow(app); remark = remark || '';
    if (!accept && !remark.trim()) throw new WorkflowError('Remark required when returning a technical proposal');
    tp.status = accept ? 'ACCEPTED' : 'RETURNED'; tp.review_remark = remark; app.tech_accepted_at = accept ? nowIso() : null;
    auditLog(actor, accept ? 'TECH_ACCEPTED' : 'TECH_RETURNED', app, '', '', 'v' + tp.version + ': ' + remark);
    notify(roleUsers('ds', app.division_id), 'tech_review', 'Technical proposal v' + tp.version + ' ' + (accept ? 'accepted' : 'returned') + ': ' + app.app_no, remark, app);
    maybeFinalSlot(app);
  }
  function raiseObservation(app, actor, category, text) {
    needWindow(app); if (!String(text).trim()) throw new WorkflowError('Observation text required');
    const n = obsOf(app).length + 1;
    const ob = insert('observations', { app_id: app.id, no: n, category, text: text.trim(), status: 'OPEN', raised_by: actor.id, raised_at: nowIso(), closed_at: null, close_remark: '' });
    auditLog(actor, 'OBSERVATION_RAISED', app, '', '', '#' + n + ' [' + category + '] ' + text.trim().slice(0, 200));
    notify([promoterOf(app)], 'observation', 'Observation #' + n + ' on ' + app.app_no, text, app);
    return ob;
  }
  function clarify(ob, actor, text, doc) {
    const app = APP(ob.app_id); needWindow(app);
    if (ob.status === 'CLOSED') throw new WorkflowError('Observation already closed');
    if (!String(text).trim()) throw new WorkflowError('Clarification text required');
    insert('clarifications', { observation_id: ob.id, text: text.trim(), doc_id: doc ? doc.id : null, by_user: actor.id, at: nowIso() });
    ob.status = 'CLARIFIED';
    auditLog(actor, 'CLARIFICATION', app, '', '', 'obs #' + ob.no + ': ' + text.slice(0, 200));
    notify(roleUsers('commercial'), 'clarified', 'Clarification received on ' + app.app_no + ' (obs #' + ob.no + ')', text, app);
  }
  function closeObservation(ob, actor, remark, reopen) {
    const app = APP(ob.app_id); needWindow(app); remark = remark || '';
    if (reopen) {
      ob.status = 'OPEN'; auditLog(actor, 'OBSERVATION_REOPENED', app, '', '', '#' + ob.no + ': ' + remark);
      notify([promoterOf(app)], 'observation', 'Observation #' + ob.no + ' needs further clarification', remark, app);
    } else {
      ob.status = 'CLOSED'; ob.closed_at = nowIso(); ob.close_remark = remark; auditLog(actor, 'OBSERVATION_CLOSED', app, '', '', '#' + ob.no + ': ' + remark); maybeFinalSlot(app);
    }
  }
  function verifyLoad(app, actor, kva, ldCost, remark) {
    needWindow(app); const rs = RS(); remark = remark || '';
    if (kva <= 0) throw new WorkflowError('Verified load must be positive');
    app.verified_load_kva = kva; app.verified_ld_cost = ldCost || app.ld_cost; app.load_verified_at = nowIso();
    const nw = computeBg(kva, app.verified_ld_cost, rs, scdFor(istDate(app.received_at)));
    const extra = rs.get('bg.addl_on_higher_load') ? computeAdditional(app.bg_required, nw) : 0;
    app.addl_bg_required = extra; app.addl_bg_calc = nw;
    auditLog(actor, 'LOAD_VERIFIED', app, '', '', 'verified ' + g(kva) + ' kVA vs declared ' + g(app.estimated_load_kva) + '; BG on verified ' + inr(nw.bg) + '; additional BG ' + inr(extra) + '. ' + remark);
    if (extra > 0) notify([promoterOf(app)], 'addl_bg', 'Additional BG of ' + inr(extra) + ' required: ' + app.app_no, 'Verified load ' + g(kva) + ' kVA exceeds declared ' + g(app.estimated_load_kva) + ' kVA. Furnish additional BG within the technical window.', app);
    maybeFinalSlot(app); return extra;
  }
  function maybeFinalSlot(app) {
    if (app.status === 'CONDITIONAL_NOC' && !finalMissing(app).length && !app.slot_date) {
      app.slot_stage = 'FINAL'; app.slot_date = nextSlot(todayIST(), 'FINAL', RS());
      notify(roleUsers('commercial'), 'ready_final', 'Ready for Final NOC: ' + app.app_no, 'Suggested slot ' + app.slot_date + '.', app);
    }
  }
  function finalMissing(app) {
    if (app.status !== 'CONDITIONAL_NOC') return ['Not in Conditional NOC window'];
    const miss = [];
    if (!app.tech_accepted_at) miss.push('DS technical proposal not accepted');
    if (!app.load_verified_at) miss.push('Load verification not done');
    const open = obsOf(app).filter(o => o.status !== 'CLOSED'); if (open.length) miss.push(open.length + ' observation(s) not closed');
    if (app.addl_bg_required > 0 && verifiedBgTotal(app, ['ADDL']) + 0.5 < app.addl_bg_required) miss.push('Additional BG ' + inr(app.addl_bg_required) + ' not furnished and verified');
    return miss;
  }
  function issueFinal(app, actor, reason) {
    const rs = RS(), miss = finalMissing(app);
    if (miss.length) throw new WorkflowError('Final NOC blocked: ' + miss.join('; '));
    const warn = fcfsGate(app, 'FINAL', rs, actor, reason), today = todayIST(), win = clockWindow(app, rs);
    if (win && win.state === 'overdue') throw new WorkflowError('Technical window has lapsed; file cannot receive a Final NOC (extend via Admin override)');
    let valid = addMonths(today, 12 * rs.get('noc.validity_years_max'));
    if (app.licence_valid_upto && app.licence_valid_upto < valid) valid = app.licence_valid_upto;
    if (rs.get('bg.validity_basis')) {
      const short = bgsOf(app).filter(x => x.status === 'VERIFIED' && (!x.valid_upto || x.valid_upto < valid)).map(x => x.bg_no);
      if (short.length) throw new WorkflowError('BG validity must cover the NOC validity (' + fmtDMY(valid) + '): extend ' + short.join(', '));
    }
    const load = app.verified_load_kva || app.estimated_load_kva;
    const conds = condsFinal(app, load, valid, rs);
    for (const c of certsOf(app)) if (c.status === 'VALID') c.status = 'SUPERSEDED';
    const cert = makeCert(app, actor, 'FINAL', valid, conds);
    app.status = 'FINAL_NOC'; app.final_noc_at = nowIso(); app.closed_at = nowIso(); app.slot_date = null; app.slot_stage = '';
    auditLog(actor, 'ISSUE_FINAL_NOC', app, 'CONDITIONAL_NOC', 'FINAL_NOC', cert.noc_no + '; valid to ' + valid + '; ' + warn);
    notify([promoterOf(app)].concat(roleUsers('ds', app.division_id)), 'final_noc', 'Final NOC issued: ' + app.app_no, cert.noc_no + ' valid to ' + fmtD(valid) + '.', app);
    return [cert, warn];
  }
  function reject(app, actor, reason) {
    if (['SUBMITTED', 'FORWARDED', 'RETURNED', 'CONDITIONAL_NOC'].indexOf(app.status) < 0) throw new WorkflowError('Cannot reject in this state');
    if (!String(reason).trim()) throw new WorkflowError('Reason required');
    const frm = app.status; app.status = 'REJECTED'; app.closed_at = nowIso(); app.withdraw_reason = reason; setPause(app, false);
    auditLog(actor, 'REJECT', app, frm, 'REJECTED', reason);
    notify([promoterOf(app)], 'rejected', 'Application ' + app.app_no + ' rejected', reason, app);
  }
  function revokeCert(cert, actor, reason) {
    if (!String(reason).trim()) throw new WorkflowError('Reason required');
    cert.status = 'REVOKED'; auditLog(actor, 'REVOKE_NOC', APP(cert.app_id), '', '', cert.noc_no + ': ' + reason);
  }
  function runPeriodic(actor) {
    const rs = RS(), hol = holidaySet(); let expired = 0, reminders = 0;
    for (const a of T('applications').filter(x => ['SUBMITTED', 'RETURNED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(x.status) >= 0)) {
      const cs = allClocks(a, rs, hol);
      if (a.status === 'CONDITIONAL_NOC' && cs.win && cs.win.state === 'overdue') {
        a.status = 'EXPIRED'; a.closed_at = nowIso();
        auditLog(actor, 'WINDOW_EXPIRED', a, 'CONDITIONAL_NOC', 'EXPIRED', 'Technical window ended ' + cs.win.due);
        notify([promoterOf(a)].concat(roleUsers('ds', a.division_id), roleUsers('commercial')), 'expired', 'Window expired: ' + a.app_no, 'Technical window lapsed without Final NOC.', a);
        expired++; continue;
      }
      const targets = roleUsers('ds', a.division_id).concat(roleUsers('commercial'));
      const spec = [['c10', '10-day', 'reminder.days_before_10day', ['SUBMITTED', 'FORWARDED', 'RETURNED'].indexOf(a.status) >= 0], ['win', '3-month window', 'reminder.days_before_window', a.status === 'CONDITIONAL_NOC'], ['overall', '45-day limit', 'reminder.days_before_45day', true]];
      for (const [key, label, rule, active] of spec) {
        const c = cs[key]; if (!c || !active || ['done', 'done_late', 'closed'].indexOf(c.state) >= 0) continue;
        const who = targets.concat(key === 'win' ? [promoterOf(a)] : []);
        if (c.state === 'overdue') { reminders += notify(who, 'overdue', 'OVERDUE ' + label + ': ' + a.app_no, a.project_name + ': due ' + fmtD(c.due) + ', ' + (-c.remaining) + ' day(s) late.', a, 'over:' + a.id + ':' + key); continue; }
        const hit = rs.ints(rule).filter(d => c.remaining <= d);
        if (hit.length) { const d = Math.min(...hit); reminders += notify(who, 'reminder', label + ' - ' + c.remaining + ' day(s) left: ' + a.app_no, a.project_name + ': due ' + fmtD(c.due) + '.', a, 'rem:' + a.id + ':' + key + ':' + d); }
      }
    }
    return [expired, reminders];
  }

  /* ---------- upload validation ---------- */
  const MAGIC = { pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], jpg: [[0xff, 0xd8, 0xff]], jpeg: [[0xff, 0xd8, 0xff]], png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], xlsx: [[0x50, 0x4b, 3, 4]], xls: [[0xd0, 0xcf, 0x11, 0xe0]] };
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
  class UploadError extends WorkflowError { }
  function safeName(name) {
    name = String(name || 'file').replace(/\\/g, '/').split('/').pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[ .]+|[ .]+$/g, '') || 'file';
    return name.slice(0, 120);
  }
  function validateUpload(filename, bytes, rs) {
    if (!bytes || !bytes.length) throw new UploadError('Empty file');
    const mx = rs.get('upload.max_mb') * 1024 * 1024;
    if (bytes.length > mx) throw new UploadError('File too large (max ' + rs.get('upload.max_mb') + ' MB)');
    const name = safeName(filename), ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : '';
    const allowed = rs.get('upload.allowed_ext').split(',').map(e => e.trim().toLowerCase());
    if (allowed.indexOf(ext) < 0 || !(ext in MAGIC)) throw new UploadError('File type .' + (ext || '?') + ' not allowed (allowed: ' + allowed.slice().sort().join(', ') + ')');
    if (!MAGIC[ext].some(sig => sig.every((b, i) => bytes[i] === b))) throw new UploadError('File content does not match .' + ext + ' type');
    return [name, MIME[ext], sha256(bytes)];
  }

  /* ---------- MIS import ---------- */
  const MIS_COLS = ['APP_NO', 'DATED', 'APP_TYPE', 'PROJECT_NAME', 'CONSTITUTION', 'PR_LOAD', 'PR_CIRCLE', 'APP_STATUS', 'PENDING_TASK', 'RESPONSIBLE', 'DAYS_ALLOTED', 'DAYS_ELAPSED'];
  function misRowsFromMatrix(rows) {
    rows = rows.filter(r => r); if (!rows.length) throw new WorkflowError('No rows found');
    const hdr = rows[0].map(x => String(x == null ? '' : x).trim().toUpperCase());
    const missing = ['APP_NO', 'APP_STATUS'].filter(c => hdr.indexOf(c) < 0);
    if (missing.length) throw new WorkflowError('Missing MIS columns: ' + missing.join(', '));
    return rows.slice(1).filter(r => r.some(x => String(x == null ? '' : x).trim())).map(r => { const o = {}; hdr.forEach((h, i) => { o[h] = String(r[i] == null ? '' : r[i]); }); return o; });
  }
  function misDate(s) {
    s = String(s || '').trim(); let m;
    if ((m = /^(\d{1,2})-(\d{1,2})-(\d{2})$/.exec(s))) { const y = 2000 + (+m[3] > 68 ? -100 : 0) + +m[3]; return chk(y, +m[2], +m[1]); }
    if ((m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s))) return chk(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return chk(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return chk(+m[3], +m[2], +m[1]);
    return null;
    function chk(y, mo, d) { const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? N.isoDate(dt) : null; }
  }
  const misNum = (s, int) => { const v = parseFloat(String(s == null ? '' : s).replace(/,/g, '')); return isNaN(v) ? null : (int ? Math.trunc(v) : v); };
  function misImport(rows, batch) {
    let n = 0;
    for (const r of rows) {
      insert('mis_records', { batch, APP_NO: (r.APP_NO || '').trim(), DATED: misDate(r.DATED), APP_TYPE: r.APP_TYPE || '', PROJECT_NAME: (r.PROJECT_NAME || '').slice(0, 200), CONSTITUTION: r.CONSTITUTION || '', PR_LOAD: misNum(r.PR_LOAD), PR_CIRCLE: r.PR_CIRCLE || '', APP_STATUS: r.APP_STATUS || '', PENDING_TASK: r.PENDING_TASK || '', RESPONSIBLE: r.RESPONSIBLE || '', DAYS_ALLOTED: misNum(r.DAYS_ALLOTED, true), DAYS_ELAPSED: misNum(r.DAYS_ELAPSED, true), imported_at: nowIso() });
      n++;
    }
    return n;
  }
  function misSummarize(batch) {
    const rows = T('mis_records').filter(r => r.batch === batch), bs = {}, br = {}, over = [];
    for (const r of rows) {
      bs[r.APP_STATUS] = (bs[r.APP_STATUS] || 0) + 1;
      if (r.RESPONSIBLE && r.RESPONSIBLE !== 'NA') br[r.RESPONSIBLE] = (br[r.RESPONSIBLE] || 0) + 1;
      if (r.DAYS_ALLOTED && r.DAYS_ELAPSED && r.DAYS_ELAPSED > r.DAYS_ALLOTED && ['', 'NA'].indexOf(r.RESPONSIBLE) < 0) over.push(r);
    }
    over.sort((a, b) => (b.DAYS_ELAPSED - b.DAYS_ALLOTED) - (a.DAYS_ELAPSED - a.DAYS_ALLOTED));
    const sorted = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { total: rows.length, by_status: sorted(bs), by_resp: sorted(br), over: over.slice(0, 50) };
  }

  /* ---------- reports ---------- */
  const STAGE_OF = a => (['SUBMITTED', 'RETURNED'].indexOf(a.status) >= 0 ? 'Scrutiny' : a.status === 'FORWARDED' ? 'Commercial' : a.status === 'CONDITIONAL_NOC' ? 'Technical window' : N.CFG.STATUS_LABEL[a.status]);
  const REPORT_HEAD = ['FCFS Seq', 'Application No', 'Received (IST)', 'Project', 'Promoter', 'Constitution', 'Division', 'Load kVA', 'Route', 'Approving authority', 'Status', 'Stage', 'BG required (Rs)', 'BG verified (Rs)', '10-day due', '10-day state', 'Conditional NOC (IST)', 'Window due', 'Final NOC (IST)', '45-day due', 'Age (days)', 'Flag'];
  function safeCell(v) { return typeof v === 'string' && v.length && '=+-@\t\r'.indexOf(v[0]) >= 0 ? "'" + v : v; }
  const fdt = s => (s ? istDate(s) + ' ' + N.istParts(s).toISOString().slice(11, 16) : '');
  function reportRows(apps, rs) {
    const hol = holidaySet();
    return apps.map(a => {
      const cs = allClocks(a, rs, hol), pr = promoterOf(a), dv = divOf(a), c10 = cs.c10, win = cs.win, ov = cs.overall;
      return [a.seq == null ? '' : a.seq, a.app_no || '', a.received_at ? fdt(a.received_at) : '', safeCell(a.project_name), safeCell((pr && (pr.org_name || pr.name)) || ''), a.constitution, dv ? dv.name : '', a.estimated_load_kva, a.route || '', a.route ? approvingAuthority(a.estimated_load_kva || 0, rs)[1] : '', N.CFG.STATUS_LABEL[a.status], STAGE_OF(a), a.bg_required, verifiedBgTotal(a), c10 ? c10.due : '', c10 ? c10.state : '', a.conditional_noc_at ? fdt(a.conditional_noc_at) : '', win ? win.due : '', a.final_noc_at ? fdt(a.final_noc_at) : '', ov ? ov.due : '', ov ? ov.age : '', flagOf(a, rs, hol)];
    });
  }
  function filterApps(user, q, rs) {
    rs = rs || RS();
    let apps = visibleApps(user).filter(a => a.seq != null);
    const se = rs.get('route.se_limit_kva'), nd = rs.get('route.nodal_threshold_kva');
    if (q.status) apps = apps.filter(a => a.status === q.status);
    if (q.division) apps = apps.filter(a => String(a.division_id) === String(q.division));
    if (q.d_from) apps = apps.filter(a => a.received_at && istDate(a.received_at) >= q.d_from);
    if (q.d_to) apps = apps.filter(a => a.received_at && istDate(a.received_at) <= q.d_to);
    const kv = a => a.estimated_load_kva || 0;
    if (q.band === 'le2000') apps = apps.filter(a => kv(a) <= se);
    else if (q.band === 'mid') apps = apps.filter(a => kv(a) > se && kv(a) <= nd);
    else if (q.band === 'gt4000') apps = apps.filter(a => kv(a) > nd);
    return apps;
  }

  Object.assign(N, { T, byId, insert, U, APP, docsOf, bgsOf, certsOf, obsOf, propsOf, clarsOf, divOf, promoterOf, cf, RS, checklistFor, approvingAuthority, scdFor, computeBg, computeAdditional, CATS, ACTUAL_SUBS, loadCompute, loadVerify, gridLand, holidaySet, isWorking, addDays, pausedDays, clock10, clockWindow, clockOverall, allClocks, flagOf, capacity, usedSlots, nextSlot, plan, daySummary, auditLog, verifyChain, chainHash, notify, roleUsers, nextCounter, istYear, visibleApps, canView, refreshBg, routeFor, currentDocs, readiness, setPause, fcfsBlockers, submit, withdraw, reviewDoc, returnToPromoter, forward, verifyBg, verifiedBgTotal, condsConditional, condsFinal, certSnapshot, makeCert, issueConditional, submitTech, reviewTech, raiseObservation, clarify, closeObservation, verifyLoad, finalMissing, issueFinal, reject, revokeCert, runPeriodic, UploadError, validateUpload, safeName, MIS_COLS, misRowsFromMatrix, misImport, misSummarize, misDate, STAGE_OF, REPORT_HEAD, reportRows, filterApps, safeCell, ROLE_NAME, pySum });
})(window);
