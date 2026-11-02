/* Views part 3: rules & references, reports (+CSV/Excel), MIS import, audit trail, admin pages. */
(function (G) {
  'use strict';
  const N = G.NOC, { h, raw, num, inr } = N, V = N.V, { ist, istd, status, flagB, sel, trunc, decorate, rstatus } = V;
  const route = N.route, action = N.action, can = N.can;
  const fnum = (s, d) => { const v = parseFloat(String(s == null ? '' : s).replace(/,/g, '').trim()); return isNaN(v) ? (d == null ? 0 : d) : v; };
  const fdate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s)) ? s : null);

  route('/verify', null, () => { G.location.replace(N.ROOT + 'verify.html'); return h`<p class="p-4">Opening the verification page...</p>`; });

  /* ---------- rules & references ---------- */
  route('/rules', null, () => {
    const C = N.CFG, rules = N.T('rules').slice().sort((a, b) => a.sort - b.sort), refs = {}; N.T('refs').forEach(r => { refs[r.id] = r; });
    const groups = {}; rules.forEach(r => { (groups[r.grp] = groups[r.grp] || []).push(r); });
    const order = ['timeline', 'bg', 'noc', 'load', 'queue', 'upload'];
    const names = { timeline: 'Timelines & clocks', bg: 'Bank guarantee', noc: 'NOC content, routing & limits', load: 'Load assessment (Reg. 12(2))', queue: 'FCFS & processing slots', upload: 'Uploads' };
    const gl = order.filter(g => groups[g]).map(g => [names[g], groups[g]]);
    const amendOf = {}; C.AMENDMENTS.forEach(a => a.rule_keys.forEach(k => { amendOf[k] = a.id; }));
    const counts = {}; ['verified', 'discrepancy', 'spec', 'practice'].forEach(s => { counts[s] = rules.filter(r => r.status === s).length; });
    const refList = Object.values(refs).sort((a, b) => a.sort - b.sort);
    const refLine = (rid, clause) => { const r = refs[rid]; return h`<li>&#128214; <b>${r ? r.number : '?'}</b>${r && r.dated ? ' (' + r.dated + ')' : ''} - ${clause}${r && r.url ? h` <a class="text-brand underline" href="${r.url}" rel="noopener" target="_blank">open</a>` : ''}</li>`; };
    return h`
<h1 class="text-xl font-bold text-brand-dark">Rules &amp; references</h1>
<p class="text-sm text-slate-600 mt-1 max-w-4xl">Every rule the app enforces, with the source it was read from and how far it could be verified. Nothing here is a legal opinion. NOC SmartTrack is a proposal: where its process differs from the current regulation text, the app's process is the default and the difference is put forward as a <a class="text-brand underline" href="#amendments" data-scroll="amendments">proposed amendment for the Supply Code Review Panel</a>. Admins can change values under <b>Admin &rarr; Rules</b>; changes are audited.</p>
<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
 <div class="stat"><div class="stat-n text-green-700">${counts.verified}</div><div class="stat-l">Verified in source</div></div>
 <div class="stat"><div class="stat-n text-indigo-700">${counts.discrepancy}</div><div class="stat-l">Proposed amendments (app process is default)</div></div>
 <div class="stat"><div class="stat-n text-amber-700">${counts.spec}</div><div class="stat-l">Per requirement doc, unverified</div></div>
 <div class="stat"><div class="stat-n text-blue-700">${counts.practice}</div><div class="stat-l">Departmental practice / working rule</div></div>
</div>
<div class="flex flex-wrap gap-1.5 mb-3 text-xs">${gl.map(([g], i) => h`<a class="tab" href="#" data-scroll="g${i + 1}">${g}</a>`)}<a class="tab" href="#" data-scroll="amendments">Proposed amendments</a><a class="tab" href="#" data-scroll="sources">Source register</a></div>
<section id="amendments" class="mb-6">
 <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
  <h2 class="font-semibold text-brand-dark text-lg">${C.TITLE}</h2>
  <a class="btn btn-sm" href="${N.ROOT}docs/${C.DOC_FILE}" download="${C.DOC_FILE}">&#11015; Download annex (.docx)</a>
 </div>
 <p class="text-sm text-slate-600 max-w-4xl mb-3">NOC SmartTrack is a proposal. If it is approved, the Supply Code Review Panel is asked to amend Supply Code 2024 so that the regulations match the app's process, which therefore stays the default. For each item: the existing provision (only clause numbers that were read in the sources), the proposed change and the rationale. Anything not verified is marked <b>to be confirmed</b>.</p>
 <div class="space-y-3">
 ${C.AMENDMENTS.map(a => h`
  <div class="card !p-3" id="${a.id}">
   <div class="flex flex-wrap items-start justify-between gap-2"><div class="font-semibold text-brand-dark"><span class="font-mono text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 rounded px-1.5 py-0.5 mr-1">${a.id}</span>${a.title}</div>
    <span class="badge ${a.status === 'verified' ? 'rs-verified' : 'rs-spec'}">${a.status === 'verified' ? 'Existing provisions verified' : 'To be confirmed'}</span></div>
   <div class="grid md:grid-cols-3 gap-3 mt-2 text-sm">
    <div><div class="text-xs font-semibold uppercase text-slate-500 mb-1">Existing provision</div>
     <ul class="space-y-1 text-xs text-slate-700">${a.existing.map(([rid, txt, ok]) => { const r = refs[rid]; return h`<li>&#128214; <b>${r ? r.number : '?'}</b>${r && r.dated ? ' (' + r.dated + ')' : ''} - ${txt}${ok ? '' : h` <span class="font-semibold text-amber-700">(to be confirmed)</span>`}</li>`; })}</ul></div>
    <div><div class="text-xs font-semibold uppercase text-slate-500 mb-1">Proposed change (matches the app's process)</div><p class="text-xs text-slate-800">${a.proposed}</p></div>
    <div><div class="text-xs font-semibold uppercase text-slate-500 mb-1">Rationale</div><p class="text-xs text-slate-800">${a.rationale}</p></div>
   </div>
   <p class="mt-2 text-xs alert ${a.status === 'verified' ? 'a-info' : 'a-warn'}"><b>Verification:</b> ${a.tbc}</p>
  </div>`)}
 </div>
 <div class="grid md:grid-cols-2 gap-3 mt-3">
  <div class="card !p-3"><h3 class="font-semibold text-sm text-brand-dark mb-1">Already aligned - no amendment proposed</h3><ul class="text-xs text-slate-700 space-y-1.5">${C.ALIGNED.map(x => h`<li><b>${x.title}.</b> ${x.text}</li>`)}</ul></div>
  <div class="card !p-3"><h3 class="font-semibold text-sm text-brand-dark mb-1">To be confirmed before submission to the Panel</h3><ul class="text-xs text-slate-700 space-y-1.5 list-disc pl-4">${C.TO_CONFIRM.map(x => h`<li>${x}</li>`)}</ul></div>
 </div>
</section>
${gl.map(([g, items], i) => h`
<section id="g${i + 1}" class="mb-5">
 <h2 class="font-semibold text-brand-dark mb-2">${g}</h2>
 <div class="space-y-2">
 ${items.map(r => h`
  <div class="card !p-3">
   <div class="flex flex-wrap items-start justify-between gap-2">
    <div><div class="font-medium">${r.label}</div><div class="text-xs text-slate-500 font-mono">${r.key}${amendOf[r.key] ? h` &middot; <a class="text-indigo-700 underline" href="#" data-scroll="${amendOf[r.key]}">proposed amendment ${amendOf[r.key]}</a>` : ''}</div></div>
    <div class="text-right"><div class="font-bold text-brand-dark">${r.value} <span class="text-xs font-normal text-slate-500">${r.unit}</span></div>${rstatus(r.status)}</div>
   </div>
   <ul class="mt-2 text-xs text-slate-700 space-y-0.5">${r.refs.map(([rid, cl]) => refLine(rid, cl))}</ul>
   ${r.note ? h`<p class="mt-2 text-xs alert ${r.status === 'spec' ? 'a-warn' : 'a-info'}">${r.note}</p>` : ''}
  </div>`)}
 </div>
</section>`)}
<section id="sources" class="mb-6"><h2 class="font-semibold text-brand-dark mb-2">Source register</h2>
 <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>Ref</th><th>Document</th><th>Number</th><th>Date</th><th>Notes / how it was read</th></tr></thead><tbody>
 ${refList.map(r => h`<tr><td class="font-mono text-xs">${r.id}</td><td>${r.url ? h`<a class="text-brand underline" target="_blank" rel="noopener" href="${r.url}">${r.title}</a>` : r.title}</td><td>${r.number}</td><td class="whitespace-nowrap">${r.dated}</td><td class="text-xs text-slate-600">${r.note}</td></tr>`)}
 </tbody></table></div></section>`;
  });
  document.addEventListener('click', ev => { const a = ev.target.closest && ev.target.closest('[data-scroll]'); if (!a) return; ev.preventDefault(); const el = document.getElementById(a.getAttribute('data-scroll')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  /* ---------- reports ---------- */
  function reportData(user, q) {
    const rs = N.RS(), apps = N.filterApps(user, q, rs); return { rs, rows: decorate(apps, rs), apps };
  }
  const avg = (rows, f) => { if (!rows.length) return null; const v = rows.map(f); return N.pyRound(N.pySum(v) / v.length, 1); };
  route('/reports', 'reports', ({ user, query }) => {
    const f = { status: query.status || '', division: query.division || '', d_from: query.d_from || '', d_to: query.d_to || '', band: query.band || '' };
    const { rs, rows } = reportData(user, f), ACTIVE = N.CFG.ACTIVE_STATUSES;
    const doneC = rows.filter(r => r.a.conditional_noc_at), doneF = rows.filter(r => r.a.final_noc_at);
    const daysC = r => N.diffDays(N.istDate(r.a.complete_submission_at), N.istDate(r.a.conditional_noc_at)), daysF = r => N.diffDays(N.istDate(r.a.received_at), N.istDate(r.a.final_noc_at));
    const pct = (lst, fn) => (lst.length ? Math.trunc(N.pyRound(100 * lst.filter(fn).length / lst.length, 0)) : null);
    const kpi = { total: rows.length, avg_c: avg(doneC, daysC), avg_f: avg(doneF, daysF), pct10: pct(doneC, r => r.cs.c10 && r.cs.c10.state === 'done'), pct45: pct(doneF, r => r.cs.overall && r.cs.overall.state === 'done'), overdue: rows.filter(r => r.flag === 'overdue').length, appr: rows.filter(r => r.flag === 'approaching').length };
    const divs = N.T('divisions').slice().sort((a, b) => a.name.localeCompare(b.name)), by = {};
    for (const r of rows) { const d = by[N.divOf(r.a).name] = by[N.divOf(r.a).name] || { n: 0, active: 0, over: 0, kva: 0 }; d.n++; d.active += ACTIVE.indexOf(r.a.status) >= 0 ? 1 : 0; d.over += r.flag === 'overdue' ? 1 : 0; d.kva += r.a.estimated_load_kva; }
    const bydiv = Object.entries(by).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const k = v => (v == null ? '-' : v);
    const se = Math.trunc(rs.get('route.se_limit_kva')), nd = Math.trunc(rs.get('route.nodal_threshold_kva'));
    return h`
<div class="flex flex-wrap justify-between items-center gap-2 mb-3"><h1 class="text-xl font-bold text-brand-dark">${N.t('reports')} &amp; ageing</h1>
 <div class="flex gap-2"><button type="button" class="btn-outline btn-sm" data-export="csv" data-q='${JSON.stringify(f)}'>Export CSV</button><button type="button" class="btn btn-sm" data-export="xlsx" data-q='${JSON.stringify(f)}'>Export Excel</button></div></div>
<form data-nav="/reports" class="card grid sm:grid-cols-6 gap-2 items-end mb-3">
 <div><label class="lbl">Status</label><select name="status" class="inp"><option value="">All</option>${Object.entries(N.CFG.STATUS_LABEL).map(([kk, v]) => h`<option value="${kk}" ${sel(f.status, kk)}>${v}</option>`)}</select></div>
 <div><label class="lbl">Division</label><select name="division" class="inp"><option value="">All</option>${divs.map(d => h`<option value="${d.id}" ${sel(f.division, String(d.id))}>${d.name}</option>`)}</select></div>
 <div><label class="lbl">Load band</label><select name="band" class="inp"><option value="">All</option><option value="le2000" ${sel(f.band, 'le2000')}>&le; ${se} kVA</option><option value="mid" ${sel(f.band, 'mid')}>${se} - ${nd} kVA</option><option value="gt4000" ${sel(f.band, 'gt4000')}>&gt; ${nd} kVA</option></select></div>
 <div><label class="lbl">From</label><input type="date" name="d_from" class="inp" value="${f.d_from}"></div><div><label class="lbl">To</label><input type="date" name="d_to" class="inp" value="${f.d_to}"></div><div class="flex gap-2"><button class="btn">Apply</button><a href="#/reports" class="btn-outline">Reset</a></div></form>
<div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
 <div class="stat"><div class="stat-n">${kpi.total}</div><div class="stat-l">Applications</div></div>
 <div class="stat"><div class="stat-n">${kpi.avg_c == null ? '-' : N.fmtF(kpi.avg_c, 1)}</div><div class="stat-l">Avg days to Conditional NOC</div></div>
 <div class="stat"><div class="stat-n">${kpi.avg_f == null ? '-' : N.fmtF(kpi.avg_f, 1)}</div><div class="stat-l">Avg days to Final NOC</div></div>
 <div class="stat"><div class="stat-n">${kpi.pct10 == null ? '-' : kpi.pct10 + '%'}</div><div class="stat-l">Conditional NOC within 10 d</div></div>
 <div class="stat"><div class="stat-n">${kpi.pct45 == null ? '-' : kpi.pct45 + '%'}</div><div class="stat-l">Final NOC within 45 d</div></div>
 <div class="stat border-l-4 border-l-red-600"><div class="stat-n text-red-700">${kpi.overdue}</div><div class="stat-l">Overdue now (${kpi.appr} due soon)</div></div></div>
<div class="card mb-3 overflow-x-auto"><h2 class="card-h">By DS division</h2><table class="tbl"><thead><tr><th>Division</th><th>Applications</th><th>Active</th><th>Overdue</th><th>Total kVA</th></tr></thead><tbody>${bydiv.length ? bydiv.map(([n, d]) => h`<tr><td>${n}</td><td>${d.n}</td><td>${d.active}</td><td>${d.over}</td><td>${num(d.kva, 0)}</td></tr>`) : h`<tr><td colspan="5" class="text-slate-500">No data.</td></tr>`}</tbody></table></div>
<div class="card overflow-x-auto !p-2"><table class="tbl"><thead><tr><th>FCFS</th><th>Application</th><th>Project</th><th>kVA</th><th>Status</th><th>Received</th><th>Cond. NOC</th><th>Final NOC</th><th>Age (d)</th><th>Flag</th></tr></thead><tbody>
${rows.map(r => { const a = r.a; return h`<tr><td>#${a.seq}</td><td><a class="text-brand underline" href="#/apps/${a.id}">${a.app_no}</a></td><td>${trunc(a.project_name, 36)}</td><td>${num(a.estimated_load_kva, 0)}</td><td>${status(a)}</td><td class="text-xs">${istd(a.received_at)}</td><td class="text-xs">${istd(a.conditional_noc_at)}</td><td class="text-xs">${istd(a.final_noc_at)}</td><td>${r.cs.overall ? r.cs.overall.age : '-'}</td><td>${flagB(r.flag)}</td></tr>`; })}</tbody></table></div>`;
  });
  function csvCell(v) { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-export]'); if (!b) return;
    const user = N.currentUser(); if (!user || !can(user, 'reports')) return;
    const f = JSON.parse(b.getAttribute('data-q')), { rs, apps } = reportData(user, f), data = N.reportRows(apps, rs), kind = b.getAttribute('data-export');
    if (kind === 'csv') {
      const csv = '\ufeff' + [N.REPORT_HEAD].concat(data).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
      N.auditLog(user, 'EXPORT_CSV', null, '', '', data.length + ' rows'); N.save();
      N.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'noc_smarttrack_report.csv');
    } else {
      if (!G.XLSX) { alert('Excel library not loaded'); return; }
      const aoa = [N.REPORT_HEAD].concat(data), ws = G.XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = N.REPORT_HEAD.map((hd, i) => ({ wch: Math.min(40, Math.max(10, ...aoa.map(r => String(r[i] == null ? '' : r[i]).length)) + 2) }));
      ws['!autofilter'] = { ref: G.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: N.REPORT_HEAD.length - 1 } }) };
      const wb = G.XLSX.utils.book_new(); G.XLSX.utils.book_append_sheet(wb, ws, 'NOC applications');
      const out = G.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      N.auditLog(user, 'EXPORT_XLSX', null, '', '', data.length + ' rows'); N.save();
      N.downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'noc_smarttrack_report.xlsx');
    }
  });

  /* ---------- MIS import ---------- */
  route('/mis', 'reports', ({ query }) => {
    const rec = N.T('mis_records'), bm = {};
    rec.forEach(r => { const b = bm[r.batch] = bm[r.batch] || { n: 0, ts: '' }; b.n++; if (r.imported_at > b.ts) b.ts = r.imported_at; });
    const batches = Object.entries(bm).sort((a, b) => (a[1].ts < b[1].ts ? 1 : -1));
    const batch = query.batch || (batches[0] ? batches[0][0] : ''), summ = batch ? N.misSummarize(batch) : null;
    return h`
<h1 class="text-xl font-bold text-brand-dark mb-1">Legacy portal MIS import</h1>
<p class="text-sm text-slate-600 mb-3 max-w-4xl">Upload the NOC-portal MIS report (<code>.xls</code> exported as an HTML table, <code>.csv</code> or <code>.xlsx</code>) with columns ${N.MIS_COLS.join(', ')}. The file is read <b>in your browser</b> and stored only in this browser. Each import is kept as a snapshot batch (the MIS itself keeps no history) so officers can track movement. Imported rows are shown for monitoring only and are not turned into applications.
 Sample files (fictional): <a class="text-brand underline" href="${N.ROOT}samples/mis_sample_fictional.csv" download>CSV (30 rows)</a>, <a class="text-brand underline" href="${N.ROOT}samples/mis_sample_fictional.xls" download>.xls (HTML table)</a>.</p>
<div class="grid lg:grid-cols-3 gap-3">
<form class="card space-y-2" data-act="mis-import"><h2 class="card-h">Import</h2>
 <div><label class="lbl">Batch label</label><input name="label" class="inp" placeholder="e.g. MIS-02Nov2026"></div><div><label class="lbl">File</label><input type="file" name="file" required accept=".xls,.xlsx,.csv,.html" class="text-sm mt-1"></div><button class="btn">Import</button>
 <h3 class="text-xs font-semibold text-slate-600 pt-2">Batches</h3><ul class="text-sm">${batches.length ? batches.map(([b, v]) => h`<li><a class="text-brand underline ${b === batch ? 'font-bold' : ''}" href="#/mis?batch=${encodeURIComponent(b)}">${b}</a> - ${v.n} rows - ${ist(v.ts)}</li>`) : h`<li class="text-slate-500">None yet.</li>`}</ul></form>
<div class="lg:col-span-2 space-y-3 min-w-0">${summ ? h`
 <div class="grid sm:grid-cols-3 gap-2"><div class="stat"><div class="stat-n">${summ.total}</div><div class="stat-l">Rows in batch</div></div><div class="stat"><div class="stat-n text-red-700">${summ.over.length}</div><div class="stat-l">Past allotted days (top 50)</div></div><div class="stat"><div class="stat-n">${summ.by_resp.length}</div><div class="stat-l">Responsible officers/roles</div></div></div>
 <div class="grid sm:grid-cols-2 gap-3"><div class="card"><h2 class="card-h">By application status</h2><table class="tbl"><tbody>${summ.by_status.map(([s, n]) => h`<tr><td>${s || '-'}</td><td class="text-right">${n}</td></tr>`)}</tbody></table></div><div class="card"><h2 class="card-h">Pending with</h2><table class="tbl"><tbody>${summ.by_resp.map(([s, n]) => h`<tr><td>${s}</td><td class="text-right">${n}</td></tr>`)}</tbody></table></div></div>
 <div class="card overflow-x-auto"><h2 class="card-h">Most overdue (elapsed vs allotted)</h2><table class="tbl"><thead><tr><th>App no.</th><th>Dated</th><th>Project</th><th>kVA</th><th>Pending task</th><th>With</th><th>Allotted</th><th>Elapsed</th></tr></thead><tbody>${summ.over.map(r => h`<tr><td>${r.APP_NO}</td><td>${istd(r.DATED)}</td><td>${trunc(r.PROJECT_NAME, 34)}</td><td>${num(r.PR_LOAD, 0)}</td><td class="text-xs">${r.PENDING_TASK}</td><td>${r.RESPONSIBLE}</td><td>${r.DAYS_ALLOTED}</td><td class="text-red-700 font-semibold">${r.DAYS_ELAPSED}</td></tr>`)}</tbody></table></div>` : h`<div class="card text-slate-500">Import a file to see its summary.</div>`}</div></div>`;
  });
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }
  async function misMatrix(file) {
    const name = file.name.toLowerCase(), bytes = await N.readFile(file);
    if (bytes.length > 25 * 1024 * 1024) throw new N.WorkflowError('File too large');
    if (name.endsWith('.xlsx')) {
      if (!G.XLSX) throw new N.WorkflowError('Excel reader not loaded');
      const wb = G.XLSX.read(bytes, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
      return G.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(r => r.map(x => (x == null ? '' : String(x))));
    }
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\ufeff/, '');
    if (name.endsWith('.csv')) return parseCsv(text);
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return Array.from(doc.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()));
  }
  action('mis-import', async ({ user, get, fd }) => {
    if (!can(user, 'reports')) throw new N.WorkflowError('Your role cannot do this');
    const file = fd.get('file'); if (!file || !file.name) throw new N.WorkflowError('Choose a file');
    let rows;
    try { rows = N.misRowsFromMatrix(await misMatrix(file)); } catch (e) { if (e instanceof N.WorkflowError) { N.flash('Import failed: ' + e.message, 'err'); return false; } throw e; }
    const p = N.istParts(N.nowIso()), pad = N.p2;
    const batch = (get('label').trim() || 'MIS-' + p.getUTCFullYear() + pad(p.getUTCMonth() + 1) + pad(p.getUTCDate()) + '-' + pad(p.getUTCHours()) + pad(p.getUTCMinutes())).slice(0, 40);
    const n = N.misImport(rows, batch);
    N.auditLog(user, 'MIS_IMPORT', null, '', '', n + ' rows, batch ' + batch);
    N.flash("Imported " + n + " MIS rows as batch '" + batch + "'."); N.go('/mis?batch=' + encodeURIComponent(batch));
  });

  /* ---------- audit ---------- */
  route('/admin/audit', 'audit', ({ query }) => {
    const q = (query.q || '').trim().toLowerCase(), actn = query.action || '', page = Math.max(parseInt(query.page, 10) || 1, 1);
    let all = N.T('audit_log').slice().sort((a, b) => b.id - a.id);
    const actions = Array.from(new Set(all.map(e => e.action))).sort();
    if (actn) all = all.filter(e => e.action === actn);
    if (q) all = all.filter(e => String(e.detail || '').toLowerCase().indexOf(q) >= 0 || String(e.actor_name || '').toLowerCase().indexOf(q) >= 0);
    const total = all.length, rows = all.slice((page - 1) * 100, page * 100), chain = N.verifyChain();
    const link = p => '#/admin/audit?page=' + p + '&q=' + encodeURIComponent(query.q || '') + '&action=' + encodeURIComponent(actn);
    return h`
<div class="flex flex-wrap justify-between gap-2 items-center mb-3"><h1 class="text-xl font-bold text-brand-dark">${N.t('audit')}</h1><span class="badge ${chain[0] ? 'b-green' : 'b-red'}">${chain[0] ? 'Hash chain intact (' + chain[1] + ' entries)' : 'CHAIN BROKEN at entry ' + chain[1]}</span></div>
<form class="card grid sm:grid-cols-4 gap-2 items-end mb-3" data-nav="/admin/audit"><div class="sm:col-span-2"><label class="lbl">Search detail / user</label><input class="inp" name="q" value="${query.q || ''}"></div><div><label class="lbl">Action</label><select class="inp" name="action"><option value="">All</option>${actions.map(x => h`<option ${x === actn ? 'selected' : ''}>${x}</option>`)}</select></div><button class="btn">Filter</button></form>
<div class="card overflow-x-auto !p-2"><table class="tbl"><thead><tr><th>#</th><th>Time (IST)</th><th>User</th><th>Action</th><th>Application</th><th>Status</th><th>Detail</th></tr></thead><tbody>
${rows.map(e => h`<tr><td class="text-xs text-slate-400">${e.id}</td><td class="text-xs whitespace-nowrap">${ist(e.ts)}</td><td class="text-xs">${e.actor_name}<div class="text-slate-400">${e.actor_role}</div></td><td><span class="chip">${e.action}</span></td><td>${e.app_id ? h`<a class="text-brand underline" href="#/apps/${e.app_id}">#${e.app_id}</a>` : ''}</td><td class="text-xs">${e.from_status}${e.from_status && e.to_status ? raw(' &rarr; ') : ''}${e.to_status}</td><td class="text-xs">${trunc(e.detail, 180)}</td></tr>`)}</tbody></table></div>
<div class="flex justify-between mt-2 text-sm"><span>${total} entries - page ${page}</span><span class="flex gap-2">${page > 1 ? h`<a class="tab" href="${link(page - 1)}">Prev</a>` : ''}${total > page * 100 ? h`<a class="tab" href="${link(page + 1)}">Next</a>` : ''}</span></div>
<p class="hint mt-2">The audit log is append-only; every entry carries a SHA-256 hash chained to the previous entry, so any alteration is detectable (demo build: the chain is checked in your browser).</p>`;
  });

  /* ---------- admin ---------- */
  const adminNav = cur => h`<div class="flex flex-wrap gap-1.5 mb-3">${[['/admin', 'Overview'], ['/admin/users', 'Users'], ['/admin/rules', 'Rules & timelines'], ['/admin/checklist', 'Document checklist'], ['/admin/data', 'SCD, holidays, slots, divisions'], ['/admin/audit', 'Audit']].map(([p, l]) => h`<a class="tab ${cur === p ? 'tab-on' : ''}" href="#${p}">${l}</a>`)}</div>`;
  route('/admin', 'admin', () => {
    const c = t => N.T(t).length, chain = N.verifyChain();
    return h`${adminNav('/admin')}
<h1 class="text-xl font-bold text-brand-dark mb-3">Administration</h1>
<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">${[['users', c('users')], ['rules', c('rules')], ['apps', c('applications')], ['audit', c('audit_log')]].map(([k, v]) => h`<div class="stat"><div class="stat-n">${v}</div><div class="stat-l">${k[0].toUpperCase() + k.slice(1)}</div></div>`)}</div>
<div class="grid md:grid-cols-2 gap-3"><div class="card"><h2 class="card-h">Audit chain</h2><span class="badge ${chain[0] ? 'b-green' : 'b-red'}">${chain[0] ? 'Intact - ' + chain[1] + ' entries verified' : 'BROKEN at entry ' + chain[1]}</span></div>
 <div class="card"><h2 class="card-h">Periodic job</h2><p class="text-sm mb-2">Expires lapsed technical windows and sends deadline reminders (10-day, window, 45-day). In this demo it runs when you press the button:</p><form data-act="run-reminders"><button class="btn btn-sm">Run now</button></form></div></div>
<div class="card mt-3 text-sm"><h2 class="card-h">Notification channels</h2>In-app notifications only. Email / SMS / outbox are not part of the demo build: nothing is ever sent.</div>`;
  });
  action('run-reminders', async ({ user }) => { const [ex, rem] = N.runPeriodic(user); N.auditLog(user, 'RUN_REMINDERS', null, '', '', 'expired=' + ex + ' reminders=' + rem); N.flash('Periodic job run: ' + ex + ' window(s) expired, ' + rem + ' reminder(s) sent.'); });

  const ROLES = ['promoter', 'ds', 'commercial', 'admin'];
  route('/admin/users', 'admin', ({ user }) => {
    const us = N.T('users').slice().sort((a, b) => (a.role + a.username < b.role + b.username ? -1 : 1)), divs = N.T('divisions').slice().sort((a, b) => a.name.localeCompare(b.name));
    return h`${adminNav('/admin/users')}
<h1 class="text-xl font-bold text-brand-dark mb-3">Users</h1>
<div class="card overflow-x-auto mb-3"><table class="tbl"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Division</th><th>Last login</th><th>Active</th><th>Actions</th></tr></thead><tbody>
${us.map(u => h`<tr><td>${u.username}</td><td>${u.name}<div class="text-xs text-slate-500">${u.org_name || u.designation}</div></td>
 <td><form data-act="user-upd" data-uid="${u.id}" class="flex gap-1"><input type="hidden" name="action" value="role"><select name="value" class="inp !mt-0 !py-1 text-xs" ${u.id === user.id ? 'disabled' : ''}>${ROLES.map(r => h`<option value="${r}" ${r === u.role ? 'selected' : ''}>${N.ROLE_LABEL[r]}</option>`)}</select><button class="btn-outline btn-sm" ${u.id === user.id ? 'disabled' : ''}>Set</button></form></td>
 <td>${u.role === 'ds' ? h`<form data-act="user-upd" data-uid="${u.id}" class="flex gap-1"><input type="hidden" name="action" value="division"><select name="value" class="inp !mt-0 !py-1 text-xs">${divs.map(d => h`<option value="${d.id}" ${u.division_id === d.id ? 'selected' : ''}>${d.name}</option>`)}</select><button class="btn-outline btn-sm">Set</button></form>` : '-'}</td>
 <td class="text-xs">${ist(u.last_login)}</td><td><span class="badge ${u.active ? 'b-green' : 'b-red'}">${u.active ? 'Active' : 'Disabled'}</span></td>
 <td><div class="flex gap-1 flex-wrap"><form data-act="user-upd" data-uid="${u.id}"><input type="hidden" name="action" value="toggle"><button class="btn-outline btn-sm">${u.active ? 'Disable' : 'Enable'}</button></form>
  <form data-act="user-upd" data-uid="${u.id}" class="flex gap-1"><input type="hidden" name="action" value="password"><input name="value" type="password" placeholder="new password" class="inp !mt-0 !py-1 text-xs w-28" autocomplete="new-password"><button class="btn-outline btn-sm">Reset</button></form></div></td></tr>`)}</tbody></table></div>
<form data-act="user-create" class="card grid sm:grid-cols-4 gap-2"><h2 class="card-h sm:col-span-4">Create user (DS, Commercial, Admin or Promoter)</h2>
 <div><label class="lbl">Username</label><input name="username" class="inp" required></div><div><label class="lbl">Full name</label><input name="name" class="inp" required></div>
 <div><label class="lbl">Role</label><select name="role" class="inp">${ROLES.map(r => h`<option value="${r}">${N.ROLE_LABEL[r]}</option>`)}</select></div><div><label class="lbl">Division (DS only)</label><select name="division_id" class="inp"><option value="">-</option>${divs.map(d => h`<option value="${d.id}">${d.name}</option>`)}</select></div>
 <div><label class="lbl">Designation</label><input name="designation" class="inp"></div><div><label class="lbl">Email</label><input name="email" class="inp"></div><div><label class="lbl">Mobile</label><input name="mobile" class="inp"></div><div><label class="lbl">Initial password</label><input name="password" type="password" class="inp" required autocomplete="new-password"></div>
 <div class="sm:col-span-4"><button class="btn">Create</button></div></form>`;
  });
  action('user-create', async ({ user, get }) => {
    const username = get('username'), role = get('role'), password = get('password');
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    if (ROLES.indexOf(role) < 0 || !/^[A-Za-z0-9_.-]{3,30}$/.test(username) || password.length < 8) { N.flash('Check username (3-30 chars), role and password (min 8)', 'err'); return false; }
    if (N.T('users').some(u => u.username.toLowerCase() === username.toLowerCase())) { N.flash('Username already exists', 'err'); return false; }
    N.insert('users', { username: username.toLowerCase(), pw_hash: N.hashPw(username.toLowerCase(), password), name: get('name'), role, designation: get('designation'), email: get('email'), mobile: get('mobile'), org_name: '', constitution: '', address: '', division_id: /^\d+$/.test(get('division_id')) ? +get('division_id') : null, active: true, created_at: N.nowIso(), last_login: null });
    N.auditLog(user, 'USER_CREATED', null, '', '', username + ' (' + role + ')'); N.flash('User ' + username + ' created');
  });
  action('user-upd', async ({ user, form, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const u = N.U(+form.getAttribute('data-uid')); if (!u) throw new N.WorkflowError('User not found');
    const act = get('action'), value = get('value');
    if (act === 'toggle') { if (u.id === user.id) { N.flash('You cannot deactivate yourself', 'err'); return false; } u.active = !u.active; N.auditLog(user, u.active ? 'USER_ACTIVE' : 'USER_DEACTIVATED', null, '', '', u.username); }
    else if (act === 'password') { if (value.length < 8) { N.flash('Password must be at least 8 characters', 'err'); return false; } u.pw_hash = N.hashPw(u.username, value); N.auditLog(user, 'USER_PASSWORD_RESET', null, '', '', u.username); }
    else if (act === 'division') { u.division_id = /^\d+$/.test(value) ? +value : null; N.auditLog(user, 'USER_DIVISION', null, '', '', u.username + ' -> ' + value); }
    else if (act === 'role' && ROLES.indexOf(value) >= 0 && u.id !== user.id) { N.auditLog(user, 'USER_ROLE', null, '', '', u.username + ': ' + u.role + ' -> ' + value); u.role = value; }
    N.flash('User updated');
  });

  route('/admin/rules', 'admin', () => {
    const rules = N.T('rules').slice().sort((a, b) => a.sort - b.sort); let g = '';
    return h`${adminNav('/admin/rules')}
<h1 class="text-xl font-bold text-brand-dark">Rules &amp; timelines (configurable)</h1>
<p class="text-sm text-slate-600 mb-3">Every change is audited and takes effect immediately for new calculations. Sources and verification status are shown on the public <a class="underline text-brand" href="#/rules">Rules &amp; references</a> page. <b>Reset</b> restores the value shipped with the build.</p>
${rules.map(r => { const head = r.grp !== g ? (g = r.grp, h`<h2 id="${r.grp}" class="font-semibold text-brand-dark mt-4 mb-1 uppercase text-sm">${r.grp}</h2>`) : ''; return h`${head}
<form data-act="rule-set" data-key="${r.key}" class="card !p-3 mb-2 grid md:grid-cols-12 gap-2 items-center">
 <div class="md:col-span-6"><div class="text-sm font-medium">${r.label}</div><div class="text-[11px] font-mono text-slate-400">${r.key}</div></div>
 <div class="md:col-span-2">${rstatus(r.status)}</div>
 <div class="md:col-span-2 flex items-center gap-1"><input name="value" class="inp !mt-0 !py-1" value="${r.value}"><span class="text-xs text-slate-500">${r.unit}</span></div>
 <div class="md:col-span-2 flex gap-1"><button class="btn btn-sm">Save</button>${r.value !== r.default_value ? h`<button name="reset" value="1" class="btn-outline btn-sm">Reset</button>` : ''}</div></form>`; })}`;
  });
  const castOk = (v, t) => (t === 'int' ? /^[-+]?\d+$/.test(v.trim()) : t === 'float' ? v.trim() !== '' && isFinite(Number(v)) : true);
  action('rule-set', async ({ user, form, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const key = form.getAttribute('data-key'), r = N.T('rules').find(x => x.key === key); if (!r) throw new N.WorkflowError('Rule not found');
    const reset = !!get('reset'); let nv = reset ? r.default_value : get('value').trim();
    if (r.vtype === 'bool') nv = ['1', 'true', 'on', 'yes'].indexOf(nv.toLowerCase()) >= 0 ? 'true' : 'false';
    if (!castOk(nv, r.vtype)) { N.flash('Invalid value for ' + key, 'err'); return false; }
    const bad = { 'fcfs.enforcement': [['strict', 'warn', 'off'], 'fcfs.enforcement must be strict, warn or off'], 'bg.mode': [['reg_12_4', 'flat_per_kva'], 'bg.mode must be reg_12_4 or flat_per_kva'], 'timeline.ageing_basis': [['application', 'complete_submission'], 'ageing_basis must be application or complete_submission'], 'timeline.day_basis': [['calendar', 'working'], 'day_basis must be calendar or working'] }[key];
    if (bad && bad[0].indexOf(nv) < 0) { N.flash(bad[1], 'err'); return false; }
    const old = r.value; r.value = nv; N.invalidateRules(); r.updated_by = user.username; r.updated_at = N.nowIso();
    N.auditLog(user, 'RULE_CHANGED', null, '', '', key + ': ' + old + ' -> ' + nv);
    N.flash(key + ' updated' + (reset ? ' (reset to default)' : ''));
  });

  route('/admin/checklist', 'admin', () => {
    const items = N.T('checklist_items').slice().sort((a, b) => (a.constitution < b.constitution ? -1 : a.constitution > b.constitution ? 1 : a.sort - b.sort));
    return h`${adminNav('/admin/checklist')}
<h1 class="text-xl font-bold text-brand-dark">Document checklist</h1>
<p class="text-sm text-slate-600 mb-3">Defaults follow Annexure-A of the NOC checklist as read from a poor scan - <b>to be confirmed by CE/Commercial</b> against the original. Items apply to "ALL" constitutions or to one constitution.</p>
<div class="card overflow-x-auto mb-3"><table class="tbl"><thead><tr><th>Applies to</th><th>Code</th><th>Document</th><th>Source</th><th>Mandatory</th><th>Active</th></tr></thead><tbody>
${items.map(i => h`<tr class="${i.active ? '' : 'opacity-50'}"><td>${i.constitution}</td><td class="font-mono text-xs">${i.code}</td><td>${i.label}</td><td class="text-xs text-slate-500">${i.source}</td>
 ${[['mandatory', i.mandatory], ['active', i.active]].map(([act, val]) => h`<td><form data-act="check-toggle" data-iid="${i.id}"><input type="hidden" name="action" value="${act}"><button class="badge ${val ? 'b-green' : 'b-slate'}">${val ? 'Yes' : 'No'}</button></form></td>`)}</tr>`)}</tbody></table></div>
<form data-act="check-add" class="card grid sm:grid-cols-5 gap-2 items-end"><div><label class="lbl">Applies to</label><select name="constitution" class="inp"><option>ALL</option>${N.CFG.CONSTITUTIONS.map(([c, l]) => h`<option value="${c}">${l}</option>`)}</select></div><div><label class="lbl">Code</label><input name="code" class="inp" required placeholder="NEW_DOC"></div><div class="sm:col-span-2"><label class="lbl">Document label</label><input name="label" class="inp" required></div><div><label class="flex items-center gap-1 text-sm"><input type="checkbox" name="mandatory" checked> Mandatory</label><button class="btn btn-sm mt-1">Add</button></div></form>`;
  });
  action('check-toggle', async ({ user, form, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const it = N.byId('checklist_items', +form.getAttribute('data-iid')); if (!it) throw new N.WorkflowError('Item not found'); const act = get('action');
    if (act === 'mandatory') it.mandatory = !it.mandatory; else if (act === 'active') it.active = !it.active;
    N.auditLog(user, 'CHECKLIST_' + act.toUpperCase(), null, '', '', it.constitution + '/' + it.code);
  });
  action('check-add', async ({ user, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const code = get('code').toUpperCase().replace(/[^A-Z0-9_]/g, ''), cons = get('constitution');
    if (!code || !get('label').trim() || (cons !== 'ALL' && !N.CFG.CONSTITUTIONS.some(c => c[0] === cons))) { N.flash('Invalid item', 'err'); return false; }
    N.insert('checklist_items', { constitution: cons, code, label: get('label').trim(), label_pa: '', mandatory: get('mandatory') === 'on', active: true, sort: 999, source: 'Admin added' });
    N.auditLog(user, 'CHECKLIST_ADDED', null, '', '', cons + '/' + code);
  });

  route('/admin/data', 'admin', () => {
    const scd = N.T('scd_rates').slice().sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)), hol = N.T('holidays').slice().sort((a, b) => (a.day < b.day ? -1 : 1)), ov = N.T('slot_overrides').slice().sort((a, b) => (a.day < b.day ? -1 : 1)), divs = N.T('divisions').slice().sort((a, b) => a.name.localeCompare(b.name));
    return h`${adminNav('/admin/data')}
<h1 class="text-xl font-bold text-brand-dark mb-3">Reference data</h1>
<div class="grid lg:grid-cols-2 gap-3">
 <div class="card overflow-x-auto"><h2 class="card-h">SCD rates (Rs per kVA) - chosen by application date</h2><table class="tbl mb-2"><thead><tr><th>Effective</th><th>11 kV connectivity</th><th>SLC</th><th>Source</th></tr></thead><tbody>${scd.map(s => h`<tr><td>${istd(s.effective_from)}</td><td>${num(s.rate_11kv)}</td><td>${num(s.rate_slc)}</td><td class="text-xs">${s.source}</td></tr>`)}</tbody></table>
  <form data-act="scd-add" class="grid grid-cols-2 gap-2"><div><label class="lbl">Effective from</label><input type="date" name="effective_from" class="inp" required></div><div><label class="lbl">Source (memo / date)</label><input name="source" class="inp"></div><div><label class="lbl">11 kV (Rs/kVA)</label><input name="rate_11kv" class="inp" inputmode="decimal" required></div><div><label class="lbl">SLC (Rs/kVA)</label><input name="rate_slc" class="inp" inputmode="decimal" required></div><button class="btn btn-sm col-span-2">Add rates</button></form></div>
 <div class="card"><h2 class="card-h">Holidays (used for working-day mode and slots)</h2><ul class="text-sm mb-2 max-h-40 overflow-y-auto">${hol.length ? hol.map(x => h`<li class="flex justify-between border-b py-0.5"><span>${istd(x.day)} - ${x.name}</span><form data-act="holiday"><input type="hidden" name="day" value="${x.day}"><button name="delete" value="1" class="text-red-700 text-xs underline">remove</button></form></li>`) : h`<li class="text-slate-500">None</li>`}</ul>
  <form data-act="holiday" class="flex gap-2 items-end"><div><label class="lbl">Date</label><input type="date" name="day" class="inp" required></div><div class="flex-1"><label class="lbl">Name</label><input name="name" class="inp"></div><button class="btn btn-sm">Add</button></form></div>
 <div class="card"><h2 class="card-h">Slot capacity overrides (per day)</h2><table class="tbl mb-2"><tbody>${ov.length ? ov.map(o => h`<tr><td>${istd(o.day)}</td><td>${o.stage[0] + o.stage.slice(1).toLowerCase()}</td><td>${o.capacity}</td><td class="text-xs">${o.note}</td></tr>`) : h`<tr><td class="text-slate-500">None - default capacity from Rules applies.</td></tr>`}</tbody></table>
  <form data-act="slot" class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end"><div><label class="lbl">Date</label><input type="date" name="day" class="inp" required></div><div><label class="lbl">Stage</label><select name="stage" class="inp"><option value="CONDITIONAL">Conditional</option><option value="FINAL">Final</option></select></div><div><label class="lbl">Capacity</label><input name="capacity" type="number" min="0" max="200" class="inp" required></div><div><label class="lbl">Note</label><input name="note" class="inp"></div><button class="btn btn-sm col-span-2 sm:col-span-4">Set override</button></form></div>
 <div class="card"><h2 class="card-h">DS divisions</h2><ul class="text-sm mb-2">${divs.map(d => h`<li>${d.name} <span class="text-slate-500 text-xs">(${d.circle})</span></li>`)}</ul><form data-act="division" class="flex gap-2 items-end"><div><label class="lbl">Division</label><input name="name" class="inp" required></div><div><label class="lbl">Circle</label><input name="circle" class="inp"></div><button class="btn btn-sm">Add</button></form></div>
</div>`;
  });
  action('scd-add', async ({ user, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const d = fdate(get('effective_from')), r1 = fnum(get('rate_11kv')), r2 = fnum(get('rate_slc'));
    if (!d || r1 <= 0 || r2 <= 0) { N.flash('Invalid SCD row', 'err'); return false; }
    N.insert('scd_rates', { effective_from: d, rate_11kv: r1, rate_slc: r2, source: get('source') || 'Admin entry' });
    N.auditLog(user, 'SCD_ADDED', null, '', '', d + ' ' + r1 + '/' + r2 + ' ' + get('source')); N.flash('SCD rates added (applied by application date)');
  });
  action('holiday', async ({ user, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const d = fdate(get('day')); if (!d) return false; const del = !!get('delete'), H = N.T('holidays'), ex = H.find(x => x.day === d);
    if (del && ex) H.splice(H.indexOf(ex), 1); else if (!ex && !del) N.insert('holidays', { day: d, name: get('name') });
    N.auditLog(user, del ? 'HOLIDAY_DEL' : 'HOLIDAY_ADD', null, '', '', d + ' ' + get('name'));
  });
  action('slot', async ({ user, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const d = fdate(get('day')), st = get('stage'), cap = parseInt(get('capacity'), 10);
    if (d && ['CONDITIONAL', 'FINAL'].indexOf(st) >= 0 && cap >= 0 && cap <= 200) {
      const ex = N.T('slot_overrides').find(o => o.day === d && o.stage === st);
      if (ex) { ex.capacity = cap; ex.note = get('note'); } else N.insert('slot_overrides', { day: d, stage: st, capacity: cap, note: get('note') });
      N.auditLog(user, 'SLOT_OVERRIDE', null, '', '', d + ' ' + st + ' ' + cap);
    }
  });
  action('division', async ({ user, get }) => {
    if (user.role !== 'admin') throw new N.WorkflowError('Admin only');
    const nm = get('name').trim();
    if (nm && !N.T('divisions').some(d => d.name === nm)) { N.insert('divisions', { name: nm, circle: get('circle').trim(), active: true }); N.auditLog(user, 'DIVISION_ADDED', null, '', '', nm); }
  });
})(window);
