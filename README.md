# NOC SmartTrack - public demo

Static, client-side demo of **NOC SmartTrack**, a tracker for colony / complex NOC applications (First-Come-First-Served queue, 35% bank-guarantee calculation, load verification, Conditional and Final NOC, SLA ageing, reports, MIS import, audit trail).

**Live demo:** https://harijim.github.io/noc-smarttrack-demo/

> Demo - fictional data, stored only in this browser. Not an official PSPCL system.

- Plain HTML/CSS/JS, no backend and no build step at runtime. Everything is stored in your browser (localStorage + IndexedDB). *Reset demo data* in the footer restores the original data.
- Demo logins (password `demo123`): `promoter`, `promoter2`, `promoter3`, `ds` (Mohali), `ds2` (Patiala), `ds3` (Ludhiana), `ds4` (Amritsar), `nodal`, `admin`. They exist only in this static page; nothing is sent anywhere.
- NOC PDFs are generated in the browser (jsPDF + qrcode-generator, bundled in `js/vendor/`) and carry the watermark "DEMO - not a valid NOC". The QR opens `verify.html`, which checks the record in *this browser's* local data.
- Excel/CSV: SheetJS (`xlsx.full.min.js`, bundled). Charts: Chart.js (bundled). No CDN is used.
- Seed data mirrors the demo data of the private application; dates are shifted so the ageing/SLA story stays current.

## Layout
`index.html` (single-page app, hash routes) - `verify.html` - `js/` (`util`, `logic`, `store`, `pdf`, `app`, `views1-3`, `vendor/`) - `data/seed.json` - `docs/` - `samples/` - `assets/app.css` (Tailwind build).

Not an official PSPCL system; all names, organisations, numbers and amounts are fictional.
