/* NOC SmartTrack static demo - SPA shell: hash router, layout, form/action delegation, charts. */
(function (G) {
  'use strict';
  const N = G.NOC, { h, raw, esc, fmtD, fmtDT } = N;
  const PERMS = { apply: ['promoter'], scrutiny: ['ds', 'commercial', 'admin'], technical: ['ds', 'admin'], commercial: ['commercial', 'admin'], queue: ['ds', 'commercial', 'admin'], reports: ['ds', 'commercial', 'admin'], audit: ['commercial', 'admin'], admin: ['admin'] };
  const ROLE_LABEL = { promoter: 'Promoter / Developer', ds: 'DS Division Officer', commercial: 'Commercial / Nodal Officer', admin: 'Admin / CE Commercial' };
  const can = (u, p) => !!u && (PERMS[p] || []).indexOf(u.role) >= 0;
  const I18N = {
    en: { app: 'NOC SmartTrack', tag: 'Colony / complex NOC tracking - PSPCL', dash: 'Dashboard', apps: 'Applications', queue: 'FCFS queue', new: 'New application', reports: 'Reports', rules: 'Rules', admin: 'Admin', audit: 'Audit trail', notif: 'Notifications', login: 'Sign in', logout: 'Sign out', verify: 'Verify NOC', load: 'Load sheet', mis: 'MIS import', slots: 'Slots' },
    pa: { app: 'ਐਨ.ਓ.ਸੀ ਸਮਾਰਟਟ੍ਰੈਕ', tag: 'ਕਲੋਨੀ / ਕੰਪਲੈਕਸ ਐਨ.ਓ.ਸੀ ਟਰੈਕਿੰਗ - ਪੀ.ਐਸ.ਪੀ.ਸੀ.ਐਲ', dash: 'ਡੈਸ਼ਬੋਰਡ', apps: 'ਅਰਜ਼ੀਆਂ', queue: 'ਪਹਿਲਾਂ ਆਓ ਪਹਿਲਾਂ ਪਾਓ ਕਤਾਰ', new: 'ਨਵੀਂ ਅਰਜ਼ੀ', reports: 'ਰਿਪੋਰਟਾਂ', rules: 'ਨਿਯਮ', admin: 'ਪ੍ਰਬੰਧਕ', audit: 'ਆਡਿਟ ਟ੍ਰੇਲ', notif: 'ਸੂਚਨਾਵਾਂ', login: 'ਸਾਈਨ ਇਨ', logout: 'ਸਾਈਨ ਆਊਟ', verify: 'ਐਨ.ਓ.ਸੀ ਦੀ ਪੁਸ਼ਟੀ', load: 'ਲੋਡ ਸ਼ੀਟ', mis: 'ਐਮ.ਆਈ.ਐਸ ਇੰਪੋਰਟ', slots: 'ਸਲਾਟ' },
    hi: { app: 'एनओसी स्मार्टट्रैक', tag: 'कॉलोनी / कॉम्प्लेक्स एनओसी ट्रैकिंग - पीएसपीसीएल', dash: 'डैशबोर्ड', apps: 'आवेदन', queue: 'पहले आओ पहले पाओ कतार', new: 'नया आवेदन', reports: 'रिपोर्ट', rules: 'नियम', admin: 'एडमिन', audit: 'ऑडिट ट्रेल', notif: 'सूचनाएँ', login: 'साइन इन', logout: 'साइन आउट', verify: 'एनओसी सत्यापन', load: 'लोड शीट', mis: 'एमआईएस आयात', slots: 'स्लॉट' },
  };
  let LANG = 'en';
  const t = k => (I18N[LANG] || I18N.en)[k] || I18N.en[k] || k;
  Object.assign(N, { PERMS, ROLE_LABEL, can, t });

  /* ---------- shared view helpers ---------- */
  const ist = d => (d ? fmtDT(d) + ' IST' : '-');
  const istd = d => (d ? fmtD(d) : '-');
  const status = a => h`<span class="badge b-${N.CFG.STATUS_TONE[a.status]}">${N.CFG.STATUS_LABEL[a.status]}</span>`;
  const flagB = f => f === 'overdue' ? h`<span class="badge f-overdue">Overdue</span>` : f === 'approaching' ? h`<span class="badge f-approaching">Due soon</span>` : f === 'ok' ? h`<span class="badge f-ok">On track</span>` : h`<span class="badge f-none">-</span>`;
  function clockB(c, label) {
    if (!c) return h`<div class="clock border-slate-200 bg-slate-50"><div class="text-xs text-slate-600">${label}</div><div class="text-slate-400">not started</div></div>`;
    const st = c.state, cls = ['overdue', 'expired'].indexOf(st) >= 0 ? 'border-red-300 bg-red-50' : st === 'approaching' ? 'border-amber-300 bg-amber-50' : ['ok', 'done'].indexOf(st) >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50';
    let main;
    if (st === 'done' || st === 'done_late') main = h`Done ${istd(c.done)} ${st === 'done_late' ? h`<span class="text-red-700">(late)</span>` : ''}`;
    else if (st === 'expired') main = h`Expired ${istd(c.due)}`;
    else if (st === 'closed') main = 'Closed';
    else if (c.remaining < 0) main = h`<span class="text-red-700">${-c.remaining} day(s) overdue</span>`;
    else main = h`${c.remaining} day(s) left`;
    return h`<div class="clock ${cls}"><div class="text-xs text-slate-600">${label}</div><div class="font-semibold">${main}</div><div class="text-xs text-slate-600">due ${istd(c.due)}${c.paused ? h` - <b>paused</b> (with promoter)` : ''}</div></div>`;
  }
  const rstatus = s => h`<span class="badge rs-${s}">${s === 'verified' ? 'Verified in source' : s === 'spec' ? 'Per requirement doc - unverified' : s === 'discrepancy' ? 'Proposed amendment' : 'Departmental practice'}</span>`;
  const sel = (a, b) => (a === b ? 'selected' : '');
  const trunc = (s, n) => String(s == null ? '' : s).slice(0, n);
  function decorate(apps, rs) {
    const hol = N.holidaySet();
    return apps.map(a => { const cs = N.allClocks(a, rs, hol); return { a, cs, flag: N.flagOf(a, rs, hol), stage: N.STAGE_OF(a), auth: N.approvingAuthority(a.estimated_load_kva || 0, rs)[1] }; });
  }
  Object.assign(N, { V: { ist, istd, status, flagB, clockB, rstatus, sel, trunc, decorate } });

  /* ---------- flash / toast ---------- */
  const flashes = [];
  N.flash = (msg, kind) => flashes.push([kind || 'ok', msg]);

  /* ---------- router ---------- */
  const routes = []; N.routes = routes; N.onRender = [];
  N.route = (pattern, perm, fn) => routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), perm, fn });
  const parseHash = () => {
    let s = location.hash.replace(/^#/, ''); if (!s.startsWith('/')) s = '/' + s;
    const i = s.indexOf('?'); const path = i < 0 ? s : s.slice(0, i), query = Object.fromEntries(new URLSearchParams(i < 0 ? '' : s.slice(i + 1)));
    return { path, query };
  };
  N.go = p => { location.hash = '#' + p; };
  N.anchor = null;

  function navLink(href, label, cur) {
    const on = cur === href || (href !== '/' && cur.startsWith(href + '/'));
    return h`<a href="#${href}" class="nav-a ${on ? 'nav-on' : ''}">${label}</a>`;
  }
  function layout(user, cur, body) {
    const unread = user ? N.T('notifications').filter(n => n.user_id === user.id && !n.read_at).length : 0;
    const nav = user ? h`
      <nav class="flex gap-1 overflow-x-auto flex-1 min-w-0" aria-label="Main">
        ${navLink('/', t('dash'), cur)}${navLink('/apps', t('apps'), cur)}${user.role === 'promoter' ? navLink('/apps/new', t('new'), cur) : ''}
        ${can(user, 'queue') ? navLink('/queue', t('queue'), cur) : ''}${can(user, 'reports') ? h`${navLink('/reports', t('reports'), cur)}${navLink('/mis', t('mis'), cur)}` : ''}
        ${navLink('/rules', t('rules'), cur)}${can(user, 'audit') ? navLink('/admin/audit', t('audit'), cur) : ''}${user.role === 'admin' ? navLink('/admin', t('admin'), cur) : ''}
      </nav>
      <div class="flex items-center gap-2 text-sm">
        <a href="#/notifications" class="relative nav-a" aria-label="${t('notif')}">&#128276;${unread ? h`<span class="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] rounded-full px-1.5">${unread}</span>` : ''}</a>
        <span class="hidden md:block text-right leading-tight"><span class="block font-medium">${user.name}</span><span class="block text-[11px] text-white/80">${ROLE_LABEL[user.role]}</span></span>
        <button type="button" data-logout class="nav-a border border-white/30">${t('logout')}</button>
      </div>` : h`
      <nav class="flex gap-1 flex-1">${navLink('/verify', t('verify'), cur)}${navLink('/rules', t('rules'), cur)}</nav>
      <a href="#/login" class="nav-a border border-white/30">${t('login')}</a>`;
    return h`
<header class="bg-brand text-white shadow">
  <div class="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3 flex-wrap">
    <a href="#/" class="flex items-center gap-2 mr-2"><span class="rounded bg-white text-brand font-black text-xs px-1.5 py-1 border-2 border-yellow-400">DEMO</span>
      <span><span class="block font-bold leading-tight">${t('app')}</span><span class="block text-[11px] text-white/80 leading-tight hidden sm:block">${t('tag')}</span></span></a>
    ${nav}
    <span class="text-xs flex gap-1 ml-auto sm:ml-0"><button type="button" data-lang="en" class="${LANG === 'en' ? 'font-bold underline' : ''}">EN</button>|<button type="button" data-lang="pa" class="${LANG === 'pa' ? 'font-bold underline' : ''}">ਪੰ</button>|<button type="button" data-lang="hi" class="${LANG === 'hi' ? 'font-bold underline' : ''}">हि</button></span>
  </div>
</header>
<main id="main" class="max-w-7xl w-full mx-auto px-3 py-4 flex-1">
  ${N.storageError ? h`<div class="alert a-err mb-3">${N.storageError}</div>` : ''}
  ${flashes.splice(0).map(([k, m]) => h`<div class="alert a-${['ok', 'err', 'warn', 'info'].indexOf(k) >= 0 ? k : 'info'} mb-3" role="status">${m}</div>`)}
  ${body}
</main>
<footer class="text-center text-xs text-slate-500 py-4 border-t bg-white">
  <p>NOC SmartTrack <b>demo</b> - rules sourced from Supply Code 2024 (as amended), PSPCL Commercial Circulars and the Model Agreement; see <a class="underline text-brand" href="#/rules">Rules &amp; references</a> for each rule's source and verification status.</p>
  <p class="mt-1">Static GitHub Pages build: no server, no accounts. <button type="button" data-reset class="underline text-brand">Reset demo data</button> &middot; <a class="underline text-brand" href="verify.html">Verify a NOC</a></p>
</footer>`;
  }
  const BANNER = h`<div id="demo-banner" class="bg-amber-300 text-amber-950 text-xs sm:text-sm text-center py-1.5 px-2 font-medium flex flex-wrap items-center justify-center gap-x-3 gap-y-1"><span>Demo &ndash; fictional data, stored only in this browser. Not an official PSPCL system.</span><button type="button" data-reset class="underline font-semibold">Reset demo data</button></div>`;

  let rendering = null;
  async function render(keepScroll) {
    const { path, query } = parseHash(), user = N.currentUser(), root = document.getElementById('root');
    const y = G.scrollY; let body = null, cur = path;
    const publicPaths = ['/login', '/register', '/verify', '/rules'];
    for (const r of routes) {
      const m = r.re.exec(path); if (!m) continue;
      if (!user && publicPaths.indexOf(path) < 0 && !path.startsWith('/rules')) { N.go('/login?next=' + encodeURIComponent(path)); return; }
      if (r.perm && !can(user, r.perm)) { body = h`<div class="card max-w-xl mx-auto text-center"><h1 class="text-xl font-bold text-red-800">Not allowed</h1><p class="text-sm mt-1">Your role (${user ? ROLE_LABEL[user.role] : '-'}) cannot open this page.</p><a class="btn mt-3" href="#/">Home</a></div>`; break; }
      try { body = await r.fn({ user, params: m.groups || {}, query, path }); }
      catch (e) { if (e && e.notFound) body = notFound(); else if (e instanceof N.WorkflowError) body = h`<div class="alert a-err">${e.message}</div>`; else { console.error(e); body = h`<div class="alert a-err">Something went wrong: ${e.message}</div>`; } }
      break;
    }
    if (!body) body = notFound();
    root.innerHTML = '';
    root.insertAdjacentHTML('beforeend', BANNER.s + layout(user, cur, body).s);
    document.title = (t('app')) + ' - demo';
    drawCharts(); (N.onRender || []).forEach(f => { try { f(); } catch (e) { console.error(e); } });
    const after = () => { if (N.anchor) { const el = document.getElementById(N.anchor); N.anchor = null; if (el) { el.scrollIntoView(); return; } } G.scrollTo(0, keepScroll ? y : 0); };
    after();
  }
  const notFound = () => h`<div class="card max-w-xl mx-auto text-center"><h1 class="text-xl font-bold text-brand-dark">Not found</h1><p class="text-sm mt-1">This page or application does not exist (or you cannot access it).</p><a class="btn mt-3" href="#/">Home</a></div>`;
  N.notFound = () => { const e = new Error('nf'); e.notFound = true; return e; };
  N.render = keepScroll => { rendering = (rendering || Promise.resolve()).then(() => render(keepScroll)).catch(console.error); return rendering; };

  /* ---------- charts ---------- */
  function drawCharts() {
    if (!G.Chart) return;
    const pal = ['#0b3d91', '#2563eb', '#0d9488', '#16a34a', '#d97706', '#dc2626', '#64748b', '#7c3aed'];
    const s = document.getElementById('chStatus');
    if (s) { const d = JSON.parse(s.dataset.chart); new G.Chart(s, { type: 'doughnut', data: { labels: d.map(x => x[0]), datasets: [{ data: d.map(x => x[1]), backgroundColor: pal }] }, options: { plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } } }); }
    const a = document.getElementById('chAge');
    if (a) { const b = JSON.parse(a.dataset.chart); new G.Chart(a, { type: 'bar', data: { labels: b.map(x => x[0]), datasets: [{ data: b.map(x => x[1]), backgroundColor: ['#16a34a', '#d97706', '#ea580c', '#dc2626'] }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }); }
  }

  /* ---------- actions (form submit delegation) ---------- */
  const actions = N.actions = {};
  N.action = (name, fn) => { actions[name] = fn; };
  async function runAction(name, form, fd, ev) {
    const fn = actions[name]; if (!fn) return;
    const user = N.currentUser();
    try {
      const res = await fn({ form, fd, user, ev, get: k => String(fd.get(k) == null ? '' : fd.get(k)) });
      if (res !== false) N.save();
      else N.rollback();
    } catch (e) {
      N.rollback();
      if (e instanceof N.WorkflowError) N.flash(e.message, 'err'); else { console.error(e); N.flash('Error: ' + e.message, 'err'); }
    }
    await N.render(true);
  }
  document.addEventListener('submit', ev => {
    const f = ev.target; if (!(f instanceof HTMLFormElement)) return;
    const nav = f.getAttribute('data-nav');
    if (nav) { ev.preventDefault(); const p = new URLSearchParams(); new FormData(f).forEach((v, k) => { if (v !== '' && typeof v === 'string') p.set(k, v); }); N.go(nav + (p.toString() ? '?' + p : '')); return; }
    const act = f.getAttribute('data-act'); if (!act) return;
    ev.preventDefault();
    const msg = f.getAttribute('data-confirm'); if (msg && !G.confirm(msg)) return;
    const fd = new FormData(f); if (ev.submitter && ev.submitter.name) fd.set(ev.submitter.name, ev.submitter.value);
    runAction(act, f, fd, ev);
  });
  document.addEventListener('click', async ev => {
    const el = ev.target.closest && ev.target.closest('[data-logout],[data-reset],[data-lang],[data-doc]:not(form),[data-pdf],[data-addrow],[data-export],[data-readall]'); if (!el) return;
    if (el.hasAttribute('data-logout')) { N.logout(); N.go('/login'); N.render(); }
    else if (el.hasAttribute('data-lang')) { LANG = el.getAttribute('data-lang'); N.setLang(LANG); G.document.documentElement.lang = LANG; N.render(true); }
    else if (el.hasAttribute('data-reset')) {
      if (!G.confirm('Reset demo data? All changes made in this browser (applications, uploads, rules) are discarded and the original fictional demo data is restored.')) return;
      await N.resetDemo(); N.flash('Demo data has been reset to the original fictional data.'); if (location.hash && location.hash !== '#/' && location.hash !== '#/login') N.go('/'); await N.render();
    } else if (el.hasAttribute('data-doc')) {
      ev.preventDefault(); const d = N.byId('documents', +el.getAttribute('data-doc')); if (!d) return;
      const blob = await N.docBlob(d); N.auditLog(N.currentUser(), 'DOC_DOWNLOAD', N.APP(d.app_id), '', '', d.filename); N.save();
      N.downloadBlob(new Blob([blob], { type: d.mime || 'application/pdf' }), d.filename);
    } else if (el.hasAttribute('data-pdf')) {
      ev.preventDefault(); const c = N.byId('noc_certificates', +el.getAttribute('data-pdf')); if (!c) return;
      const open = el.getAttribute('data-mode') === 'open'; const w = open ? G.open('', '_blank') : null;
      const blob = N.nocPdfBlob(c), name = c.noc_no.replace(/\//g, '-') + '.pdf';
      if (open) { const u = URL.createObjectURL(blob); if (w) w.location = u; else G.location.href = u; } else N.downloadBlob(blob, name);
      const holder = document.getElementById('pdf-links-' + c.id);
      if (holder) { const u2 = URL.createObjectURL(blob); holder.innerHTML = '<a class="text-brand underline text-xs" target="_blank" rel="noopener" href="' + u2 + '">Open ' + esc(name) + ' in a new tab</a>'; }
    } else if (el.hasAttribute('data-addrow')) {
      const tb = document.getElementById('rows'), last = tb.lastElementChild, n = last.cloneNode(true);
      n.querySelectorAll('input').forEach(i => { i.value = ['qty', 'floors'].indexOf(i.name) >= 0 ? '1' : ''; }); n.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; }); tb.appendChild(n);
    }
  });
  G.addEventListener('hashchange', () => { N.render(); });

  /* ---------- boot ---------- */
  N.boot = async function () {
    LANG = N.getLang(); G.document.documentElement.lang = LANG;
    try { await N.init(); } catch (e) { document.getElementById('root').innerHTML = '<div class="alert a-err m-4">Could not start the demo: ' + esc(e.message) + '</div>'; return; }
    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + (N.currentUser() ? '#/' : '#/login'));
    await N.render();
    G.__nocReady = true;
  };
})(window);
