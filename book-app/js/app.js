import { books } from '../books/index.js';

/* ───────────────────────── Storage ───────────────────────── */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('spread:' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('spread:' + key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const DEFAULTS = { fontScale: 1, face: 'serif', leading: 'normal', layout: 'auto', theme: 'paper', turn: 'slide', wake: false };
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
const LEADING = { tight: 1.45, normal: 1.6, loose: 1.8 };
const THEME_BAR = { paper: '#f7f2e7', sepia: '#f1e3c6', night: '#14161c', heart: '#0d1638' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ORNAMENT = `<svg class="ornament" viewBox="0 0 120 20" aria-hidden="true"><path d="M4 10h40M76 10h40" stroke="currentColor" stroke-width="1"/><path d="M47 10l3-3 3 3-3 3zM67 10l3-3 3 3-3 3z" fill="currentColor"/><path d="M60 17C53 12 51 7 54.5 5.2 57 4 59.3 5.4 60 7c.7-1.6 3-3 5.5-1.8C69 7 67 12 60 17z" fill="currentColor"/></svg>`;

/* ───────────────────────── Library ───────────────────────── */
function coverArt() {
  return `<svg class="art" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset=".4" stop-color="#f2c14e" stop-opacity=".35"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></radialGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3f8f"/><stop offset="1" stop-color="#070b20"/></linearGradient>
    <linearGradient id="moon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset="1" stop-color="#f2c14e"/></linearGradient>
  </defs>
  <g fill="#fff">${[[20,40,.9],[45,95,.6],[170,60,1],[150,110,.7],[30,150,.5],[180,165,.8],[95,30,.6],[130,25,.9],[60,190,.4],[175,205,.5],[12,215,.6],[110,85,.4]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${0.5 + r / 2}"/>`).join('')}</g>
  <circle cx="100" cy="150" r="70" fill="url(#glow)"/>
  <path d="M100 182C70 162 60 144 70 129c8-12 24-11 30 2 6-13 22-14 30-2 10 15 0 33-30 53z" fill="url(#moon)"/>
  <rect x="0" y="228" width="200" height="72" fill="url(#sea)"/>
  <g stroke="#f2c14e" stroke-linecap="round" opacity=".55"><path d="M86 238h28M80 248h40M90 258h20M84 268h32" stroke-width="1.2"/></g>
  <path d="M0 236c20-7 44-9 66-4l10 3H0z" fill="#050817"/>
  <path d="M30 233c2-18 8-30 20-38" stroke="#050817" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M50 195c-9-4-19-2-25 4 8-2 15-1 21 2M50 195c-3-9-11-14-20-14 6 3 11 8 14 14M50 195c6-8 16-10 24-7-8 0-14 3-18 8M50 195c9-2 18 3 22 10-7-5-14-7-20-6" stroke="#050817" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
}

function renderLibrary() {
  const shelf = $('#shelf');
  shelf.innerHTML = books.map((b) => {
    const prog = store.get(`progress:${b.id}`, null);
    const pct = prog ? Math.round(prog.pct * 100) : 0;
    const started = prog && prog.pct > 0;
    return `<article class="feature" style="--c-from:${b.theme.from};--c-via:${b.theme.via}">
      <button class="cover" data-open="${b.id}" aria-label="Open ${esc(b.title)}">
        ${coverArt()}
        <div class="c-title">${esc(b.title).replace(' ', '<br>')}</div>
        <div class="c-sub">${esc(b.subtitle)}</div>
        <div class="c-foot">${esc(b.author.toUpperCase())}</div>
      </button>
      <div class="feature-info">
        <h1>${esc(b.title)}</h1>
        <h2>${esc(b.subtitle)}</h2>
        <p>${esc(b.blurb)}</p>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="progress-label">${started ? `${pct}% read` : `${b.chapters.length} chapters · not started`}</div>
        <div class="cta">
          <button class="btn" data-open="${b.id}">${started ? 'Continue reading' : 'Start reading'}</button>
          <button class="btn ghost" data-open="${b.id}" data-toc>Contents</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

$('#shelf').addEventListener('click', (e) => {
  const t = e.target.closest('[data-open]');
  if (!t) return;
  nav(`#/read/${t.dataset.open}${t.hasAttribute('data-toc') ? '/toc' : ''}`);
});

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').hidden = true;
});

