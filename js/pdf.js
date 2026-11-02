/* NOC SmartTrack demo - browser-side PDF generation (jsPDF + qrcode-generator, both bundled locally). */
(function (G) {
  'use strict';
  const N = G.NOC, { inr, fmtDMY, istDate, num } = N;
  const BLUE = [11, 61, 145], DARK = [8, 44, 108], GREY = [100, 116, 139], LINE = [203, 213, 225], LIGHT = [232, 239, 251], SOFT = [241, 245, 249];
  const WATERMARK = 'DEMO \u2013 not a valid NOC';
  N.WATERMARK = WATERMARK;
  N.verifyUrl = code => new URL('verify.html?code=' + encodeURIComponent(code), N.ROOT).href;

  function newDoc(title) {
    const doc = new G.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title, author: 'NOC SmartTrack - DEMO (not an official PSPCL system)', subject: 'Demonstration document with fictional data' });
    return doc;
  }
  function drawQr(doc, url, x, y, size) {
    const qr = G.qrcode(0, 'M'); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), border = 2, m = size / (n + border * 2);
    doc.setFillColor(255, 255, 255); doc.rect(x, y, size, size, 'F');
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x + (c + border) * m, y + (r + border) * m, m + 0.03, m + 0.03, 'F');
  }
  function watermark(doc) {
    const pages = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.11 })); doc.setFont('helvetica', 'bold'); doc.setFontSize(46); doc.setTextColor(200, 25, 25);
      const w = doc.getTextWidth(WATERMARK), th = 40 * Math.PI / 180;
      doc.text(WATERMARK, W / 2 - (w / 2) * Math.cos(th), H / 2 + (w / 2) * Math.sin(th), { angle: 40 });
      doc.restoreGraphicsState();
    }
  }

  N.buildNocPdf = function (cert) {
    const app = N.APP(cert.app_id), prom = N.promoterOf(app), rs = N.RS(), snap = cert.snapshot;
    const doc = newDoc((cert.kind === 'CONDITIONAL' ? 'Conditional NOC ' : 'Final NOC ') + cert.noc_no + ' (DEMO)');
    const W = 210, H = 297, L = 18, R = W - 18, CW = R - L; let y = 16;
    const url = N.verifyUrl(cert.code);
    const font = (st, sz, col) => { doc.setFont('helvetica', st); doc.setFontSize(sz); doc.setTextColor.apply(doc, col || [0, 0, 0]); };
    const ensure = h => { if (y + h > H - 18) { doc.addPage(); y = 16; } };
    const para = (txt, st, sz, col, lh, x, w, gap) => { font(st, sz, col); const lines = doc.splitTextToSize(txt, w || CW); ensure(lines.length * lh + (gap || 0)); doc.text(lines, x || L, y + lh * 0.8); y += lines.length * lh + (gap || 0); };
    const h2 = t => { ensure(12); y += 3; font('bold', 10.5, DARK); doc.text(t, L, y + 3); y += 6; };
    function table(rows, widths, o) {
      o = o || {}; const fs = o.fs || 9, lh = fs * 0.43 + 0.9;
      rows.forEach((row, ri) => {
        const cells = row.map((c, i) => doc.splitTextToSize(String(c), widths[i] - 3.4));
        const hgt = Math.max(...cells.map(c => c.length)) * lh + 2.6; ensure(hgt);
        let x = L;
        cells.forEach((c, i) => {
          const hdr = o.header && ri === 0;
          if (hdr || (o.keycol && i === 0)) { doc.setFillColor.apply(doc, hdr ? LIGHT : SOFT); doc.rect(x, y, widths[i], hgt, 'F'); }
          doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.rect(x, y, widths[i], hgt, 'S');
          font(hdr || (o.keycol && i === 0) ? 'bold' : 'normal', fs, o.keycol && i === 0 ? [51, 65, 85] : [0, 0, 0]);
          doc.text(c, x + 1.7, y + 0.8 + lh * 0.85); x += widths[i];
        });
        y += hgt;
      });
    }

    font('bold', 15, BLUE); doc.text('PUNJAB STATE POWER CORPORATION LIMITED', W / 2, y + 5, { align: 'center' }); y += 8;
    font('normal', 8.5, [30, 30, 30]); doc.text('Commercial Organisation - Electrical connectivity to colonies / complexes (Supply Code 2024, Reg. 12)', W / 2, y + 3, { align: 'center' }); y += 9;
    font('bold', 12); doc.text(cert.kind === 'CONDITIONAL' ? 'CONDITIONAL NO OBJECTION CERTIFICATE' : 'NO OBJECTION CERTIFICATE (FINAL)', W / 2, y + 3, { align: 'center' }); y += 8;
    doc.setFillColor(254, 242, 242); doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.3); doc.roundedRect(L, y, CW, 8, 1, 1, 'FD');
    font('bold', 9, [185, 28, 28]); doc.text('DEMONSTRATION DOCUMENT - FICTIONAL DATA - ' + WATERMARK.toUpperCase(), W / 2, y + 3.4, { align: 'center' });
    font('normal', 7.5, [185, 28, 28]); doc.text('Generated in the browser by a static demo. Not an official PSPCL system or NOC.', W / 2, y + 6.6, { align: 'center' }); y += 12;

    const meta = [['NOC No.', cert.noc_no], ['Application No.', app.app_no], ['FCFS Seq.', String(app.seq)], ['Date of issue', fmtDMY(cert.issued_at)], ['Valid up to', fmtDMY(cert.valid_upto)], ['Approving authority', cert.authority]];
    const y0 = y; table(meta, [34, 80], { keycol: true }); const yEnd = y;
    drawQr(doc, url, R - 32, y0, 32);
    y = Math.max(yEnd, y0 + 33); para('Scan the QR code or visit ' + url + ' to verify this certificate (demo: checks the record stored in this browser only).', 'normal', 7.5, [68, 68, 68], 3.4);

    h2('Project details');
    table([['Promoter', (prom.org_name || prom.name) + ' (' + titleCase(app.constitution) + ')'], ['Project', app.project_name], ['Location', app.location + ', ' + app.district],
      ['Colony type / scheme', titleCase(app.colony_type) + ' / ' + titleCase(app.scheme.replace(/_/g, ' '))],
      ['Licence / approval', app.licence_no + ' (' + app.licence_authority + '), valid up to ' + (app.licence_valid_upto ? fmtDMY(app.licence_valid_upto) : 'n/a')],
      ['Estimated load', N.cf(snap.load_kva, 2) + ' kVA']], [38, CW - 38], { keycol: true });
    h2('Bank guarantee(s) furnished and verified');
    table([['BG No.', 'Bank', 'Amount', 'Valid up to', 'Type']].concat(snap.bgs.map(b => [b.bg_no, b.bank, inr(b.amount), b.valid_upto, b.kind])), [34, 55, 33, 24, 20], { header: true, fs: 8.5 });
    h2('Terms and conditions');
    cert.conditions.forEach((c, i) => para((i + 1) + '. ' + c, 'normal', 9.5, null, 4.4, L, CW, 1.6));
    h2('Events of default (may result in encashment of the bank guarantee)');
    N.CFG.EVENTS_OF_DEFAULT.forEach((c, i) => para('(' + String.fromCharCode(97 + i) + ') ' + c, 'normal', 8.5, null, 3.7, L, CW, 1));
    para('Source: ' + N.CFG.EVENTS_SRC, 'normal', 7.5, [68, 68, 68], 3.3, L, CW, 4);
    ensure(24);
    para('Digitally generated by the NOC SmartTrack DEMO. Issued by: ' + cert.issuer + ', ' + cert.issuer_desig, 'bold', 9.5, null, 4.4);
    para('Record fingerprint (SHA-256 of record): ' + cert.fingerprint, 'normal', 7.5, [68, 68, 68], 3.3);
    para('This certificate is valid only while its status on the verification page is VALID. DEMO - fictional data; not a valid NOC.', 'normal', 7.5, [68, 68, 68], 3.3);
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) { doc.setPage(p); font('normal', 7, GREY); doc.text(cert.noc_no + '  |  ' + url, L, H - 9); doc.text('Page ' + p + ' of ' + pages, R, H - 9, { align: 'right' }); }
    watermark(doc);
    return doc;
  };
  const titleCase = s => String(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  N.nocPdfBlob = cert => N.buildNocPdf(cert).output('blob');

  /* placeholder PDF for seeded (fictional) documents that have no stored file */
  N.stubDocBlob = function (d, app) {
    const doc = newDoc('Demo document - ' + (d.label || d.code)); const W = 210;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor.apply(doc, BLUE); doc.text('DEMO DOCUMENT (placeholder)', W / 2, 40, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize((d.label || d.code) + '\n\nApplication: ' + (app ? (app.app_no || 'draft') + ' - ' + app.project_name : '-') + '\nFile name on record: ' + d.filename + '\n\nThis is a fictional seed document generated in your browser. It contains no real data.', 160);
    doc.text(lines, 25, 60); watermark(doc); return doc.output('blob');
  };

  N.downloadBlob = function (blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 120000); return u;
  };
  N.docBlob = async function (d) {
    const b = await N.files.get(d.id); if (b) return b;
    return N.stubDocBlob(d, N.APP(d.app_id));
  };
})(window);
