/* Views part 2: application form, application detail (all roles), load sheet / verifier. */
(function (G) {
  'use strict';
  const N = G.NOC, { h, raw, num, inr } = N, V = N.V, { ist, istd, status, flagB, clockB, sel, trunc } = V;
  const route = N.route, action = N.action, can = N.can;
  const fnum = (s, d) => { const v = parseFloat(String(s == null ? '' : s).replace(/,/g, '').trim()); return isNaN(v) ? (d == null ? 0 : d) : v; };
  const fdate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s)) ? s : null);
  const nz = v => (v == null ? '' : v);
  const gstr = v => (v == null ? '' : (Number.isInteger(v) ? String(v) : String(v)));
  const keepErr = e => e instanceof N.WorkflowError;

  function mine(user, id, editable) {
    const a = N.APP(+id);
    if (!a || !N.canView(user, a)) throw N.notFound();
    if (user.role === 'promoter' && a.promoter_id !== user.id) throw N.notFound();
    if (editable && ['DRAFT', 'RETURNED'].indexOf(a.status) < 0) throw new N.WorkflowError('Application can no longer be edited');
    return a;
  }

  /* ---------- form ---------- */
  function formView(user, a) {
    const rs = N.RS(), divs = N.T('divisions').filter(d => d.active).sort((x, y) => x.name.localeCompare(y.name));
    const v = k => (a && a[k] != null ? a[k] : (k === 'constitution' ? user.constitution : k === 'fee_amount' ? rs.get('noc.fee_amount') : ''));
    const C = N.CFG;
    return h`
<form data-act="app-save" data-id="${a ? a.id : ''}" class="space-y-4 max-w-5xl mx-auto">
 <div class="flex flex-wrap justify-between items-center gap-2"><h1 class="text-xl font-bold text-brand-dark">${a ? 'Edit application ' + (a.app_no || '(draft #' + a.id + ')') : 'New NOC application'}</h1>${a ? h`<a class="btn-outline btn-sm" href="#/apps/${a.id}">Cancel</a>` : ''}</div>
 <div class="card"><h2 class="card-h">1. Project</h2>
  <div class="grid sm:grid-cols-2 gap-3">
   <div class="sm:col-span-2"><label class="lbl">Project / colony name *</label><input class="inp" name="project_name" required maxlength="200" value="${v('project_name')}"></div>
   <div><label class="lbl">Type of project</label><select class="inp" name="colony_type">${C.COLONY_TYPES.map(([c, l]) => h`<option value="${c}" ${sel(v('colony_type'), c)}>${l}</option>`)}</select></div>
   <div><label class="lbl">Supply scheme</label><select class="inp" name="scheme">${C.SCHEMES.map(([c, l]) => h`<option value="${c}" ${sel(v('scheme'), c)}>${l}</option>`)}</select></div>
   <div><label class="lbl">Constitution of applicant</label><select class="inp" name="constitution">${C.CONSTITUTIONS.map(([c, l]) => h`<option value="${c}" ${sel(v('constitution'), c)}>${l}</option>`)}</select><p class="hint">Decides the document checklist.</p></div>
   <div><label class="lbl">DS Division *</label><select class="inp" name="division_id" required><option value="">Select...</option>${divs.map(d => h`<option value="${d.id}" ${a && a.division_id === d.id ? 'selected' : ''}>${d.name} (${d.circle})</option>`)}</select></div>
   <div class="sm:col-span-2"><label class="lbl">Location / address</label><input class="inp" name="location" value="${v('location')}"></div>
   <div><label class="lbl">District</label><input class="inp" name="district" value="${v('district')}"></div>
   <div><label class="lbl">Area (acres)</label><input class="inp" name="area_acres" inputmode="decimal" value="${v('area_acres')}"></div>
  </div></div>
 <div class="card"><h2 class="card-h">2. Licence / approval</h2>
  <div class="grid sm:grid-cols-2 gap-3">
   <div><label class="lbl">Licence / approval no.</label><input class="inp" name="licence_no" value="${v('licence_no')}"></div>
   <div><label class="lbl">Issuing authority</label><input class="inp" name="licence_authority" placeholder="e.g. PUDA / GMADA / DTP" value="${v('licence_authority')}"></div>
   <div><label class="lbl">Licence date</label><input class="inp" type="date" name="licence_date" value="${v('licence_date')}"></div>
   <div><label class="lbl">Licence valid up to</label><input class="inp" type="date" name="licence_valid_upto" value="${v('licence_valid_upto')}"><p class="hint">BG should cover the validity of the NOC / licence period.</p></div>
   <label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="gmada_master_plan" ${a && a.gmada_master_plan ? 'checked' : ''}> Project falls within an approved (GMADA / Master Plan) area</label>
  </div></div>
 <div class="card"><h2 class="card-h">3. Load and cost - drives the bank guarantee</h2>
  <div class="grid sm:grid-cols-3 gap-3">
   <div><label class="lbl">Estimated load (kVA) *</label><input class="inp" id="f_load" name="estimated_load_kva" inputmode="decimal" required value="${v('estimated_load_kva')}"><p class="hint">Use the <b>load sheet</b> (after saving the draft) to compute and verify it per Reg. 12(2).</p></div>
   <div><label class="lbl">Estimated cost of LD system (Rs)</label><input class="inp" id="f_ld" name="ld_cost" inputmode="decimal" value="${v('ld_cost')}"><p class="hint">Material + labour; establishment charges are added automatically.</p></div>
   <div><label class="lbl">Electrical layout / DT summary</label><input class="inp" name="dt_summary" placeholder="e.g. 4 x 630 kVA DT, 11 kV UG" value="${v('dt_summary')}"></div>
   <div><label class="lbl">NOC fee (Rs)</label><input class="inp" name="fee_amount" value="${v('fee_amount')}"></div>
   <div><label class="lbl">Fee receipt / reference</label><input class="inp" name="fee_ref" value="${v('fee_ref')}"></div>
  </div>
  <div id="bgprev" class="alert a-info mt-3 text-sm">Enter the load and LD cost to see the bank guarantee calculation.</div>
 </div>
 <div class="flex gap-2 flex-wrap"><button class="btn">${a ? 'Save changes' : 'Save draft'}</button><span class="text-sm text-slate-500 self-center">Documents and BG are uploaded on the next screen; the FCFS number is issued only on final submission.</span></div>
</form>`;
  }
  function bgPreview() {
    const box = document.getElementById('bgprev'); if (!box) return;
    const load = document.getElementById('f_load'), ld = document.getElementById('f_ld');
    const l = fnum(load.value), c = fnum(ld.value); if (l <= 0) return;
    const rs = N.RS(), scd = N.scdFor(N.todayIST()), d = N.computeBg(l, c, rs, scd), auth = N.approvingAuthority(l, rs)[1];
    box.innerHTML = h`<b>Bank guarantee required: ${inr(d.bg)}</b> <span class='text-xs'>(${d.formula})</span><ul class='list-disc ml-5 mt-1 text-xs'>${d.lines.map(x => h`<li>${x[0]}: ${inr(x[1])}</li>`)}</ul><div class='text-xs mt-1'>Approving authority: ${auth}</div>${(d.warnings || []).map(w => h`<div class='text-xs text-amber-800'>${w}</div>`)}`.s;
  }
  document.addEventListener('input', ev => { if (ev.target && (ev.target.id === 'f_load' || ev.target.id === 'f_ld')) bgPreview(); });
  N.onRender.push(bgPreview);

  route('/apps/new', 'apply', ({ user }) => formView(user, null));
  route('/apps/:id/edit', 'apply', ({ user, params }) => formView(user, mine(user, params.id, true)));
  function applyForm(a, get, fd) {
    const C = N.CFG;
    a.project_name = get('project_name').trim().slice(0, 200);
    a.colony_type = C.COLONY_TYPES.some(x => x[0] === get('colony_type')) ? get('colony_type') : 'RESIDENTIAL';
    a.scheme = C.SCHEMES.some(x => x[0] === get('scheme')) ? get('scheme') : 'INDIVIDUAL';
    if (C.CONSTITUTIONS.some(x => x[0] === get('constitution'))) a.constitution = get('constitution');
    a.location = get('location').trim().slice(0, 300); a.district = get('district').trim().slice(0, 80);
    a.division_id = parseInt(get('division_id'), 10); a.area_acres = fnum(get('area_acres')) || null;
    a.licence_no = get('licence_no').trim().slice(0, 80); a.licence_authority = get('licence_authority').trim().slice(0, 80);
    a.licence_date = fdate(get('licence_date')); a.licence_valid_upto = fdate(get('licence_valid_upto'));
    a.gmada_master_plan = get('gmada_master_plan') === 'on'; a.dt_summary = get('dt_summary').trim().slice(0, 300);
    a.estimated_load_kva = fnum(get('estimated_load_kva')); a.ld_cost = fnum(get('ld_cost'));
    a.fee_amount = fnum(get('fee_amount')); a.fee_ref = get('fee_ref').trim().slice(0, 80);
  }
  action('app-save', async ({ user, form, get, fd }) => {
    if (user.role !== 'promoter') throw new N.WorkflowError('Only a promoter can create or edit applications');
    const id = form.getAttribute('data-id');
    if (!get('project_name').trim() || !/^\d+$/.test(get('division_id'))) { N.flash('Project name and DS division are required', 'err'); return false; }
    let a;
    if (!id) {
      a = N.insert('applications', { seq: null, app_no: null, promoter_id: user.id, division_id: +get('division_id'), assigned_ds_id: null, status: 'DRAFT', route: '', project_name: get('project_name').trim(), colony_type: 'RESIDENTIAL', scheme: 'INDIVIDUAL', constitution: get('constitution') || user.constitution || 'COMPANY', location: '', district: '', area_acres: null, licence_no: '', licence_authority: '', licence_date: null, licence_valid_upto: null, gmada_master_plan: false, dt_summary: '', electrification_months: null, estimated_load_kva: 0, ld_cost: 0, fee_amount: 0, fee_ref: '', fee_verified: false, bg_required: 0, created_at: N.nowIso(), received_at: null, complete_submission_at: null, docs_complete_at: null, conditional_noc_at: null, temp_load_kw: null, tech_submitted_at: null, tech_accepted_at: null, load_verified_at: null, final_noc_at: null, closed_at: null, verified_load_kva: null, verified_ld_cost: null, addl_bg_required: 0, return_remark: '', withdraw_reason: '', priority: false, pause_started_at: null, paused_seconds: 0, load_sheet_kva: null, slot_date: null, slot_stage: '', bg_calc: null, addl_bg_calc: null, load_sheet: null });
      applyForm(a, get, fd); N.refreshBg(a);
      N.auditLog(user, 'DRAFT_CREATED', a, '', 'DRAFT', a.project_name);
      N.flash('Draft saved. Upload documents and the bank guarantee, then submit.');
    } else {
      a = mine(user, id, true); applyForm(a, get, fd); N.refreshBg(a);
      N.auditLog(user, 'DRAFT_UPDATED', a, a.status, a.status, 'load ' + N.fmtG(a.estimated_load_kva) + ' kVA');
      N.flash('Saved. BG requirement recalculated.');
    }
    N.go('/apps/' + a.id); return true;
  });

  /* ---------- detail ---------- */
  route('/apps/:id', null, ({ user, params }) => {
    const a = mine(user, params.id), rs = N.RS(), hol = N.holidaySet(), CFG = N.CFG;
    const cs = N.allClocks(a, rs, hol), isp = user.role === 'promoter', canScr = can(user, 'scrutiny'), canCom = can(user, 'commercial'), canTech = can(user, 'technical');
    const items = N.checklistFor(a.constitution), docs = N.currentDocs(a);
    const checklist = items.map(it => [it, docs[it.code] || null]);
    const calc = a.bg_calc, addl = a.addl_bg_calc;
    const audits = N.T('audit_log').filter(e => e.app_id === a.id).sort((x, y) => y.id - x.id).slice(0, 80);
    const editable = ['DRAFT', 'RETURNED'].indexOf(a.status) >= 0 && isp && a.promoter_id === user.id;
    const miss = ['DRAFT', 'RETURNED'].indexOf(a.status) >= 0 ? N.readiness(a, rs) : [];
    const fmiss = a.status === 'CONDITIONAL_NOC' ? N.finalMissing(a) : [];
    const blockers = a.seq && ['FORWARDED', 'CONDITIONAL_NOC'].indexOf(a.status) >= 0 ? N.fcfsBlockers(a, a.status === 'FORWARDED' ? 'CONDITIONAL' : 'FINAL') : [];
    const docsOk = checklist.every(([it, d]) => !it.mandatory || (d && d.status === 'VERIFIED'));
    const auth = N.approvingAuthority(a.estimated_load_kva || 0, rs), flag = N.flagOf(a, rs, hol), verifiedBg = N.verifiedBgTotal(a);
    const bgs = N.bgsOf(a), certs = N.certsOf(a), props = N.propsOf(a), obs = N.obsOf(a), pr = N.promoterOf(a), dv = N.divOf(a);
    const f = (name, label, type, req, ph) => h`<div><label class="lbl">${label}</label><input class="inp" name="${name}" type="${type || 'text'}" ${req ? 'required' : ''} placeholder="${ph || ''}"></div>`;
    const order = ['DRAFT', 'SUBMITTED', 'FORWARDED', 'CONDITIONAL_NOC', 'FINAL_NOC'];
    const idx = order.indexOf(a.status) >= 0 ? order.indexOf(a.status) : (a.status === 'RETURNED' ? 1 : -1);
    const steps = [['DRAFT', '1 Draft'], ['SUBMITTED', '2 Scrutiny (DS)'], ['FORWARDED', '3 Commercial / BG'], ['CONDITIONAL_NOC', '4 Conditional NOC + technical window'], ['FINAL_NOC', '5 Final NOC']];
    const needForm = editable || (isp && a.status === 'CONDITIONAL_NOC' && a.addl_bg_required > 0);
    const badgeOf = (st, m) => 'b-' + (m[st] || 'slate');
    return h`
<div class="flex flex-wrap items-start justify-between gap-3 mb-3">
 <div><div class="text-xs text-slate-500">${a.app_no || 'Draft - not yet submitted'}${a.seq ? raw(' &middot; FCFS #' + a.seq) : ''}${a.received_at ? raw(' &middot; received ') : ''}${a.received_at ? ist(a.received_at) : ''}</div>
  <h1 class="text-xl font-bold text-brand-dark">${a.project_name}</h1>
  <div class="mt-1 flex flex-wrap gap-1.5 items-center">${status(a)}${flagB(flag)}<span class="chip">${num(a.estimated_load_kva)} kVA</span><span class="chip">${dv ? dv.name : ''}</span><span class="chip">${auth[1]}</span>${a.priority ? h`<span class="badge b-amber">Priority</span>` : ''}</div></div>
 <div class="flex flex-wrap gap-2">
  <a class="btn-outline btn-sm" href="#/apps/${a.id}/load">Load sheet${a.load_sheet_kva ? ' (' + num(a.load_sheet_kva) + ' kVA)' : ''}</a>
  ${editable ? h`<a class="btn-outline btn-sm" href="#/apps/${a.id}/edit">Edit details</a>` : ''}
  ${certs.map(c => h`<button type="button" class="btn btn-sm" data-pdf="${c.id}" data-mode="dl">${c.kind[0] + c.kind.slice(1).toLowerCase()} NOC PDF</button>`)}
 </div>
</div>
<div class="steps mb-3">${steps.map(([s, l], i) => h`<span class="step ${idx > i ? 'step-done' : idx === i ? 'step-now' : ''}">${l}</span>`)}${['REJECTED', 'WITHDRAWN', 'EXPIRED', 'REVOKED'].indexOf(a.status) >= 0 ? h`<span class="badge b-red">${CFG.STATUS_LABEL[a.status]}</span>` : ''}</div>
${a.status === 'RETURNED' ? h`<div class="alert a-warn mb-3"><b>Returned to promoter:</b> ${a.return_remark} <span class="text-xs">- all clocks are paused until you re-submit.</span></div>` : ''}
${['SUBMITTED', 'RETURNED', 'FORWARDED', 'CONDITIONAL_NOC', 'FINAL_NOC'].indexOf(a.status) >= 0 ? h`<div class="grid sm:grid-cols-3 gap-2 mb-3">${clockB(cs.c10, '10-day: Conditional NOC')}${clockB(cs.win, '3-month technical window')}${clockB(cs.overall, '45-day overall target')}</div>` : ''}
${blockers.length && canCom ? h`<div class="alert a-warn mb-3">FCFS: earlier file(s) ready for this stage: ${blockers.slice(0, 6).map((b, i) => h`${i ? ', ' : ''}<a class="underline" href="#/apps/${b.id}">${b.app_no}</a>`)}. Enforcement mode: <b>${rs.get('fcfs.enforcement')}</b>.</div>` : ''}

<div class="grid lg:grid-cols-3 gap-3">
<div class="lg:col-span-2 space-y-3 min-w-0">

 <div class="card"><h2 class="card-h">Application details</h2>
  <dl class="kv"><dt>Promoter</dt><dd>${pr.org_name || pr.name} (${a.constitution})</dd><dt>Contact</dt><dd>${pr.name}, ${pr.mobile}</dd>
  <dt>Location</dt><dd>${a.location}${a.district ? ', ' + a.district : ''}${a.area_acres ? ' - ' + num(a.area_acres) + ' acres' : ''}</dd>
  <dt>Licence</dt><dd>${a.licence_no || '-'} ${a.licence_authority ? '(' + a.licence_authority + ')' : ''}${a.licence_valid_upto ? ', valid to ' + istd(a.licence_valid_upto) : ''}</dd>
  <dt>Scheme / type</dt><dd>${a.scheme} / ${a.colony_type}</dd><dt>Electrical layout</dt><dd>${a.dt_summary || '-'}</dd>
  <dt>Estimated load</dt><dd>${num(a.estimated_load_kva)} kVA${a.verified_load_kva ? h` &rarr; verified <b>${num(a.verified_load_kva)} kVA</b>` : ''}</dd>
  <dt>LD system cost</dt><dd>${inr(a.ld_cost)}</dd><dt>NOC fee</dt><dd>${inr(a.fee_amount)} ${a.fee_ref ? '(ref ' + a.fee_ref + ')' : ''}</dd>
  <dt>Approving authority</dt><dd>${auth[1]} <span class="chip">${a.route}</span></dd></dl></div>

 <div class="card" id="documents"><h2 class="card-h">Documents (checklist for ${a.constitution})</h2>
  ${miss.length && isp ? h`<div class="alert a-warn mb-2 text-sm"><b>Before you can submit:</b><ul class="list-disc ml-5">${miss.map(x => h`<li>${x}</li>`)}</ul></div>` : ''}
  <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Document</th><th>File</th><th>Status</th><th></th></tr></thead><tbody>
  ${checklist.map(([it, d]) => h`<tr><td>${it.label}${it.mandatory ? h` <span class="text-red-600">*</span>` : ''}<div class="text-[11px] text-slate-400">${it.source}</div></td>
   <td class="text-xs">${d ? h`<a class="text-brand underline" href="#" data-doc="${d.id}">${d.filename}</a><div class="text-slate-500">rev ${d.revision} - ${(Math.round(d.size / 102.4) / 10)} KB - ${istd(d.uploaded_at)}</div>` : h`<span class="text-slate-400">not uploaded</span>`}</td>
   <td>${d ? h`<span class="badge ${d.status === 'VERIFIED' ? 'b-green' : d.status === 'INCOMPLETE' ? 'b-red' : 'b-slate'}">${d.status[0] + d.status.slice(1).toLowerCase()}</span>${d.review_remark ? h`<div class="text-xs text-slate-600">${d.review_remark}</div>` : ''}` : ''}</td>
   <td class="min-w-[11rem]">
    ${editable ? h`<form data-act="doc-upload" data-id="${a.id}" class="flex gap-1"><input type="hidden" name="code" value="${it.code}"><input type="file" name="file" required class="text-xs w-36" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"><button class="btn btn-sm">Upload</button></form>`
      : d && canScr && ['SUBMITTED', 'FORWARDED'].indexOf(a.status) >= 0 ? h`<form data-act="doc-review" data-id="${a.id}" data-doc="${d.id}" class="flex flex-wrap gap-1"><input name="remark" class="inp !mt-0 !py-1 w-28 text-xs" placeholder="remark"><button name="status" value="VERIFIED" class="btn-ok btn-sm">OK</button><button name="status" value="INCOMPLETE" class="btn-danger btn-sm">Defect</button></form>` : ''}
   </td></tr>`)}</tbody></table></div>
  ${editable ? h`<p class="hint mt-2">Allowed: ${rs.get('upload.allowed_ext')}; max ${rs.get('upload.max_mb')} MB per file. File content is checked, not just the extension. Files stay in this browser only.</p>` : ''}
 </div>

 <div class="card" id="bg"><h2 class="card-h">Bank guarantee</h2>
  ${calc ? h`<div class="alert a-info text-sm mb-2"><b>Required: ${inr(a.bg_required)}</b> <span class="text-xs">(${calc.formula})</span>
   <ul class="list-disc ml-5 mt-1 text-xs">${calc.lines.map(([t, v]) => h`<li>${t}: ${inr(v)}</li>`)}</ul>
   <div class="text-xs mt-1">SCD rate schedule effective ${calc.scd_effective_from}; <a class="underline" href="#/rules">source</a>. Verified so far: <b>${inr(verifiedBg)}</b>.</div>
   ${(calc.warnings || []).map(w => h`<div class="text-xs text-amber-800">${w}</div>`)}</div>` : ''}
  <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Kind</th><th>BG no. / bank</th><th>Amount</th><th>Valid / claim up to</th><th>Status</th><th></th></tr></thead><tbody>
  ${bgs.length ? bgs.map(g => h`<tr><td>${g.kind === 'ADDL' ? 'Additional' : '35% BG'}</td><td>${g.bg_no}<div class="text-xs text-slate-500">${g.bank} ${g.branch}</div></td><td>${inr(g.amount)}</td><td class="text-xs">${istd(g.valid_upto)}<br>${istd(g.claim_upto)}</td>
   <td><span class="badge ${g.status === 'VERIFIED' ? 'b-green' : g.status === 'REJECTED' ? 'b-red' : 'b-amber'}">${g.status[0] + g.status.slice(1).toLowerCase()}</span>${g.remark ? h`<div class="text-xs">${g.remark}</div>` : ''}${g.bank_confirmation_ref ? h`<div class="text-[11px] text-slate-500">bank ref ${g.bank_confirmation_ref}</div>` : ''}</td>
   <td>${canCom && g.status === 'PENDING' && ['FORWARDED', 'CONDITIONAL_NOC'].indexOf(a.status) >= 0 ? h`<form data-act="bg-verify" data-id="${a.id}" data-bg="${g.id}" class="flex flex-wrap gap-1"><input name="bank_ref" class="inp !mt-0 !py-1 w-24 text-xs" placeholder="bank ref"><input name="remark" class="inp !mt-0 !py-1 w-24 text-xs" placeholder="remark"><button name="decision" value="ok" class="btn-ok btn-sm">Verify</button><button name="decision" value="no" class="btn-danger btn-sm">Reject</button></form>` : ''}</td></tr>`) : h`<tr><td colspan="6" class="text-slate-500">No BG recorded yet.</td></tr>`}</tbody></table></div>
  ${needForm ? h`<form data-act="bg-add" data-id="${a.id}" class="mt-3 grid sm:grid-cols-4 gap-2 border-t pt-3">
   <input type="hidden" name="kind" value="${a.status === 'CONDITIONAL_NOC' ? 'ADDL' : 'BG35'}">
   <div class="sm:col-span-4 text-sm font-medium">${a.status === 'CONDITIONAL_NOC' ? 'Furnish additional BG: ' + inr(a.addl_bg_required) : 'Add bank guarantee details'}</div>
   ${f('bg_no', 'BG number', 'text', true)}${f('bank', 'Bank', 'text', true)}${f('branch', 'Branch')}${f('amount', 'Amount (Rs)', 'text', true)}
   ${f('issue_date', 'Issue date', 'date')}${f('valid_upto', 'Valid up to', 'date')}${f('claim_upto', 'Claim period up to', 'date')}
   <div><label class="lbl">Scanned BG copy</label><input type="file" name="file" class="text-xs mt-2" accept=".pdf,.jpg,.jpeg,.png"></div>
   <div class="sm:col-span-4"><button class="btn btn-sm">Record BG</button></div></form>` : ''}
 </div>

 ${['CONDITIONAL_NOC', 'FINAL_NOC'].indexOf(a.status) >= 0 || props.length ? h`
 <div class="card" id="technical"><h2 class="card-h">Technical proposal (DS)</h2>
  ${props.length ? props.map(p => { const sub = N.U(p.submitted_by), doc = p.doc_id ? N.byId('documents', p.doc_id) : null; return h`<div class="border rounded-lg p-2 mb-2 text-sm"><div class="flex justify-between"><b>Version ${p.version}</b><span class="badge ${p.status === 'ACCEPTED' ? 'b-green' : p.status === 'SUBMITTED' ? 'b-amber' : 'b-red'}">${p.status[0] + p.status.slice(1).toLowerCase()}</span></div>
   <div>Source: ${p.feeder_source}</div><div class="text-slate-700">${p.dt_plan}</div><div class="text-xs text-slate-500">${num(p.proposed_load_kva)} kVA - ${sub ? sub.name : ''} - ${ist(p.submitted_at)}${doc ? h` - <a class="text-brand underline" href="#" data-doc="${doc.id}">attachment</a>` : ''}</div>${p.remarks ? h`<div class="text-xs">${p.remarks}</div>` : ''}${p.review_remark ? h`<div class="text-xs text-slate-600">Review: ${p.review_remark}</div>` : ''}
   ${canCom && p.status === 'SUBMITTED' && a.status === 'CONDITIONAL_NOC' ? h`<form data-act="tech-review" data-id="${a.id}" data-tp="${p.id}" class="flex gap-1 mt-1"><input name="remark" class="inp !mt-0 !py-1 text-xs" placeholder="remark"><button name="decision" value="accept" class="btn-ok btn-sm">Accept</button><button name="decision" value="return" class="btn-danger btn-sm">Return</button></form>` : ''}</div>`; }) : h`<p class="text-sm text-slate-500">No technical proposal submitted yet.</p>`}
  ${canTech && a.status === 'CONDITIONAL_NOC' && !a.tech_accepted_at ? h`<form data-act="tech-submit" data-id="${a.id}" class="grid sm:grid-cols-2 gap-2 border-t pt-3 mt-2">
   ${f('feeder_source', 'Feeder / source (e.g. 66/11 kV GSS, 11 kV feeder)', 'text', true)}${f('proposed_load_kva', 'Load considered (kVA)')}
   <div class="sm:col-span-2"><label class="lbl">DT / network plan</label><textarea name="dt_plan" required class="inp" rows="2"></textarea></div>
   <div class="sm:col-span-2"><label class="lbl">Remarks</label><input name="remarks" class="inp"></div><div><label class="lbl">Attachment (optional)</label><input type="file" name="file" class="text-xs mt-2"></div>
   <div class="sm:col-span-2"><button class="btn btn-sm">Submit technical proposal</button></div></form>` : ''}
 </div>

 <div class="card" id="observations"><h2 class="card-h">Commercial observations &amp; clarifications</h2>
  ${obs.length ? obs.map(o => { const rai = N.U(o.raised_by); return h`<div class="border rounded-lg p-2 mb-2 text-sm"><div class="flex justify-between gap-2"><span><b>#${o.no}</b> <span class="chip">${o.category}</span> ${o.text}</span><span class="badge ${o.status === 'CLOSED' ? 'b-green' : o.status === 'CLARIFIED' ? 'b-blue' : 'b-amber'}">${o.status[0] + o.status.slice(1).toLowerCase()}</span></div>
   <div class="text-xs text-slate-500">${rai ? rai.name : ''} - ${ist(o.raised_at)}</div>
   ${N.clarsOf(o).map(c => { const cu = N.U(c.by_user), cd = c.doc_id ? N.byId('documents', c.doc_id) : null; return h`<div class="ml-3 mt-1 pl-2 border-l-2 border-brand/40 text-sm">${c.text}<div class="text-xs text-slate-500">${cu ? cu.name : ''} - ${ist(c.at)}${cd ? h` - <a class="text-brand underline" href="#" data-doc="${cd.id}">attachment</a>` : ''}</div></div>`; })}
   ${o.close_remark ? h`<div class="text-xs text-slate-600 mt-1">Closing remark: ${o.close_remark}</div>` : ''}
   ${isp && o.status !== 'CLOSED' && a.status === 'CONDITIONAL_NOC' ? h`<form data-act="clarify" data-id="${a.id}" data-ob="${o.id}" class="mt-2 flex flex-wrap gap-2 items-end"><div class="flex-1 min-w-[14rem]"><input name="text" class="inp !mt-0" required placeholder="Your clarification"></div><input type="file" name="file" class="text-xs"><button class="btn btn-sm">Submit</button></form>` : ''}
   ${canCom && a.status === 'CONDITIONAL_NOC' && o.status !== 'CLOSED' ? h`<form data-act="ob-close" data-id="${a.id}" data-ob="${o.id}" class="mt-2 flex gap-1"><input name="remark" class="inp !mt-0 !py-1 text-xs" placeholder="remark"><button name="action" value="close" class="btn-ok btn-sm">Close</button></form>`
     : canCom && a.status === 'CONDITIONAL_NOC' && o.status === 'CLOSED' ? h`<form data-act="ob-close" data-id="${a.id}" data-ob="${o.id}" class="mt-1"><input type="hidden" name="remark" value="Re-opened"><button name="action" value="reopen" class="btn-outline btn-sm">Re-open</button></form>` : ''}</div>`; }) : h`<p class="text-sm text-slate-500">No observations.</p>`}
  ${canCom && a.status === 'CONDITIONAL_NOC' ? h`<form data-act="observe" data-id="${a.id}" class="border-t pt-3 mt-2 grid sm:grid-cols-4 gap-2">
   <div><label class="lbl">Category</label><select name="category" class="inp"><option value="LOAD">Load</option><option value="BG">BG</option><option value="DOCS">Documents</option><option value="TECHNICAL">Technical</option></select></div>
   <div class="sm:col-span-3"><label class="lbl">Observation</label><input name="text" required class="inp"></div><div class="sm:col-span-4"><button class="btn btn-sm">Raise observation</button></div></form>` : ''}
 </div>

 <div class="card" id="verification"><h2 class="card-h">Load verification (Commercial)</h2>
  ${a.load_verified_at ? h`<dl class="kv"><dt>Declared</dt><dd>${num(a.estimated_load_kva)} kVA</dd><dt>Verified</dt><dd><b>${num(a.verified_load_kva)} kVA</b> on ${ist(a.load_verified_at)}</dd>
   <dt>Additional BG</dt><dd>${a.addl_bg_required > 0 ? h`<b>${inr(a.addl_bg_required)}</b> required (verified load is higher)` : 'None'}</dd></dl>
   ${addl ? h`<ul class="list-disc ml-5 text-xs mt-1">${addl.lines.map(([t, v]) => h`<li>${t}: ${inr(v)}</li>`)}</ul>` : ''}` : h`<p class="text-sm text-slate-500">Not yet verified.</p>`}
  ${canCom && a.status === 'CONDITIONAL_NOC' ? h`<form data-act="verify-load" data-id="${a.id}" class="grid sm:grid-cols-4 gap-2 border-t pt-3 mt-2">
   ${f('verified_kva', 'Verified load (kVA)', 'text', true)}${f('verified_ld_cost', 'Verified LD cost (Rs, optional)')}<div class="sm:col-span-2"><label class="lbl">Remark</label><input name="remark" class="inp"></div>
   <div class="sm:col-span-4"><button class="btn btn-sm">Record verification</button> <span class="hint">If the verified load is higher, the additional BG is calculated automatically and the promoter is asked to furnish it.</span></div></form>` : ''}
 </div>` : ''}

 <div class="card" id="noc"><h2 class="card-h">NOC</h2>
  ${certs.length ? certs.map(c => h`<div class="flex flex-wrap justify-between items-center gap-2 border-b py-2 text-sm"><div><b>${c.noc_no}</b> <span class="badge ${c.status === 'VALID' ? 'b-green' : c.status === 'SUPERSEDED' ? 'b-slate' : 'b-red'}">${c.kind[0] + c.kind.slice(1).toLowerCase()} - ${c.status[0] + c.status.slice(1).toLowerCase()}</span><div class="text-xs text-slate-500">Issued ${ist(c.issued_at)} - valid to ${istd(c.valid_upto)} - <a class="text-brand underline" href="verify.html?code=${c.code}">public verification page</a></div><div id="pdf-links-${c.id}"></div></div>
   <div class="flex gap-1 flex-wrap"><button type="button" class="btn-outline btn-sm" data-pdf="${c.id}" data-mode="dl">Download PDF</button><button type="button" class="btn-outline btn-sm" data-pdf="${c.id}" data-mode="open">Open</button>${user.role === 'admin' && c.status === 'VALID' ? h`<form data-act="revoke" data-id="${a.id}" data-cert="${c.id}" data-confirm="Revoke this NOC?" class="flex gap-1"><input name="reason" class="inp !mt-0 !py-1 text-xs w-28" placeholder="reason" required><button class="btn-danger btn-sm">Revoke</button></form>` : ''}</div></div>`) : h`<p class="text-sm text-slate-500">No NOC issued yet.</p>`}
  ${canCom && a.status === 'FORWARDED' ? h`<form data-act="issue-cond" data-id="${a.id}" class="grid sm:grid-cols-3 gap-2 border-t pt-3 mt-2" data-confirm="Issue the Conditional NOC?">
   <div><label class="lbl">Temporary connection (kW, max ${rs.get('temp.max_kw')})</label><input name="temp_kw" class="inp" value="0"></div><div class="sm:col-span-2"><label class="lbl">Reason (if overriding FCFS / BG not verified)</label><input name="reason" class="inp"></div>
   <div class="sm:col-span-3"><button class="btn-ok">Issue Conditional NOC</button> <span class="hint">Requires verified documents and a verified BG for the required amount.</span></div></form>` : ''}
  ${canCom && a.status === 'CONDITIONAL_NOC' ? h`<div class="border-t pt-3 mt-2">${fmiss.length ? h`<div class="alert a-warn text-sm"><b>Final NOC blocked:</b><ul class="list-disc ml-5">${fmiss.map(x => h`<li>${x}</li>`)}</ul></div>` : h`<form data-act="issue-final" data-id="${a.id}" data-confirm="Issue the Final NOC?" class="flex flex-wrap gap-2 items-end"><div class="flex-1 min-w-[12rem]"><label class="lbl">Reason (if overriding FCFS)</label><input name="reason" class="inp"></div><button class="btn-ok">Issue Final NOC</button></form>`}</div>` : ''}
 </div>
</div>

<div class="space-y-3 min-w-0">
 ${isp && editable ? h`<div class="card"><h2 class="card-h">Submit</h2><p class="text-sm text-slate-600 mb-2">On submission you receive a strictly sequential FCFS number with time stamp; the 10-day and 45-day clocks start.</p>
  <form data-act="submit" data-id="${a.id}" data-confirm="Submit the application? Documents and BG details cannot be changed afterwards unless returned."><button class="btn w-full" ${miss.length ? 'disabled' : ''}>Submit application</button></form>${miss.length ? h`<p class="hint mt-1">${miss.length} item(s) outstanding.</p>` : ''}</div>` : ''}
 ${isp && ['DRAFT', 'RETURNED', 'SUBMITTED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(a.status) >= 0 ? h`<form data-act="withdraw" data-id="${a.id}" data-confirm="Withdraw this application? This cannot be undone." class="card"><label class="lbl">Withdraw application</label><input name="reason" class="inp" placeholder="Reason"><button class="btn-danger btn-sm mt-2">Withdraw</button></form>` : ''}
 ${canScr && a.status === 'SUBMITTED' ? h`<div class="card"><h2 class="card-h">DS scrutiny</h2>
  <p class="text-sm">${docsOk ? 'All mandatory documents verified.' : 'Verify all mandatory documents before forwarding.'}</p>
  <form data-act="forward" data-id="${a.id}" class="mt-2"><button class="btn-ok w-full" ${docsOk ? '' : 'disabled'}>Forward to Commercial / Nodal Officer</button></form>
  <form data-act="return" data-id="${a.id}" class="mt-3"><label class="lbl">Return to promoter (pauses clocks)</label><textarea name="remark" class="inp" rows="2" required placeholder="Deficiencies / remarks"></textarea><button class="btn-outline btn-sm mt-2">Return</button></form></div>` : ''}
 ${canCom && ['SUBMITTED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(a.status) >= 0 ? h`<form data-act="reject" data-id="${a.id}" data-confirm="Reject this application?" class="card"><label class="lbl">Reject application</label><input name="reason" class="inp" required placeholder="Reason"><button class="btn-danger btn-sm mt-2">Reject</button></form>` : ''}
 <div class="card"><h2 class="card-h">History (audit)</h2><div class="max-h-96 overflow-y-auto pr-1">
  ${audits.length ? audits.map(e => h`<div class="tl"><div class="text-sm font-medium">${e.action.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())}${e.to_status && e.to_status !== e.from_status ? h` <span class="chip">${e.to_status}</span>` : ''}</div><div class="text-xs text-slate-500">${ist(e.ts)} - ${e.actor_name}</div>${e.detail ? h`<div class="text-xs text-slate-700">${trunc(e.detail, 160)}</div>` : ''}</div>`) : h`<p class="text-sm text-slate-500">No history yet.</p>`}</div></div>
</div>
</div>`;
  });

  /* ---------- actions ---------- */
  const APPID = form => +form.getAttribute('data-id');
  const appFor = (user, form, perm) => { const a = N.APP(APPID(form)); if (!a || !N.canView(user, a)) throw new N.WorkflowError('Application not found'); if (perm && !can(user, perm)) throw new N.WorkflowError('Your role cannot do this'); return a; };
  const mineAct = (user, form) => { const a = appFor(user, form, 'apply'); if (a.promoter_id !== user.id) throw new N.WorkflowError('Application not found'); return a; };
  const done = (msg, anchor, warn) => { if (warn) N.flash(warn, 'warn'); N.flash(msg); N.anchor = anchor || null; };
  const run = (res, msg, anchor) => { const warn = Array.isArray(res) && typeof res[1] === 'string' && res[1] ? res[1] : ''; done(msg, anchor, warn); };
  async function storeDoc(a, user, file, rs, category, label, code) {
    if (!file || !file.name || !file.size) return null;
    const bytes = await N.readFile(file); if (!bytes.length) return null;
    const [name, mime, sha] = N.validateUpload(file.name, bytes, rs);
    const d = N.insert('documents', { app_id: a.id, category, code: code || '', label, filename: name, mime, size: bytes.length, sha256: sha, revision: 1, is_current: true, status: 'PENDING', review_remark: '', reviewed_by: null, reviewed_at: null, uploaded_by: user.id, uploaded_at: N.nowIso() });
    await N.files.put(d.id, new Blob([bytes], { type: mime }));
    return d;
  }
  N.storeDoc = storeDoc;

  action('doc-upload', async ({ user, form, get, fd }) => {
    const a = mineAct(user, form), rs = N.RS();
    if (['DRAFT', 'RETURNED'].indexOf(a.status) < 0) throw new N.WorkflowError('Documents can only be uploaded to a draft or returned application');
    const items = {}; N.checklistFor(a.constitution).forEach(i => { items[i.code] = i; });
    const code = get('code'); if (!items[code]) throw new N.WorkflowError('Unknown document type');
    const file = fd.get('file'); if (!file || !file.name) throw new N.WorkflowError('Choose a file');
    const bytes = await N.readFile(file); const [name, mime, sha] = N.validateUpload(file.name, bytes, rs);
    let rev = 1;
    for (const d of N.docsOf(a)) if (d.category === 'APPLICATION' && d.code === code && d.is_current) { d.is_current = false; rev = d.revision + 1; }
    const d = N.insert('documents', { app_id: a.id, category: 'APPLICATION', code, label: items[code].label, filename: name, mime, size: bytes.length, sha256: sha, revision: rev, is_current: true, status: 'PENDING', review_remark: '', reviewed_by: null, reviewed_at: null, uploaded_by: user.id, uploaded_at: N.nowIso() });
    await N.files.put(d.id, new Blob([bytes], { type: mime }));
    N.auditLog(user, 'DOC_UPLOAD', a, '', '', items[code].label + ' (rev ' + rev + ') ' + name + ' ' + bytes.length + ' B sha256 ' + sha.slice(0, 12));
    done('Uploaded: ' + items[code].label, 'documents');
  });
  action('doc-review', async ({ user, form, get }) => {
    const a = appFor(user, form, 'scrutiny'), d = N.byId('documents', +form.getAttribute('data-doc'));
    if (!d || d.app_id !== a.id) throw new N.WorkflowError('Document not found');
    if (['SUBMITTED', 'FORWARDED'].indexOf(a.status) < 0) throw new N.WorkflowError('File is not under scrutiny');
    N.reviewDoc(d, user, get('status'), get('remark')); done('Document reviewed', 'documents');
  });
  action('bg-add', async ({ user, form, get, fd }) => {
    const a = mineAct(user, form), rs = N.RS(), kind = get('kind') || 'BG35';
    if (kind === 'BG35' && ['DRAFT', 'RETURNED'].indexOf(a.status) < 0) throw new N.WorkflowError('BG can only be changed while the application is a draft or returned');
    if (kind === 'ADDL' && (a.status !== 'CONDITIONAL_NOC' || a.addl_bg_required <= 0)) throw new N.WorkflowError('No additional BG is currently required');
    const amt = fnum(get('amount')), bgNo = get('bg_no').trim(), bank = get('bank').trim();
    if (amt <= 0 || !bgNo || !bank) { N.flash('BG number, bank and amount are required', 'err'); N.anchor = 'bg'; return false; }
    const doc = await storeDoc(a, user, fd.get('file'), rs, kind === 'BG35' ? 'BG' : 'ADDL_BG', 'Bank guarantee ' + bgNo);
    if (kind === 'BG35') for (const g of N.bgsOf(a)) if (g.kind === 'BG35' && ['PENDING', 'REJECTED'].indexOf(g.status) >= 0 && g.bg_no === bgNo) { g.status = 'REJECTED'; g.remark = 'Superseded by re-submission'; }
    const g = N.insert('bank_guarantees', { app_id: a.id, kind, bg_no: bgNo.slice(0, 60), bank: bank.slice(0, 120), branch: get('branch').trim().slice(0, 120), amount: amt, issue_date: fdate(get('issue_date')), valid_upto: fdate(get('valid_upto')), claim_upto: fdate(get('claim_upto')), doc_id: doc ? doc.id : null, status: 'PENDING', remark: '', bank_confirmation_ref: '', verified_by: null, verified_at: null, created_at: N.nowIso() });
    N.auditLog(user, 'BG_SUBMITTED', a, '', '', kind + ' ' + g.bg_no + ' ' + g.bank + ' ' + inr(amt) + ' valid ' + (g.valid_upto || 'None'));
    const warn = a.licence_valid_upto && g.valid_upto && g.valid_upto < a.licence_valid_upto ? 'Note: BG validity (' + N.fmtDMY(g.valid_upto) + ') is earlier than licence validity (' + N.fmtDMY(a.licence_valid_upto) + '). BG must be valid for the NOC period (Supply Code 2024 Reg. 12(4); CC 45/2024).' : '';
    done('BG details recorded - awaiting verification with the bank.', 'bg', warn);
  });
  action('submit', async ({ user, form }) => { const a = mineAct(user, form); N.submit(a, user); done('Submitted. Your FCFS number is recorded and the 10-day clock has started.'); });
  action('withdraw', async ({ user, form, get }) => { const a = mineAct(user, form); N.withdraw(a, user, get('reason') || 'Withdrawn by promoter'); done('Application withdrawn'); });
  action('clarify', async ({ user, form, get, fd }) => {
    const a = mineAct(user, form), ob = N.byId('observations', +form.getAttribute('data-ob')); if (!ob || ob.app_id !== a.id) throw new N.WorkflowError('Observation not found');
    const doc = await storeDoc(a, user, fd.get('file'), N.RS(), 'CLARIFICATION', 'Clarification to observation #' + ob.no);
    N.clarify(ob, user, get('text'), doc); done('Clarification submitted', 'observations');
  });
  action('return', async ({ user, form, get }) => { const a = appFor(user, form, 'scrutiny'); N.returnToPromoter(a, user, get('remark')); done('Returned to promoter - clocks paused'); });
  action('forward', async ({ user, form }) => { const a = appFor(user, form, 'scrutiny'); N.forward(a, user); done('Forwarded to Commercial / Nodal Officer'); });
  action('bg-verify', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'), g = N.byId('bank_guarantees', +form.getAttribute('data-bg')); if (!g || g.app_id !== a.id) throw new N.WorkflowError('BG not found'); N.verifyBg(g, user, get('decision') === 'ok', get('remark'), get('bank_ref')); done('BG decision recorded', 'bg'); });
  action('issue-cond', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'); run(N.issueConditional(a, user, fnum(get('temp_kw')), get('reason')), 'Conditional NOC issued', 'noc'); });
  action('tech-submit', async ({ user, form, get, fd }) => {
    const a = appFor(user, form, 'technical');
    const doc = await storeDoc(a, user, fd.get('file'), N.RS(), 'TECH', 'Technical proposal');
    N.submitTech(a, user, get('feeder_source'), get('dt_plan'), fnum(get('proposed_load_kva')), get('remarks'), doc); done('Technical proposal submitted', 'technical');
  });
  action('tech-review', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'), tp = N.byId('technical_proposals', +form.getAttribute('data-tp')); if (!tp || tp.app_id !== a.id) throw new N.WorkflowError('Proposal not found'); N.reviewTech(tp, user, get('decision') === 'accept', get('remark')); done('Technical proposal reviewed', 'technical'); });
  action('observe', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'); N.raiseObservation(a, user, get('category') || 'LOAD', get('text')); done('Observation raised - promoter notified', 'observations'); });
  action('ob-close', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'), ob = N.byId('observations', +form.getAttribute('data-ob')); if (!ob || ob.app_id !== a.id) throw new N.WorkflowError('Observation not found'); N.closeObservation(ob, user, get('remark'), get('action') === 'reopen'); done('Observation updated', 'observations'); });
  action('verify-load', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'); N.verifyLoad(a, user, fnum(get('verified_kva')), fnum(get('verified_ld_cost')), get('remark')); done('Load verification recorded', 'verification'); });
  action('issue-final', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'); run(N.issueFinal(a, user, get('reason')), 'Final NOC issued', 'noc'); });
  action('reject', async ({ user, form, get }) => { const a = appFor(user, form, 'commercial'); N.reject(a, user, get('reason')); done('Application rejected'); });
  action('revoke', async ({ user, form, get }) => { if (user.role !== 'admin') throw new N.WorkflowError('Admin only'); const c = N.byId('noc_certificates', +form.getAttribute('data-cert')); if (!c) throw new N.WorkflowError('Certificate not found'); N.revokeCert(c, user, get('reason')); done('Certificate revoked', 'noc'); });

  /* ---------- load sheet ---------- */
  function sheetFromForm(fd) {
    const g = k => fd.getAll(k).map(String), cats = g('cat'), sizes = g('size'), qtys = g('qty'), floors = g('floors'), kws = g('kw'), subs = g('sub'), labels = g('label'), lines = [];
    cats.forEach((c, i) => { if (!c) return; lines.push({ cat: c, size: fnum(sizes[i]), qty: fnum(qtys[i], 1) || 1, floors: fnum(floors[i], 1) || 1, kw: fnum(kws[i]), sub: subs[i], label: (labels[i] || '').slice(0, 80) }); });
    return { meta: { plot_area_sqyd: fnum(fd.get('plot_area')), covered_area_sqyd: fnum(fd.get('covered_area')), far: fnum(fd.get('far')) }, lines };
  }
  let loadDraft = null; // result of an unsaved "calculate" is kept here so the form is re-rendered with the values
  function loadView(user, a, sheet, blank) {
    const rs = N.RS(), meta = Object.assign({}, sheet.meta || {}, { colony_type: a.colony_type }), res = N.loadVerify(sheet, a.estimated_load_kva, rs, meta);
    const lines = sheet.lines || [], CATS = N.CATS, SUBS = N.ACTUAL_SUBS, m = sheet.meta || {};
    const editable = user.role === 'promoter' && a.promoter_id === user.id && ['DRAFT', 'RETURNED'].indexOf(a.status) >= 0;
    const total = lines.length + blank, subEntries = Array.isArray(SUBS) ? SUBS : Object.entries(SUBS), catEntries = Object.entries(CATS);
    const pct = x => Math.round(x * 100);
    return h`
<div class="flex flex-wrap justify-between items-start gap-2 mb-3"><div><div class="text-xs text-slate-500">${a.app_no || 'Draft'} - ${a.project_name} - declared ${num(a.estimated_load_kva)} kVA</div><h1 class="text-xl font-bold text-brand-dark">Load sheet - calculator &amp; verifier</h1></div><a class="btn-outline btn-sm" href="#/apps/${a.id}">&larr; Back to application</a></div>
<div class="alert a-info text-sm mb-3">Computed per <b>${res.ref}</b>. Demand factors: residential ${pct(res.dfs.res)}%, commercial ${pct(res.dfs.comm)}%, actual-load items 100%; power factor ${res.pf}. Items marked <span class="badge b-blue">working rule</span> are departmental practice <b>to be ratified</b> and can be switched off by the admin (Rules &rarr; Load assessment).</div>
<form data-act="load-sheet" data-id="${a.id}" class="space-y-3">
 <div class="card grid sm:grid-cols-3 gap-3"><div><label class="lbl">Plot / site area (sq yd)</label><input class="inp" name="plot_area" inputmode="decimal" value="${m.plot_area_sqyd || ''}"></div>
  <div><label class="lbl">Total covered area (sq yd)</label><input class="inp" name="covered_area" inputmode="decimal" value="${m.covered_area_sqyd || ''}"></div>
  <div><label class="lbl">FAR (leave blank to derive)</label><input class="inp" name="far" inputmode="decimal" value="${m.far || ''}"></div></div>
 <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>Category (Reg. 12(2))</th><th>Item (as-actual)</th><th>Size</th><th>Qty</th><th>Floors</th><th>kW (actual)</th><th>Label</th></tr></thead><tbody id="rows">
 ${Array.from({ length: total }, (_, i) => { const l = i < lines.length ? lines[i] : {}; return h`
  <tr><td><select name="cat" class="inp !mt-0 !py-1 min-w-[16rem]"><option value="">-</option>${catEntries.map(([k, v]) => h`<option value="${k}" ${l.cat === k ? 'selected' : ''}>${v[0]}</option>`)}</select></td>
  <td><select name="sub" class="inp !mt-0 !py-1">${subEntries.map(([k, v]) => h`<option value="${k}" ${l.sub === k ? 'selected' : ''}>${v}</option>`)}</select></td>
  <td><input name="size" inputmode="decimal" class="inp !mt-0 !py-1 w-24" value="${l.size ? gstr(l.size) : ''}"></td><td><input name="qty" inputmode="decimal" class="inp !mt-0 !py-1 w-20" value="${l.qty ? gstr(l.qty) : 1}"></td><td><input name="floors" inputmode="decimal" class="inp !mt-0 !py-1 w-16" value="${l.floors ? gstr(l.floors) : 1}"></td>
  <td><input name="kw" inputmode="decimal" class="inp !mt-0 !py-1 w-24" value="${l.kw ? gstr(l.kw) : ''}"></td><td><input name="label" class="inp !mt-0 !py-1" value="${l.label || ''}"></td></tr>`; })}
 </tbody></table><button type="button" data-addrow class="btn-outline btn-sm mt-2">+ Add row</button>
 <details class="mt-2 text-xs text-slate-600"><summary>What to enter per category</summary><ul class="list-disc ml-5 mt-1">${catEntries.map(([k, v]) => h`<li><b>${v[0]}</b> - ${v[2]}. ${v[3] || ''}</li>`)}</ul></details></div>
 <div class="flex flex-wrap gap-2"><button class="btn" name="action" value="calc">Calculate &amp; verify</button>${editable ? h`<button class="btn-outline" name="action" value="save">Save load sheet</button><button class="btn-ok" name="action" value="apply">Save &amp; use as estimated load</button>` : ''}</div>
</form>
<div class="grid lg:grid-cols-3 gap-3 mt-4">
 <div class="lg:col-span-2 card overflow-x-auto"><h2 class="card-h">Computation</h2>
  <table class="tbl"><thead><tr><th>Item</th><th>Basis (source)</th><th class="text-right">Connected kW</th><th class="text-right">DF</th><th class="text-right">Demand kW</th></tr></thead><tbody>
  ${res.rows.length ? res.rows.map(r => h`<tr><td>${r.label || CATS[r.cat][0]}${r.cat === 'ACTUAL' ? h` <span class="chip">${r.sub}</span>` : ''}${r.cat === 'COMMON_SWM' ? h` <span class="badge b-blue">working rule</span>` : ''}</td><td class="text-xs text-slate-600">${r.cite}</td><td class="text-right">${num(r.kw_conn, 2)}</td><td class="text-right">${pct(r.df)}%</td><td class="text-right">${num(r.kw_dem, 2)}</td></tr>`) : h`<tr><td colspan="5" class="text-slate-500">Enter lines above and press Calculate.</td></tr>`}
  </tbody><tfoot><tr class="font-semibold"><td colspan="4" class="text-right pt-2">Total demand (kW)</td><td class="text-right pt-2">${num(res.demand_kw, 2)}</td></tr><tr class="font-semibold"><td colspan="4" class="text-right">&divide; power factor ${res.pf} = load (kVA)</td><td class="text-right text-lg text-brand-dark" id="load-kva">${num(res.kva, 2)}</td></tr><tr><td colspan="4" class="text-right text-xs text-slate-500">= ${num(res.mva, 3)} MVA</td><td></td></tr></tfoot></table></div>
 <div class="card"><h2 class="card-h">Scrutiny flags</h2>
  ${res.flags.length ? res.flags.map(([sev, msg, cite]) => h`<div class="alert mb-2 text-xs ${sev === 'high' ? 'a-err' : sev === 'warn' ? 'a-warn' : sev === 'ok' ? 'a-ok' : 'a-info'}">${msg}${cite ? h`<div class="text-[11px] opacity-75 mt-0.5">Source: ${cite}</div>` : ''}</div>`) : h`<p class="text-sm text-slate-500">No flags.</p>`}</div>
</div>`;
  }
  route('/apps/:id/load', null, ({ user, params }) => {
    const a = mine(user, params.id);
    let sheet, blank = 4;
    if (loadDraft && loadDraft.id === a.id) { sheet = loadDraft.sheet; blank = 2; loadDraft = null; }
    else sheet = a.load_sheet || { meta: {}, lines: [] };
    return loadView(user, a, sheet, blank);
  });
  G.addEventListener('hashchange', () => { loadDraft = null; });
  action('load-sheet', async ({ user, form, get, fd }) => {
    const a = N.APP(APPID(form)); if (!a || !N.canView(user, a)) throw new N.WorkflowError('Application not found');
    const act = get('action') || 'calc', sheet = sheetFromForm(fd), rs = N.RS();
    const editable = user.role === 'promoter' && a.promoter_id === user.id && ['DRAFT', 'RETURNED'].indexOf(a.status) >= 0;
    const res = N.loadVerify(sheet, a.estimated_load_kva, rs, Object.assign({}, sheet.meta, { colony_type: a.colony_type }));
    if ((act === 'save' || act === 'apply') && editable) {
      a.load_sheet = sheet; a.load_sheet_kva = res.kva;
      if (act === 'apply') { a.estimated_load_kva = res.kva; N.refreshBg(a, rs); }
      N.auditLog(user, 'LOAD_SHEET_SAVED', a, '', '', 'computed ' + N.fmtG(res.kva) + ' kVA; applied=' + (act === 'apply' ? 'True' : 'False'));
      N.flash('Load sheet saved' + (act === 'apply' ? ' and estimated load updated (BG recalculated).' : '.'));
    } else loadDraft = { id: a.id, sheet };
    return true;
  });
})(window);