/* ───────────────────────── Reader ───────────────────────── */
const reader = $('#reader');
const stage = $('#stage');
const viewport = $('#viewport');
const flow = $('#flow');
const scrub = $('#scrub');

const R = {
  book: null,
  blocks: [],       // every top-level block in the flow, for saving positions
  blockCol: [],     // column (page) each block starts on
  chStart: [],      // first page of each chapter
  pages: 1,
  page: 0,
  spread: false,
  pitch: 1,         // px from one column to the next
  anchor: { b: 0, o: 0 },
  marks: [],
};

function openBook(id, showToc) {
  const book = books.find((b) => b.id === id);
  if (!book) { nav(''); return; }
  $('#library').hidden = true;
  reader.hidden = false;
  if (R.book !== book) {
    R.book = book;
    R.anchor = store.get(`progress:${id}`, null)?.anchor || { b: 0, o: 0 };
    R.marks = store.get(`marks:${id}`, []);
    $('#barTitle').textContent = book.title;
    renderFlow(book);
  }
  applySettings();
  document.fonts.ready.then(() => { relayout(); if (showToc) openSheet('toc'); });
  updateWakeLock();
}

function closeBook() {
  closeSheets();
  reader.hidden = true;
  $('#library').hidden = false;
  reader.classList.remove('chrome-on');
  renderLibrary();
  updateWakeLock();
  setThemeColor('#0b1230');
}

function renderFlow(book) {
  const front = `
    <div class="front front-title">
      <h1>${esc(book.title)}</h1><h2>${esc(book.subtitle)}</h2>${ORNAMENT}
      <div class="by">${esc(book.author)}</div>
    </div>
    <div class="front front-legal">
      <p><b>${esc(book.title)}: ${esc(book.subtitle)}</b></p>
      <p>${esc(book.edition)}</p>
      <p>This is an unofficial, fan-made companion written for fun. It is not affiliated with, endorsed by, or sponsored by Disney or Square Enix. Kingdom Hearts and all related characters, worlds and music are the property of their respective owners. Quotations are brief and used for commentary.</p>
    </div>`;
  const chapters = book.chapters.map((c, i) => `
    <section class="chapter" data-ch="${i}">
      <header class="ch-open">
        <div class="ch-kicker">${esc(c.kicker)}</div>
        <h2 class="ch-title">${esc(c.title)}</h2>
        ${c.sub ? `<div class="ch-sub">${esc(c.sub)}</div>` : ''}
        ${ORNAMENT}
      </header>
      ${c.html}
    </section>`).join('');
  flow.innerHTML = front + chapters;
  // Mark the very end so we can count pages.
  const last = flow.lastElementChild.lastElementChild;
  (last.lastElementChild && last.lastElementChild.tagName === 'P' ? last.lastElementChild : last)
    .insertAdjacentHTML('beforeend', '<span class="end-mark"></span>');
  R.blocks = $$('.flow > .front, .flow > .chapter > *');
}

/* Geometry ------------------------------------------------------------- */
function decideSpread(W, H) {
  if (settings.layout === 'single') return false;
  if (settings.layout === 'spread') return W >= 520;
  // Auto: the Fold 7's inner screen is close to square (~840×900 CSS px),
  // the cover screen is tall and narrow (~390×900).
  return W >= 680 && H >= 460 && W / H >= 0.7;
}

function hingeInfo(W) {
  // Viewport Segments API: if the device reports two side-by-side segments,
  // align the spine to the fold and keep text out of any physical gap.
  const segs = window.viewport?.segments;
  if (segs && segs.length === 2) {
    const [a, b] = segs;
    if (b.x >= a.x + a.width - 1) {
      const gap = Math.max(0, b.x - (a.x + a.width));
      return { spineX: a.x + a.width + gap / 2, gap };
    }
  }
  return { spineX: Math.round(W / 2), gap: 0 };
}

