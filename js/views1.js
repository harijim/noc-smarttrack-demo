/* Views part 1: login, register, dashboards, application list, queue, notifications. */
(function (G) {
  'use strict';
  const N = G.NOC, { h, raw, num, inr } = N, V = N.V, { ist, istd, status, flagB, clockB, sel, trunc, decorate } = V;
  const route = N.route, action = N.action;
  const DEMO_LOGINS = [['Promoter / Developer', [['promoter', 'Aman Verma'], ['promoter2', 'Kiran Bedi'], ['promoter3', 'Rohit Anand']]], ['DS Division Officer', [['ds', 'Mohali'], ['ds2', 'Patiala'], ['ds3', 'Ludhiana'], ['ds4', 'Amritsar']]], ['Commercial / Nodal Officer', [['nodal', '']]], ['Admin / CE Commercial', [['admin', '']]]];

  route('/login', null, ({ user, query }) => {
    if (user) { N.go(query.next && query.next.startsWith('/') ? query.next : '/'); return h``; }
    return h`
<div class="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto mt-2">
 <form data-act="login" class="card space-y-3" autocomplete="on">
  <h1 class="text-xl font-bold text-brand-dark">${N.t('login')}</h1>
  <div id="login-err"></div>
  <input type="hidden" name="next" value="${query.next || '/'}">
  <div><label class="lbl" for="u">Username</label><input id="u" name="username" class="inp" autocomplete="username" autocapitalize="none" required></div>
  <div><label class="lbl" for="p">Password</label><input id="p" name="password" type="password" class="inp" autocomplete="current-password" required></div>
  <button class="btn w-full">${N.t('login')}</button>
  <p class="text-sm text-slate-600">New promoter / developer? <a class="text-brand underline" href="#/register">Register here</a>. Public: <a class="text-brand underline" href="#/verify">verify a NOC</a>.</p>
 </form>
 <div class="card">
  <h2 class="card-h">Demo logins <span class="normal-case">(password <code>demo123</code>)</span></h2>
  <table class="tbl"><thead><tr><th>Role</th><th>Username</th></tr></thead><tbody>
   ${DEMO_LOGINS.map(([role, us]) => h`<tr><td>${role}</td><td>${us.map(([u, n], i) => h`${i ? ', ' : ''}<button type="button" class="underline text-brand" data-fill="${u}"><code>${u}</code></button>${n ? ' (' + n + ')' : ''}`)}</td></tr>`)}
  </tbody></table>
  <p class="hint mt-2">All data is fictional and lives only in this browser (nothing is sent anywhere). Tap a username to fill it in. Process: FCFS application with 35% BG &rarr; Conditional NOC within 10 days &rarr; 3-month technical window &rarr; Final NOC, inside a 45-day ageing target (per requirement document; see Rules &amp; references).</p>
 </div>
</div>`;
  });
  document.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('[data-fill]'); if (!b) return; const u = document.getElementById('u'), p = document.getElementById('p'); if (u) { u.value = b.getAttribute('data-fill'); if (p) { p.value = 'demo123'; p.focus(); } } });
  action('login', async ({ get }) => {
    const u = N.login(get('username'), get('password'));
    if (!u) { N.flash('Invalid username or password', 'err'); return false; }
    const nx = get('next'); N.go(nx && nx.startsWith('/') && !nx.startsWith('//') && nx !== '/login' ? nx : '/');
    return true;
  });

  route('/register', null, ({ user }) => {
    if (user) { N.go('/'); return h``; }
    return h`
<form data-act="register" class="card max-w-2xl mx-auto space-y-3">
 <h1 class="text-xl font-bold text-brand-dark">Promoter / developer registration</h1>
 <p class="hint">Demo: the account is created only in this browser.</p>
 <div class="grid sm:grid-cols-2 gap-3">
  <div><label class="lbl">Organisation / firm name</label><input name="org_name" class="inp" required></div>
  <div><label class="lbl">Constitution</label><select name="constitution" class="inp" required>${N.CFG.CONSTITUTIONS.map(([c, l]) => h`<option value="${c}">${l}</option>`)}</select></div>
  <div><label class="lbl">Authorised signatory name</label><input name="name" class="inp" required></div>
  <div><label class="lbl">Mobile</label><input name="mobile" class="inp" inputmode="tel" required></div>
  <div><label class="lbl">Email</label><input name="email" type="email" class="inp" required></div>
  <div><label class="lbl">Username</label><input name="username" class="inp" required autocomplete="username" autocapitalize="none"></div>
  <div class="sm:col-span-2"><label class="lbl">Address</label><input name="address" class="inp"></div>
  <div><label class="lbl">Password</label><input name="password" type="password" class="inp" required autocomplete="new-password"><p class="hint">Min 8 characters, letters and digits.</p></div>
 </div>
 <button class="btn">Register</button> <a class="text-sm text-brand underline ml-2" href="#/login">Already registered? Sign in</a>
</form>`;
  });
  action('register', async ({ get }) => {
    const username = get('username'), password = get('password'), email = get('email'), mobile = get('mobile'), constitution = get('constitution');
    let err = null;
    if (!/^[A-Za-z0-9_.-]{4,30}$/.test(username)) err = 'Username: 4-30 letters, digits, . _ -';
    else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) err = 'Password must be at least 8 characters with letters and digits';
    else if (!N.CFG.CONSTITUTIONS.some(c => c[0] === constitution)) err = 'Choose a constitution';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err = 'Enter a valid email';
    else if (!/^[0-9+ -]{10,15}$/.test(mobile)) err = 'Enter a valid mobile number';
    else if (N.T('users').some(u => u.username.toLowerCase() === username.toLowerCase())) err = 'Username already taken';
    if (err) { N.flash(err, 'err'); return false; }
    const u = N.insert('users', { username: username.toLowerCase(), pw_hash: N.hashPw(username.toLowerCase(), password), name: get('name').trim(), role: 'promoter', designation: '', email: email.trim(), mobile: mobile.trim(), org_name: get('org_name').trim(), constitution, address: get('address').trim(), division_id: null, active: true, created_at: N.nowIso(), last_login: null });
    N.auditLog(u, 'REGISTER', null, '', '', get('org_name').trim() + ' (' + constitution + ')');
    N.save(); N.login(u.username, password);
    N.flash('Registration complete. You can now create an application.'); N.go('/');
    return true;
  });

  /* ---------- dashboard ---------- */
  route('/', null, ({ user }) => {
    const rs = N.RS(), rows = decorate(N.visibleApps(user), rs);
    if (user.role === 'promoter') {
      const notifs = N.T('notifications').filter(n => n.user_id === user.id).sort((a, b) => b.id - a.id).slice(0, 6);
      const todo = [];
      for (const r of rows) {
        const a = r.a;
        if (a.status === 'DRAFT') todo.push([a, 'Complete and submit your application']);
        else if (a.status === 'RETURNED') todo.push([a, 'Returned: ' + (a.return_remark || 'see remarks')]);
        else if (a.status === 'CONDITIONAL_NOC') {
          const oo = N.obsOf(a).filter(o => o.status === 'OPEN');
          if (oo.length) todo.push([a, oo.length + ' observation(s) await your clarification']);
          if (a.addl_bg_required > 0 && N.verifiedBgTotal(a, ['ADDL']) + 0.5 < a.addl_bg_required && !N.bgsOf(a).some(g => g.kind === 'ADDL' && g.status === 'PENDING')) todo.push([a, 'Additional BG of ' + inr(a.addl_bg_required) + ' to be furnished']);
        }
      }
      return h`
<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h1 class="text-xl font-bold text-brand-dark">Welcome, ${user.org_name || user.name}</h1><a class="btn" href="#/apps/new">+ ${N.t('new')}</a></div>
${todo.length ? h`<div class="card mb-3 border-amber-300"><h2 class="card-h">Needs your action</h2><ul class="space-y-1 text-sm">${todo.map(([a, msg]) => h`<li><a class="text-brand underline font-medium" href="#/apps/${a.id}">${a.app_no || 'Draft #' + a.id} - ${a.project_name}</a>: ${msg}</li>`)}</ul></div>` : ''}
<div class="grid lg:grid-cols-3 gap-3">
 <div class="lg:col-span-2 space-y-3">
 ${rows.length ? rows.map(r => { const a = r.a; return h`
  <a href="#/apps/${a.id}" class="card block hover:shadow-md transition">
   <div class="flex flex-wrap justify-between gap-2"><div><div class="font-semibold">${a.project_name}</div><div class="text-xs text-slate-500">${a.app_no || 'Draft - not yet submitted'}${a.seq ? ' - FCFS #' + a.seq : ''} - ${num(a.estimated_load_kva)} kVA - ${a.district}</div></div><div class="text-right">${status(a)}<div class="mt-1">${flagB(r.flag)}</div></div></div>
   ${['SUBMITTED', 'RETURNED', 'FORWARDED', 'CONDITIONAL_NOC'].indexOf(a.status) >= 0 ? h`<div class="grid sm:grid-cols-3 gap-2 mt-3">${clockB(r.cs.c10, '10-day: Conditional NOC')}${clockB(r.cs.win, '3-month technical window')}${clockB(r.cs.overall, '45-day target')}</div>` : ''}
  </a>`; }) : h`<div class="card text-center text-slate-500">No applications yet. <a class="text-brand underline" href="#/apps/new">Create your first application</a>.</div>`}
 </div>
 <div class="space-y-3">
  <div class="card"><h2 class="card-h">Recent notifications</h2>${notifs.length ? notifs.map(n => h`<div class="border-b border-slate-100 py-1.5 text-sm ${n.read_at ? '' : 'font-semibold'}"><div>${n.title}</div><div class="text-xs text-slate-500 font-normal">${ist(n.created_at)}</div></div>`) : h`<p class="text-sm text-slate-500">Nothing yet.</p>`}<a class="text-sm text-brand underline" href="#/notifications">All notifications</a></div>
  <div class="card text-sm"><h2 class="card-h">How it works</h2><ol class="list-decimal ml-4 space-y-1"><li>Submit application with documents and 35% BG - you get an FCFS number and time stamp.</li><li>Conditional NOC within ${rs.get('timeline.conditional_noc_days')} days.</li><li>${rs.get('timeline.technical_window_months')}-month technical window: DS proposal, load verification, clarifications, any additional BG.</li><li>Final NOC with QR verification.</li></ol><a class="text-brand underline" href="#/rules">Sources &amp; rules</a></div>
 </div>
</div>`;
    }
    const ACTIVE = N.CFG.ACTIVE_STATUSES, active = rows.filter(r => ACTIVE.indexOf(r.a.status) >= 0), stat = {};
    for (const r of rows) stat[r.a.status] = (stat[r.a.status] || 0) + 1;
    const buckets = { '0-15 d': 0, '16-30 d': 0, '31-45 d': 0, '> 45 d': 0 };
    for (const r of active) { const age = (r.cs.overall || {}).age || 0; buckets[age <= 15 ? '0-15 d' : age <= 30 ? '16-30 d' : age <= 45 ? '31-45 d' : '> 45 d']++; }
    const over = active.filter(r => r.flag === 'overdue'), appr = active.filter(r => r.flag === 'approaching');
    const pick = (k) => active.filter(r => r.cs[k] && ['ok', 'approaching', 'overdue'].indexOf(r.cs[k].state) >= 0).sort((a, b) => a.cs[k].remaining - b.cs[k].remaining).slice(0, 8);
    const c10 = pick('c10'), win = pick('win');
    const since = Date.now() - 30 * 86400000, issued30 = N.T('noc_certificates').filter(c => Date.parse(c.issued_at) >= since).length;
    const chart = { status: Object.entries(stat).map(([k, v]) => [N.CFG.STATUS_LABEL[k].split(' - ')[0], v]), buckets: Object.entries(buckets) };
    const dv = user.division_id ? N.byId('divisions', user.division_id) : null;
    const left = (c) => h`<span class="badge ${c.remaining < 0 ? 'f-overdue' : c.state === 'approaching' ? 'f-approaching' : 'f-ok'}">${c.remaining} d</span>`;
    return h`
<h1 class="text-xl font-bold text-brand-dark mb-3">${N.t('dash')} <span class="text-sm font-normal text-slate-500">- ${N.ROLE_LABEL[user.role]}${dv ? ' - ' + dv.name : ''}</span></h1>
<div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
 <a href="#/apps?flag=overdue" class="stat border-l-4 border-l-red-600"><div class="stat-n text-red-700">${over.length}</div><div class="stat-l">Overdue</div></a>
 <a href="#/apps?flag=approaching" class="stat border-l-4 border-l-amber-500"><div class="stat-n">${appr.length}</div><div class="stat-l">Due soon</div></a>
 <a href="#/apps?status=SUBMITTED" class="stat"><div class="stat-n">${(stat.SUBMITTED || 0) + (stat.RETURNED || 0)}</div><div class="stat-l">Under scrutiny</div></a>
 <a href="#/apps?status=FORWARDED" class="stat"><div class="stat-n">${stat.FORWARDED || 0}</div><div class="stat-l">With Commercial</div></a>
 <a href="#/apps?status=CONDITIONAL_NOC" class="stat"><div class="stat-n">${stat.CONDITIONAL_NOC || 0}</div><div class="stat-l">In technical window</div></a>
 <a href="#/apps?status=FINAL_NOC" class="stat"><div class="stat-n">${stat.FINAL_NOC || 0}</div><div class="stat-l">Final NOCs (${issued30} NOCs in 30 d)</div></a>
</div>
<div class="grid lg:grid-cols-3 gap-3 mb-3">
 <div class="card"><h2 class="card-h">Pipeline by status</h2><canvas id="chStatus" height="180" data-chart="${JSON.stringify(chart.status)}"></canvas></div>
 <div class="card"><h2 class="card-h">Ageing of active files (45-day target)</h2><canvas id="chAge" height="180" data-chart="${JSON.stringify(chart.buckets)}"></canvas></div>
 <div class="card"><h2 class="card-h">Attention list</h2>
  ${over.concat(appr).slice(0, 7).map(r => h`<a href="#/apps/${r.a.id}" class="flex justify-between gap-2 py-1.5 border-b border-slate-100 text-sm hover:bg-slate-50"><span><b>${r.a.app_no}</b> ${trunc(r.a.project_name, 28)}</span>${flagB(r.flag)}</a>`)}${over.length + appr.length ? '' : h`<p class="text-sm text-slate-500">Nothing overdue or due soon.</p>`}
 </div>
</div>
<div class="grid lg:grid-cols-2 gap-3">
 <div class="card overflow-x-auto"><h2 class="card-h">10-day countdown (Conditional NOC)</h2><table class="tbl"><thead><tr><th>FCFS</th><th>Project</th><th>kVA</th><th>Left</th></tr></thead><tbody>
  ${c10.length ? c10.map(r => h`<tr><td>#${r.a.seq}</td><td><a class="text-brand underline" href="#/apps/${r.a.id}">${trunc(r.a.project_name, 32)}</a></td><td>${num(r.a.estimated_load_kva, 0)}</td><td>${left(r.cs.c10)}${r.cs.c10.paused ? h` <span class="chip text-xs">paused</span>` : ''}</td></tr>`) : h`<tr><td colspan="4" class="text-slate-500">No file waiting for a Conditional NOC.</td></tr>`}</tbody></table></div>
 <div class="card overflow-x-auto"><h2 class="card-h">3-month technical windows closing</h2><table class="tbl"><thead><tr><th>FCFS</th><th>Project</th><th>kVA</th><th>Left</th></tr></thead><tbody>
  ${win.length ? win.map(r => h`<tr><td>#${r.a.seq}</td><td><a class="text-brand underline" href="#/apps/${r.a.id}">${trunc(r.a.project_name, 32)}</a></td><td>${num(r.a.estimated_load_kva, 0)}</td><td>${left(r.cs.win)}</td></tr>`) : h`<tr><td colspan="4" class="text-slate-500">No open technical windows.</td></tr>`}</tbody></table></div>
</div>`;
  });

  /* ---------- applications list ---------- */
  route('/apps', null, ({ user, query }) => {
    const rs = N.RS(), q = (query.q || '').trim().toLowerCase();
    let apps = N.visibleApps(user);
    if (query.status) apps = apps.filter(a => a.status === query.status);
    if (query.route) apps = apps.filter(a => a.route === query.route);
    if (q) apps = apps.filter(a => [a.project_name, a.app_no, a.district].some(x => String(x || '').toLowerCase().indexOf(q) >= 0));
    let rows = decorate(apps, rs); if (query.flag) rows = rows.filter(r => r.flag === query.flag);
    const isP = user.role === 'promoter';
    const cl = c => (c ? (['done', 'done_late'].indexOf(c.state) >= 0 ? 'done' : c.remaining + ' d') : '-');
    return h`
<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h1 class="text-xl font-bold text-brand-dark">${N.t('apps')}</h1>${isP ? h`<a class="btn" href="#/apps/new">+ ${N.t('new')}</a>` : ''}</div>
<form class="card mb-3 grid sm:grid-cols-5 gap-2 items-end" data-nav="/apps">
 <div class="sm:col-span-2"><label class="lbl">Search</label><input class="inp" name="q" value="${query.q || ''}" placeholder="Project, application no., district"></div>
 <div><label class="lbl">Status</label><select class="inp" name="status"><option value="">All</option>${Object.entries(N.CFG.STATUS_LABEL).map(([k, v]) => h`<option value="${k}" ${sel(query.status, k)}>${v}</option>`)}</select></div>
 <div><label class="lbl">Flag</label><select class="inp" name="flag"><option value="">All</option><option value="overdue" ${sel(query.flag, 'overdue')}>Overdue</option><option value="approaching" ${sel(query.flag, 'approaching')}>Due soon</option><option value="ok" ${sel(query.flag, 'ok')}>On track</option></select></div>
 <div class="flex gap-2"><button class="btn">Filter</button><a class="btn-outline" href="#/apps">Reset</a></div>
</form>
<div class="card overflow-x-auto !p-2"><table class="tbl"><thead><tr><th>FCFS</th><th>Application</th><th>Project</th>${isP ? '' : h`<th>Promoter</th>`}<th>kVA</th><th>Status</th><th>10-day</th><th>45-day</th><th>Flag</th></tr></thead><tbody>
${rows.length ? rows.map(r => { const a = r.a, pr = N.promoterOf(a), dv = N.divOf(a); return h`<tr>
 <td>${a.seq ? '#' + a.seq : '-'}</td><td><a class="text-brand underline font-medium" href="#/apps/${a.id}">${a.app_no || 'Draft #' + a.id}</a><div class="text-xs text-slate-500">${a.received_at ? ist(a.received_at) : ''}</div></td>
 <td>${a.project_name}<div class="text-xs text-slate-500">${a.district} - ${dv ? dv.name : ''}</div></td>${isP ? '' : h`<td class="text-xs">${pr.org_name || pr.name}</td>`}
 <td>${num(a.estimated_load_kva)}<div class="text-[11px] text-slate-500">${a.route}</div></td><td>${status(a)}</td>
 <td class="text-xs">${cl(r.cs.c10)}</td><td class="text-xs">${cl(r.cs.overall)}</td><td>${flagB(r.flag)}</td></tr>`; }) : h`<tr><td colspan="9" class="text-center text-slate-500 py-6">No applications match.</td></tr>`}</tbody></table></div>`;
  });

  /* ---------- queue ---------- */
  route('/queue', 'queue', ({ user, query }) => {
    const rs = N.RS(), hol = N.holidaySet(), ACTIVE = N.CFG.ACTIVE_STATUSES, stage = query.stage || '';
    const apps = N.visibleApps(user).filter(a => ACTIVE.indexOf(a.status) >= 0).sort((a, b) => (a.seq || 1e9) - (b.seq || 1e9));
    let rows = decorate(apps, rs); if (stage) rows = rows.filter(r => r.stage === stage);
    const today = N.todayIST();
    const readyC = apps.filter(a => a.status === 'FORWARDED');
    const readyF = apps.filter(a => a.status === 'CONDITIONAL_NOC' && !N.finalMissing(a).length);
    const planC = N.plan(readyC, 'CONDITIONAL', today, a => (N.clock10(a, rs, hol) || {}).due, rs);
    const planF = N.plan(readyF, 'FINAL', today, a => (N.clockWindow(a, rs) || {}).due, rs);
    const need = plan => {
      let best = 0; const s = plan.slice().sort((x, y) => (x.due || '9999-12-31') < (y.due || '9999-12-31') ? -1 : (x.due || '9999-12-31') > (y.due || '9999-12-31') ? 1 : 0);
      s.forEach((p, i) => { const days = Math.max(1, N.diffDays(today, p.due || N.addDaysD(today, 30)) + 1); best = Math.max(best, Math.ceil((i + 1) / days)); }); return best;
    };
    const sugg = [];
    for (const [name, plan, key] of [['Conditional NOC', planC, 'slots.conditional_per_day'], ['Final NOC', planF, 'slots.final_per_day']]) {
      const n = need(plan), cap = rs.get(key), risk = plan.filter(p => p.atRisk);
      if (risk.length) sugg.push(['warn', name + ': ' + risk.length + ' of ' + plan.length + ' ready file(s) would miss their deadline at ' + cap + ' per day. Raise daily capacity to about ' + Math.max(n, cap + 1) + ' (Admin > Rules: ' + key + ').']);
      else if (plan.length) sugg.push(['ok', name + ': ' + plan.length + ' ready file(s) fit within the daily capacity of ' + cap + '.']);
    }
    const daysC = N.daySummary('CONDITIONAL', today, 10, rs), daysF = N.daySummary('FINAL', today, 10, rs);
    const mon = d => N.fmtD(d).slice(0, 6);
    return h`
<h1 class="text-xl font-bold text-brand-dark mb-1">${N.t('queue')}</h1>
<p class="text-sm text-slate-600 mb-3">Applications in strict order of FCFS number. Suggested processing days are staggered by daily capacity (Admin &rarr; Rules / Data); they are suggestions and are not locked.</p>
${sugg.map(([k, m]) => h`<div class="alert ${k === 'warn' ? 'a-warn' : 'a-ok'} mb-2 text-sm">${m}</div>`)}
<div class="flex flex-wrap gap-1.5 mb-3">${['', 'Scrutiny', 'Commercial', 'Technical window'].map(s => h`<a class="tab ${stage === s ? 'tab-on' : ''}" href="#/queue${s ? '?stage=' + encodeURIComponent(s) : ''}">${s || 'All active'}</a>`)}</div>
<div class="card overflow-x-auto !p-2 mb-4"><table class="tbl"><thead><tr><th>FCFS</th><th>Received (IST)</th><th>Project</th><th>kVA</th><th>Authority</th><th>Stage</th><th>Next action / clocks</th><th>Flag</th></tr></thead><tbody>
${rows.length ? rows.map(r => { const a = r.a, cs = r.cs, live = c => c && ['ok', 'approaching', 'overdue'].indexOf(c.state) >= 0; return h`<tr><td class="font-bold">#${a.seq}</td><td class="text-xs">${ist(a.received_at)}</td><td><a class="text-brand underline" href="#/apps/${a.id}">${a.project_name}</a><div class="text-xs text-slate-500">${a.app_no} - ${N.divOf(a).name}</div></td><td>${num(a.estimated_load_kva, 0)}</td><td class="text-xs">${r.auth}</td><td>${status(a)}</td>
 <td class="text-xs">${live(cs.c10) ? 'Cond. NOC due ' + istd(cs.c10.due) + ' (' + cs.c10.remaining + ' d)' : ''}${live(cs.win) ? 'Window ends ' + istd(cs.win.due) + ' (' + cs.win.remaining + ' d)' : ''}<br>45-day target: ${cs.overall ? istd(cs.overall.due) : '-'}</td><td>${flagB(r.flag)}</td></tr>`; }) : h`<tr><td colspan="8" class="text-center py-6 text-slate-500">Queue is empty.</td></tr>`}</tbody></table></div>
<div class="grid lg:grid-cols-2 gap-3">
${[['Conditional NOC - suggested processing slots', planC, daysC], ['Final NOC - suggested processing slots', planF, daysF]].map(([title, plan, days]) => h`
 <div class="card"><h2 class="card-h">${title}</h2>
  <div class="overflow-x-auto"><table class="tbl mb-3"><thead><tr><th>FCFS</th><th>Project</th><th>Suggested day</th><th>Deadline</th></tr></thead><tbody>${plan.length ? plan.map(p => h`<tr><td>#${p.app.seq}</td><td>${trunc(p.app.project_name, 30)}</td><td>${istd(p.day)}</td><td>${istd(p.due)} ${p.atRisk ? h`<span class="badge f-overdue">after deadline</span>` : ''}</td></tr>`) : h`<tr><td colspan="4" class="text-slate-500">No file ready for this stage.</td></tr>`}</tbody></table></div>
  <div class="text-xs font-semibold text-slate-600 mb-1">Next 10 days - capacity</div>
  <div class="grid grid-cols-5 gap-1 text-center text-xs">${days.map(d => h`<div class="rounded border p-1 ${d.cap === 0 ? 'bg-slate-100 text-slate-400' : d.free === 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}"><div>${mon(d.day)}</div><div class="font-semibold">${d.used}/${d.cap}</div></div>`)}</div></div>`)}
</div>`;
  });

  /* ---------- notifications ---------- */
  route('/notifications', null, ({ user }) => {
    const ns = N.T('notifications').filter(n => n.user_id === user.id).sort((a, b) => b.id - a.id).slice(0, 100);
    return h`
<div class="flex justify-between items-center mb-3"><h1 class="text-xl font-bold text-brand-dark">${N.t('notif')}</h1><form data-act="notif-read"><button class="btn-outline btn-sm">Mark all read</button></form></div>
<div class="card !p-0 divide-y">${ns.length ? ns.map(n => h`<div class="p-3 ${n.read_at ? '' : 'bg-brand-light/50'}"><div class="flex justify-between gap-2"><div class="font-medium">${n.title}</div><div class="text-xs text-slate-500 whitespace-nowrap">${ist(n.created_at)}</div></div>${n.body ? h`<div class="text-sm text-slate-700">${n.body}</div>` : ''}${n.app_id ? h`<a class="text-xs text-brand underline" href="#/apps/${n.app_id}">Open application</a>` : ''}</div>`) : h`<p class="p-4 text-slate-500">No notifications.</p>`}</div>
<p class="hint mt-2">Email / SMS are not part of this demo: nothing is ever sent. In-app notifications are live (stored in this browser).</p>`;
  });
  action('notif-read', async ({ user }) => { const now = N.nowIso(); for (const n of N.T('notifications')) if (n.user_id === user.id && !n.read_at) n.read_at = now; N.flash('All notifications marked read.'); });
})(window);
