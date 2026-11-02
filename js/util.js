/* NOC SmartTrack - static demo. Utilities (no dependencies). */
(function (G) {
  'use strict';
  const NOC = G.NOC = G.NOC || {};

  /* ---------- HTML templating (auto-escape, SafeString) ---------- */
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = s => new Safe(String(s == null ? '' : s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  function toHtml(v) {
    if (v == null || v === false || v === true) return '';
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(toHtml).join('');
    return esc(v);
  }
  function h(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += toHtml(vals[i]) + strings[i + 1];
    return new Safe(out);
  }

  /* ---------- Python-compatible number formatting ---------- */
  function pyRound(x, nd) {
    nd = nd || 0;
    if (x == null || !isFinite(x)) return x;
    if (nd === 0) {
      const fl = Math.floor(x), d = x - fl;
      if (d < 0.5) return fl;
      if (d > 0.5) return fl + 1;
      return fl % 2 === 0 ? fl : fl + 1;
    }
    const t = Math.abs(x).toFixed(Math.min(nd + 30, 100));
    const dot = t.indexOf('.');
    const keep = t.slice(0, dot + nd + 1), rest = t.slice(dot + nd + 1);
    let r;
    if (/^50*$/.test(rest)) { // exact tie -> half-even
      const last = +keep.slice(-1);
      r = last % 2 === 0 ? Number(keep) : Number((Number(keep) + Math.pow(10, -nd)).toFixed(nd));
    } else r = Number(Math.abs(x).toFixed(nd));
    return x < 0 ? -r : r;
  }
  const fmtF = (x, nd) => pyRound(x, nd).toFixed(nd);
  function fmtG(x, p) {
    p = p || 6; x = Number(x);
    if (x === 0) return '0';
    let s = x.toPrecision(p);
    if (s.indexOf('e') >= 0) {
      let [m, e] = s.split('e');
      if (m.indexOf('.') >= 0) m = m.replace(/\.?0+$/, '');
      const sign = e[0]; let n = e.slice(1); if (n.length < 2) n = '0' + n;
      return m + 'e' + sign + n;
    }
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    return s;
  }
  const groupW = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function num(x, n) {
    if (x == null || x === '' || isNaN(x)) return '-';
    n = n == null ? 2 : n;
    const s = fmtF(Math.abs(Number(x)), n);
    const [i, f] = s.split('.');
    let out = groupW(i) + (f ? '.' + f : '');
    if (n) out = out.replace(/0+$/, '').replace(/\.$/, '');
    return (Number(x) < 0 && Number(s) !== 0 ? '-' : '') + out;
  }
  function inr(x) {
    if (x == null || x === '' || isNaN(x)) return '-';
    x = pyRound(Number(x));
    const neg = x < 0; let s = String(Math.abs(x));
    if (s.length > 3) { const tail = s.slice(-3); let head = s.slice(0, -3); head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ','); s = head + ',' + tail; }
    return (neg ? '-' : '') + 'Rs ' + s;
  }
  const roundUp = (x, step) => { step = Math.max(parseInt(step, 10) || 1, 1); return Math.ceil(pyRound(x, 6) / step) * step; };

  /* ---------- Dates (IST = fixed +05:30, independent of browser zone) ---------- */
  const IST_MS = 19800000, DAY = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = n => String(n).padStart(2, '0');
  const isoDate = d => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); };
  const addDaysD = (s, n) => isoDate(new Date(parseDate(s).getTime() + n * DAY));
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY); // b - a
  const wdayPy = s => (parseDate(s).getUTCDay() + 6) % 7; // Monday=0
  function addMonths(s, n) {
    const d = parseDate(s); let y = d.getUTCFullYear(), mo = d.getUTCMonth() + n;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return isoDate(new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), dim))));
  }
  const nowMs = () => G.__NOC_NOW__ ? G.__NOC_NOW__() : Date.now();
  const nowIso = () => new Date(Math.floor(nowMs() / 1000) * 1000).toISOString().slice(0, 19) + 'Z';
  const istParts = iso => new Date(Date.parse(iso) + IST_MS);
  const istDate = iso => isoDate(istParts(iso));
  const todayIST = () => istDate(nowIso());
  const isDt = s => typeof s === 'string' && s.length > 10 && s.indexOf('T') === 10;
  function fmtD(s) { // '12 Sep 2026'
    if (!s) return '-';
    const ds = isDt(s) ? istDate(s) : s.slice(0, 10), d = parseDate(ds);
    return p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function fmtDT(iso) { // '12 Sep 2026, 03:04 PM'
    if (!iso) return '-';
    const d = istParts(iso); let hh = d.getUTCHours(); const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
    return p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + p2(hh) + ':' + p2(d.getUTCMinutes()) + ' ' + ap;
  }
  const fmtDMY = s => { if (!s) return ''; const d = isDt(s) ? istDate(s) : s.slice(0, 10); return d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4); };

  /* ---------- SHA-256 (sync, for strings and Uint8Array) ---------- */
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(data) {
    const msg = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const l = msg.length, nb = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(nb);
    buf.set(msg); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(nb - 8, Math.floor(l / 0x20000000)); dv.setUint32(nb - 4, (l << 3) >>> 0);
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H = [(H[0] + a) >>> 0, (H[1] + b) >>> 0, (H[2] + c) >>> 0, (H[3] + d) >>> 0, (H[4] + e) >>> 0, (H[5] + f) >>> 0, (H[6] + g) >>> 0, (H[7] + hh) >>> 0];
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
  }
  function sortedJson(v) { // JSON with sorted keys (deterministic)
    if (Array.isArray(v)) return '[' + v.map(sortedJson).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + sortedJson(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const randHex = n => { const a = new Uint8Array(Math.ceil(n / 2)); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('').slice(0, n); };

  Object.assign(NOC, { Safe, raw, esc, h, toHtml, pyRound, fmtF, fmtG, num, inr, roundUp, MON, p2, isoDate, parseDate, addDaysD, diffDays, wdayPy, addMonths, nowIso, istDate, todayIST, isDt, fmtD, fmtDT, fmtDMY, istParts, sha256, sortedJson, randHex, IST_MS, DAY });
})(window);