function relayout() {
  if (reader.hidden || !R.book) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const spread = decideSpread(W, H);
  const { spineX, gap: hinge } = hingeInfo(W);
  const padTop = Math.round(clamp(H * 0.07, 44, 72));
  const padBottom = Math.round(clamp(H * 0.065, 44, 68));
  let colw, gap, vx, vw;
  if (spread) {
    const padX = Math.round(clamp(spineX * 0.085, 22, 56));
    colw = Math.floor(spineX - hinge / 2 - padX * 2);
    gap = padX * 2 + hinge;
    vx = padX;
    vw = colw * 2 + gap;
  } else {
    const padX = Math.round(clamp(W * 0.065, 20, 48));
    colw = Math.min(W - padX * 2, 640);
    gap = padX * 2;
    vx = Math.round((W - colw) / 2);
    vw = colw;
  }
  const fs = 17 * settings.fontScale;
  const lh = LEADING[settings.leading];
  // Snap the text height to whole lines so the last line is never clipped.
  const vh = Math.floor((H - padTop - padBottom) / (fs * lh)) * fs * lh;

  R.spread = spread;
  R.pitch = colw + gap;
  reader.classList.toggle('is-spread', spread);
  const s = reader.style;
  s.setProperty('--vx', vx + 'px');
  s.setProperty('--vy', padTop + 'px');
  s.setProperty('--vw', vw + 'px');
  s.setProperty('--vh', vh + 'px');
  s.setProperty('--vbottom', (H - padTop - vh) + 'px');
  s.setProperty('--colw', colw + 'px');
  s.setProperty('--gap', gap + 'px');
  s.setProperty('--spine-x', spineX + 'px');
  s.setProperty('--fs', fs + 'px');
  s.setProperty('--lh', lh);

  const cL = $('#chromeL'), cR = $('#chromeR');
  if (spread) {
    Object.assign(cL.style, { left: '0px', width: spineX + 'px' });
    Object.assign(cR.style, { left: spineX + 'px', width: (W - spineX) + 'px', display: '' });
  } else {
    Object.assign(cL.style, { left: '0px', width: W + 'px' });
    cR.style.display = 'none';
  }

  measure();
  goTo(pageOfAnchor(R.anchor), { animate: false, keepAnchor: true });
}

function colOfX(x) {
  return Math.floor((x - flow.getBoundingClientRect().left + 2) / R.pitch);
}

function measure() {
  flow.classList.remove('anim-slide');
  const left = flow.getBoundingClientRect().left;
  const col = (el) => Math.floor((el.getBoundingClientRect().left - left + 2) / R.pitch);
  R.blockCol = R.blocks.map(col);
  R.chStart = $$('.chapter > .ch-open', flow).map(col);
  R.pages = col($('.end-mark', flow)) + 1;
  scrub.max = R.pages - 1;
}

/* Positions ------------------------------------------------------------- */
// An anchor is { b: block index, o: character offset inside that block } —
// it survives font changes and folding/unfolding, unlike a page number.
function anchorAt(page) {
  const cols = R.blockCol;
  let lo = 0, hi = cols.length - 1, b = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cols[m] <= page) { b = m; lo = m + 1; } else hi = m - 1; }
  if (cols[b] >= page) return { b, o: 0 };
  const el = R.blocks[b];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let off = 0, n;
  while ((n = walker.nextNode())) {
    range.selectNodeContents(n);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (lastRect && colOfX(lastRect.left) >= page) {
      let a = 0, z = n.length;
      while (a < z) {
        const m = (a + z) >> 1;
        range.setStart(n, m); range.setEnd(n, Math.min(m + 1, n.length));
        const rc = range.getClientRects()[0] || range.getBoundingClientRect();
        if (colOfX(rc.left) >= page) z = m; else a = m + 1;
      }
      return { b, o: off + a };
    }
    off += n.length;
  }
  return { b, o: 0 };
}

function pageOfAnchor(anchor) {
  const el = R.blocks[anchor.b];
  if (!el) return 0;
  if (!anchor.o) return R.blockCol[anchor.b];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let off = 0, n;
  while ((n = walker.nextNode())) {
    if (off + n.length > anchor.o) {
      const range = document.createRange();
      const i = anchor.o - off;
      range.setStart(n, i); range.setEnd(n, Math.min(i + 1, n.length));
      const rc = range.getClientRects()[0] || range.getBoundingClientRect();
      return colOfX(rc.left);
    }
    off += n.length;
  }
  return R.blockCol[anchor.b];
}

const step = () => (R.spread ? 2 : 1);
const norm = (p) => { p = clamp(Math.round(p), 0, R.pages - 1); return R.spread ? p - (p % 2) : p; };
const chapterAt = (p) => { let c = -1; R.chStart.forEach((s, i) => { if (s <= p) c = i; }); return c; };

let saveTimer;
function goTo(p, { animate = true, keepAnchor = false } = {}) {
  p = norm(p);
  const prev = R.page;
  R.page = p;
  const x = -p * R.pitch;
  const mode = animate && p !== prev ? settings.turn : 'none';
  if (mode === 'fade') {
    flow.classList.remove('anim-slide', 'anim-fade-in');
    flow.classList.add('anim-fade-out');
    setTimeout(() => {
      flow.style.transform = `translate3d(${x}px,0,0)`;
      flow.classList.replace('anim-fade-out', 'anim-fade-in');
    }, 140);
  } else {
    flow.classList.remove('anim-fade-out', 'anim-fade-in');
    flow.classList.toggle('anim-slide', mode === 'slide');
    flow.style.transform = `translate3d(${x}px,0,0)`;
  }
  if (!keepAnchor) R.anchor = anchorAt(p);
  updatePageChrome();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, 300);
}

function saveProgress() {
  if (!R.book) return;
  const lastPage = norm(R.pages - 1);
  store.set(`progress:${R.book.id}`, { anchor: R.anchor, pct: lastPage ? R.page / lastPage : 0, at: Date.now() });
}

const next = () => goTo(R.page + step());
const prev = () => goTo(R.page - step());

function updatePageChrome() {
  const book = R.book;
  const firstCh = R.chStart[0] ?? 0;
  const slots = R.spread ? [[$('#chromeL'), R.page], [$('#chromeR'), R.page + 1]] : [[$('#chromeL'), R.page]];
  for (const [el, p] of slots) {
    const c = chapterAt(p);
    const exists = p < R.pages;
    const opening = c >= 0 && R.chStart[c] === p;
    const head = R.spread && p % 2 === 0 ? book.title : (c >= 0 ? book.chapters[c].title : '');
    el.classList.toggle('blank-head', !exists || p < firstCh || opening);
    $('.run-head', el).textContent = head;
    $('.folio', el).textContent = exists && p >= firstCh ? String(p - firstCh + 1) : '';
  }
  // Bottom bar
  const c = chapterAt(R.page + (R.spread ? 1 : 0));
  const last = R.spread ? Math.min(R.page + 1, R.pages - 1) : R.page;
  scrub.value = R.page;
  $('#scrubLabel').textContent = c >= 0 ? book.chapters[c].title : 'Front matter';
  const shown = (p) => Math.max(1, p - firstCh + 1);
  const total = R.pages - firstCh;
  $('#pageMeta').textContent = R.page < firstCh ? 'Title' : (last > R.page ? `Pages ${shown(R.page)}–${shown(last)} of ${total}` : `Page ${shown(R.page)} of ${total}`);
  const nextCh = R.chStart.find((s) => s > last);
  const left = (nextCh ?? R.pages) - last - 1;
  $('#leftMeta').textContent = nextCh === undefined ? (left > 0 ? `${left} pages left in book` : 'The end') : (left > 0 ? `${left} page${left > 1 ? 's' : ''} left in chapter` : 'Last page of chapter');
  $('#markBtn').classList.toggle('on', !!currentMark());
  if (!$('#tocSheet').hidden) renderToc();
}

/* Input ----------------------------------------------------------------- */
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, moved: false, id: e.pointerId };
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    drag.moved = true;
    stage.setPointerCapture(e.pointerId);
    flow.classList.remove('anim-slide');
  }
  if (drag.moved) {
    drag.dx = dx;
    if (settings.turn === 'slide') {
      // Rubber-band at the ends of the book.
      const atEdge = (dx > 0 && R.page === 0) || (dx < 0 && R.page >= norm(R.pages - 1));
      const off = atEdge ? dx * 0.25 : dx;
      flow.style.transform = `translate3d(${-R.page * R.pitch + off}px,0,0)`;
    }
  }
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (d.moved) {
    const v = d.dx / Math.max(1, performance.now() - d.t);
    const W = stage.clientWidth;
    if (d.dx < -W * 0.12 || v < -0.45) next();
    else if (d.dx > W * 0.12 || v > 0.45) prev();
    else goTo(R.page);
    return;
  }
  if (e.type === 'pointercancel') return;
  const W = stage.clientWidth;
  const x = e.clientX;
  if (reader.classList.contains('chrome-on')) { reader.classList.remove('chrome-on'); return; }
  if (x < W * 0.25) prev();
  else if (x > W * 0.75) next();
  else reader.classList.add('chrome-on');
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

let wheelLock = 0;
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = Date.now();
  if (now < wheelLock) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 8) return;
  wheelLock = now + 350;
  d > 0 ? next() : prev();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (reader.hidden) return;
  if (e.key === 'Escape') { if (!closeSheets()) reader.classList.toggle('chrome-on'); return; }
  if (!$('#scrim').hidden) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(R.pages - 1);
});

scrub.addEventListener('input', () => goTo(+scrub.value, { animate: false }));

// Fold / unfold, rotation, split-screen: keep the reader on the same sentence.
let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120); }).observe(stage);
window.viewport?.addEventListener?.('segmentschange', relayout);
document.fonts.addEventListener?.('loadingdone', () => relayout());

/* Bars & sheets ---------------------------------------------------------- */
$('#backBtn').addEventListener('click', () => nav(''));
$('#tocBtn').addEventListener('click', () => openSheet('toc'));
$('#setBtn').addEventListener('click', () => openSheet('set'));
$('#scrim').addEventListener('click', closeSheets);
$$('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));

function openSheet(which) {
  closeSheets();
  $('#scrim').hidden = false;
  if (which === 'toc') { renderToc(); renderMarks(); $('#tocSheet').hidden = false; }
  else { syncSettingsUI(); $('#setSheet').hidden = false; }
}
function closeSheets() {
  const open = !$('#scrim').hidden;
  $('#scrim').hidden = true; $('#tocSheet').hidden = true; $('#setSheet').hidden = true;
  return open;
}

function renderToc() {
  const book = R.book;
  const firstCh = R.chStart[0] ?? 0;
  const cur = chapterAt(R.page + (R.spread ? 1 : 0));
  $('#tocList').innerHTML = book.chapters.map((c, i) => `
    <li class="${i === cur ? 'current' : ''}"><button data-page="${R.chStart[i]}">
      <span class="t-kick">${esc(c.kicker)}</span><span class="t-title">${esc(c.title)}</span><span class="t-page">${R.chStart[i] - firstCh + 1}</span>
    </button></li>`).join('');
}
$('#tocList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b) return;
  closeSheets(); reader.classList.remove('chrome-on');
  goTo(+b.dataset.page, { animate: false });
});
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#tocList').hidden = t.dataset.tab !== 'chapters';
  $('#markList').hidden = t.dataset.tab !== 'marks';
}));

/* Bookmarks -------------------------------------------------------------- */
function currentMark() {
  const visible = R.spread ? [R.page, R.page + 1] : [R.page];
  return R.marks.find((m) => visible.includes(pageOfAnchor(m.anchor)));
}
function snippetAt(anchor) {
  const text = (R.blocks[anchor.b]?.textContent || '').slice(anchor.o).trim().replace(/\s+/g, ' ');
  return text.length > 80 ? text.slice(0, 80).replace(/\s\S*$/, '') + '…' : text;
}
$('#markBtn').addEventListener('click', () => {
  const existing = currentMark();
  if (existing) {
    R.marks = R.marks.filter((m) => m !== existing);
    toast('Bookmark removed');
  } else {
    const c = chapterAt(R.page);
    R.marks.push({ anchor: { ...R.anchor }, chapter: c >= 0 ? R.book.chapters[c].title : R.book.title, text: snippetAt(R.anchor), at: Date.now() });
    toast('Page bookmarked');
  }
  store.set(`marks:${R.book.id}`, R.marks);
  updatePageChrome();
  renderMarks();
});
function renderMarks() {
  const firstCh = R.chStart[0] ?? 0;
  const list = R.marks.map((m, i) => ({ m, i, p: pageOfAnchor(m.anchor) })).sort((a, b) => a.p - b.p);
  $('#markList').innerHTML = list.length
    ? list.map(({ m, i, p }) => `<li><button data-mark="${i}">
        <span class="t-kick">${esc(m.chapter)}</span><span class="t-title">${esc(m.text || 'Bookmark')}</span>
        <span class="t-page">${Math.max(1, p - firstCh + 1)} <span class="del" data-del="${i}" role="button" aria-label="Delete bookmark">✕</span></span>
      </button></li>`).join('')
    : '<li class="empty">No bookmarks yet. Tap the ribbon icon in the top bar to mark a page.</li>';
}
$('#markList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    R.marks.splice(+del.dataset.del, 1);
    store.set(`marks:${R.book.id}`, R.marks);
    renderMarks(); updatePageChrome();
    return;
  }
  const b = e.target.closest('[data-mark]');
  if (!b) return;
  const m = R.marks[+b.dataset.mark];
  closeSheets(); reader.classList.remove('chrome-on');
  R.anchor = { ...m.anchor };
  goTo(pageOfAnchor(m.anchor), { animate: false, keepAnchor: true });
});

/* Settings --------------------------------------------------------------- */
function applySettings() {
  reader.dataset.theme = settings.theme;
  reader.dataset.face = settings.face;
  setThemeColor(THEME_BAR[settings.theme]);
}
function setThemeColor(c) { $('meta[name="theme-color"]').setAttribute('content', c); }

function syncSettingsUI() {
  $('#fontOut').textContent = Math.round(settings.fontScale * 100) + '%';
  $$('#setSheet [data-group]').forEach((g) => $$('[data-val]', g).forEach((b) => b.classList.toggle('active', b.dataset.val === settings[g.dataset.group])));
  $('#wakeChk').checked = settings.wake;
}
function saveSettings(relay = true) {
  store.set('settings', settings);
  applySettings();
  syncSettingsUI();
  if (relay) relayout();
}
$('#setSheet').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) {
    settings.fontScale = clamp(+(settings.fontScale + (act === 'font+' ? 0.1 : -0.1)).toFixed(2), 0.7, 1.8);
    return saveSettings();
  }
  const val = e.target.closest('[data-val]');
  const group = val?.closest('[data-group]')?.dataset.group;
  if (!group) return;
  settings[group] = val.dataset.val;
  saveSettings(group !== 'theme' && group !== 'turn');
});
$('#wakeChk').addEventListener('change', (e) => { settings.wake = e.target.checked; saveSettings(false); updateWakeLock(); });
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Full screen not available'));
});

let wakeLock = null;
async function updateWakeLock() {
  const want = settings.wake && !reader.hidden && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported or denied */ }
}
document.addEventListener('visibilitychange', () => { updateWakeLock(); if (document.visibilityState === 'hidden') saveProgress(); });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

/* Routing ---------------------------------------------------------------- */
// Navigation is held in memory and mirrored to the hash when the host allows
// it, so the Android back gesture works but nothing depends on the URL.
let current = location.hash;
function nav(hash) {
  current = hash;
  try { if (location.hash !== hash) location.hash = hash; } catch { /* sandboxed */ }
  route();
}
function route() {
  const m = current.match(/^#\/read\/([\w-]+)(\/toc)?/);
  if (m) openBook(m[1], !!m[2]);
  else closeBook();
}
window.addEventListener('hashchange', () => {
  const h = location.hash.replace(/^#$/, '');
  if (h !== current) { current = h; route(); }
});
renderLibrary();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
