import { prefs, shelf, takeInbox } from './storage.js';
import { readEpubInfo, loadEpub } from './epub.js';

/* ───────────────────────── Helpers & settings ───────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const splitTitle = (t) => { const i = t.indexOf(': '); return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : [t, '']; };
const hueOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const DEFAULTS = { v: 2, fontScale: 1, face: 'serif', leading: 'normal', layout: 'auto', theme: 'paper', turn: 'flip', wake: false, haptics: true, wpm: 230 };
const saved = prefs.get('settings', {});
const settings = { ...DEFAULTS, ...saved, ...(saved.v ? {} : { turn: 'flip' }), v: 2 };
const LEADING = { tight: 1.45, normal: 1.6, loose: 1.8 };
const THEME_BAR = { paper: '#f7f2e7', sepia: '#f1e3c6', night: '#14161c', heart: '#0d1638' };
const CHROME_HTML = '<div class="run-head"></div><div class="folio"></div><div class="foot foot-l"></div><div class="foot foot-r"></div>';

let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ───────────────────────── Library ───────────────────────── */
const coverUrls = new Map();
function coverHtml(rec) {
  if (rec.cover) {
    if (!coverUrls.has(rec.id)) coverUrls.set(rec.id, URL.createObjectURL(rec.cover));
    return `<img class="cover-img" src="${coverUrls.get(rec.id)}" alt="">`;
  }
  const [main] = splitTitle(rec.title);
  return `<div class="gen-cover" style="--hue:${hueOf(rec.title)}"><span>${esc(main)}</span><small>${esc(rec.author)}</small></div>`;
}

function progressOf(id) { return prefs.get(`progress:${id}`, null); }

async function renderLibrary() {
  let books = [];
  try { books = await shelf.all(); } catch { toast('This browser is blocking storage, so imported books can’t be saved.', 4000); }
  const lastRead = (b) => progressOf(b.id)?.at || 0;
  books.sort((a, b) => lastRead(b) - lastRead(a) || b.added - a.added);
  const hero = books.find((b) => b.featured) || books.find((b) => lastRead(b)) || null;

  let html = '';
  if (!books.length) {
    html += `<section class="empty">
      <div class="empty-art" aria-hidden="true"></div>
      <h1>Your library is empty</h1>
      <p>Spread reads EPUB files. Import one from your phone, or share an EPUB to Spread from your Files app once the app is installed.</p>
      <div class="cta"><button class="btn" data-import>Import an EPUB</button></div>
      <p class="empty-links">Free, DRM-free classics: <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a> · <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a></p>
    </section>`;
    $('#shelf').innerHTML = html;
    return;
  }
  if (hero) {
    const [main, sub] = splitTitle(hero.title);
    const prog = progressOf(hero.id);
    const pct = prog ? Math.round(prog.pct * 100) : 0;
    html += `<section class="hero" aria-label="${hero.featured ? 'Featured' : 'Continue reading'}">
      <button class="hero-cover" data-open="${hero.id}" aria-label="Open ${esc(main)}">${coverHtml(hero)}</button>
      <div class="hero-info">
        <div class="eyebrow">${hero.featured ? 'Featured' : 'Continue reading'}</div>
        <h1>${esc(main)}</h1>${sub ? `<h2>${esc(sub)}</h2>` : ''}
        ${hero.description ? `<p>${esc(hero.description)}</p>` : ''}
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="progress-label">${pct ? `${pct}% read` : 'Not started'}</div>
        <div class="cta">
          <button class="btn" data-open="${hero.id}">${pct ? 'Continue reading' : 'Start reading'}</button>
          <button class="btn ghost" data-open="${hero.id}" data-toc>Contents</button>
        </div>
      </div>
    </section>`;
  }
  html += `<section class="mine">
    <div class="sec-head"><h2>Your library</h2><span>${books.length} ${books.length === 1 ? 'book' : 'books'}</span></div>
    <div class="grid">
      ${books.map((b) => {
        const pct = Math.round((progressOf(b.id)?.pct || 0) * 100);
        return `<div class="tile">
          <button class="tile-cover" data-open="${b.id}" aria-label="Open ${esc(b.title)}">${coverHtml(b)}</button>
          <div class="tile-meta">
            <div class="tile-title">${esc(splitTitle(b.title)[0])}</div>
            <div class="tile-author">${esc(b.author || 'Unknown author')}</div>
            <div class="tile-bar"><i style="width:${pct}%"></i></div>
          </div>
          <button class="tile-more" data-remove="${b.id}" aria-label="Remove ${esc(b.title)}">Remove</button>
        </div>`;
      }).join('')}
      <div class="tile add">
        <button class="tile-cover add-cover" data-import><span class="plus" aria-hidden="true">+</span><span>Add a book</span></button>
        <p class="add-help">Import any DRM-free EPUB, or share one to Spread from your Files app. Free classics: <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a> · <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a></p>
      </div>
    </div>
  </section>`;
  $('#shelf').innerHTML = html;
}

$('#shelf').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  if (open) return nav(`#/read/${open.dataset.open}${open.hasAttribute('data-toc') ? '/toc' : ''}`);
  if (e.target.closest('[data-import]')) return $('#importInput').click();
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    if (!rm.classList.contains('armed')) {
      $$('.tile-more.armed').forEach((b) => { b.classList.remove('armed'); b.textContent = 'Remove'; });
      rm.classList.add('armed'); rm.textContent = 'Tap to confirm';
      return;
    }
    const id = rm.dataset.remove;
    const rec = await shelf.get(id);
    await shelf.remove(id);
    if (rec?.featured) prefs.set('removed', [...prefs.get('removed', []), id]);
    try { localStorage.removeItem(`spread:progress:${id}`); localStorage.removeItem(`spread:marks:${id}`); } catch { /* ignore */ }
    if (coverUrls.has(id)) { URL.revokeObjectURL(coverUrls.get(id)); coverUrls.delete(id); }
    if (R.cache?.id === id) R.cache = null;
    toast('Removed from library');
    renderLibrary();
  }
});
$('#importBtn').addEventListener('click', () => $('#importInput').click());
$('#importInput').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
$('#library').addEventListener('dragover', (e) => { e.preventDefault(); });
$('#library').addEventListener('drop', (e) => { e.preventDefault(); importFiles([...e.dataTransfer.files]); });

async function importFiles(files) {
  if (!files.length) return;
  const existing = await shelf.all().catch(() => []);
  let added = 0;
  for (const file of files) {
    if (!/\.epub$/i.test(file.name || '') && file.type !== 'application/epub+zip') {
      toast(`“${file.name}” isn’t an EPUB. Only EPUB books can be imported for now.`, 3500);
      continue;
    }
    try {
      toast(`Adding ${file.name}…`, 60000);
      const info = await readEpubInfo(file);
      if (existing.some((b) => b.title === info.title && b.author === info.author)) { toast(`“${info.title}” is already in your library`); continue; }
      const id = 'u-' + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
      await shelf.put({ id, ...info, file, added: Date.now() });
      existing.push(info);
      added++;
      toast(`Added “${splitTitle(info.title)[0]}”`);
    } catch (err) {
      toast(`Couldn’t add ${file.name}: ${err.message}`, 4000);
    }
  }
  if (added) renderLibrary();
}

// Books listed in catalog.json ship with the app (the featured book lives
// there). They're copied into the library once, and refreshed when their
// catalog version changes.
async function seedCatalog() {
  let list;
  try { list = await (await fetch('catalog.json', { cache: 'no-cache' })).json(); } catch { return; }
  const removed = prefs.get('removed', []);
  for (const entry of list) {
    if (removed.includes(entry.id)) continue;
    const have = await shelf.get(entry.id).catch(() => null);
    if (have && have.catalogVersion === entry.version) continue;
    try {
      const file = await (await fetch(entry.file)).blob();
      const info = await readEpubInfo(file);
      await shelf.put({ id: entry.id, ...info, file, featured: !!entry.featured, catalogVersion: entry.version, added: have?.added || Date.now() });
      coverUrls.delete(entry.id);
      if (R.cache?.id === entry.id) R.cache = null;
    } catch (err) { console.warn('Could not load', entry.file, err); }
  }
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').hidden = true;
});

/* ───────────────────────── Reader state ───────────────────────── */
const reader = $('#reader');
const stage = $('#stage');
const flow = $('#flow');   // every section, laid out but never painted: used for measuring
const view = $('#view');   // what's on screen: a clone of the current section and its neighbours
const scrub = $('#scrub');
const flipLayer = $('#flipLayer');

const R = {
  book: null, cache: null,
  sections: [], secStart: [],
  blocks: [], blockCol: [],
  toc: [], tocStart: [],
  pages: 1, page: 0, firstNum: 0,
  spread: false, pitch: 1, geo: null, view: null,
  words: 0, wordsPerPage: 250,
  anchor: { b: 0, o: 0 }, marks: [],
};
let openToken = 0;

async function openBook(id, showToc) {
  const token = ++openToken;
  $('#library').hidden = true;
  reader.hidden = false;
  reader.classList.remove('entered');
  requestAnimationFrame(() => reader.classList.add('entered'));
  applySettings();
  updateWakeLock();
  try {
    if (R.cache?.id !== id) {
      $('#loading').hidden = false;
      const rec = await shelf.get(id);
      if (!rec) throw new Error('That book isn’t in your library any more.');
      const data = await loadEpub(rec.file);
      if (token !== openToken) { data.urls.forEach(URL.revokeObjectURL); return; }
      R.cache?.urls.forEach(URL.revokeObjectURL);
      R.cache = { id, ...data, title: rec.title || data.title };
    }
    if (R.book !== R.cache) {
      R.book = R.cache;
      const prog = progressOf(id);
      R.anchor = prog?.v === 2 ? prog.anchor : { b: 0, o: 0 };
      R.marks = prefs.get(`marks:${id}`, []);
      R.page = 0;
      $('#barTitle').textContent = splitTitle(R.book.title)[0];
      await renderFlow(R.book);
    }
    await document.fonts.ready;
    if (token !== openToken) return;
    $('#loading').hidden = true;
    relayout();
    if (showToc) openSheet('toc');
  } catch (err) {
    $('#loading').hidden = true;
    toast(`Couldn’t open this book: ${err.message}`, 4000);
    nav('');
  }
}

function closeBook() {
  openToken++;
  closeSheets();
  endFlip(flip, true);
  saveProgress();
  reader.hidden = true;
  $('#library').hidden = false;
  reader.classList.remove('chrome-on');
  renderLibrary();
  updateWakeLock();
  setThemeColor('#0b1230');
}

const BLOCK_SEL = 'section,p,h1,h2,h3,h4,h5,h6,li,dt,dd,pre,blockquote,figure,img,table,hr,header,aside,div';

async function renderFlow(book) {
  flow.lang = view.lang = book.language || 'en';
  R.view = null; view.replaceChildren();
  flow.innerHTML = book.sections.map((h, i) => `<section class="chapter epub-doc" id="s-${i}">${h}</section>`).join('');
  // Mark the very end of the text so we can count pages.
  let last = flow.lastElementChild;
  while (last?.lastElementChild && !/^(img|hr|table)$/i.test(last.lastElementChild.localName)) last = last.lastElementChild;
  (last || flow).insertAdjacentHTML('beforeend', '<span class="end-mark"></span>');

  R.sections = $$('.flow > section');
  R.blocks = $$(BLOCK_SEL, flow).filter((el) => el.localName !== 'div' || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  let toc = book.toc.map((t) => ({ ...t, el: document.getElementById(t.target) })).filter((t) => t.el);
  if (!toc.length) {
    toc = R.sections.map((s, i) => ({ title: s.querySelector('h1,h2,h3')?.textContent.trim() || `Section ${i + 1}`, depth: 0, el: s }))
      .filter((t) => t.el.textContent.trim());
  }
  for (const t of toc) t.kicker = t.el.querySelector?.('.sb-kicker')?.textContent.trim() || '';
  R.toc = toc;
  R.words = flow.textContent.length / 5.8;
  await Promise.all($$('img', flow).map((img) => img.decode?.().catch(() => {})));
}

/* ───────────────────────── Geometry ───────────────────────── */
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
  if (reader.hidden || !R.book || !R.sections.length) return;
  endFlip(flip, true);
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
  R.geo = { W, H, spineX: spread ? spineX : W, colw, gap, vx, vh };
  reader.classList.toggle('is-spread', spread);
  const s = reader.style;
  for (const [k, v] of Object.entries({ vx, vy: padTop, vw, vh, vbottom: H - padTop - vh, colw, gap, 'spine-x': spineX, fs })) s.setProperty('--' + k, v + 'px');
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
  R.view = null;
  R.page = norm(pageOfAnchor(R.anchor));
  goTo(R.page, { animate: false, keepAnchor: true });
}

function colOfX(x) { return Math.floor((x - flow.getBoundingClientRect().left + 2) / R.pitch); }

function measure() {
  view.classList.remove('anim-slide');
  const left = flow.getBoundingClientRect().left;
  const col = (el) => Math.floor((el.getBoundingClientRect().left - left + 2) / R.pitch);
  R.blockCol = R.blocks.map(col);
  R.secStart = R.sections.map(col);
  R.tocStart = R.toc.map((t) => col(t.el));
  R.pages = col($('.end-mark', flow)) + 1;
  R.firstNum = R.tocStart[0] ?? 0;
  R.wordsPerPage = R.words / R.pages;
  scrub.max = R.pages - 1;
}

/* ───────────────────────── Positions ───────────────────────── */
// An anchor is { b: block index, o: character offset inside that block }.
// It survives font changes and folding/unfolding, unlike a page number.
function lastAtOrBefore(arr, page) {
  let lo = 0, hi = arr.length - 1, i = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= page) { i = m; lo = m + 1; } else hi = m - 1; }
  return i;
}

function anchorAt(page) {
  const b = lastAtOrBefore(R.blockCol, page);
  if (R.blockCol[b] >= page) return { b, o: 0 };
  const walker = document.createTreeWalker(R.blocks[b], NodeFilter.SHOW_TEXT);
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
  const el = R.blocks[anchor?.b];
  if (!el) return 0;
  if (!anchor.o) return R.blockCol[anchor.b];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let off = 0, n;
  while ((n = walker.nextNode())) {
    if (off + n.length > anchor.o) {
      const range = document.createRange();
      const i = anchor.o - off;
      range.setStart(n, i); range.setEnd(n, Math.min(i + 1, n.length));
      return colOfX((range.getClientRects()[0] || range.getBoundingClientRect()).left);
    }
    off += n.length;
  }
  return R.blockCol[anchor.b];
}

const step = () => (R.spread ? 2 : 1);
const norm = (p) => { p = clamp(Math.round(p), 0, R.pages - 1); return R.spread ? p - (p % 2) : p; };
const chapterAt = (p) => { let c = -1; R.tocStart.forEach((s, i) => { if (s <= p) c = i; }); return c; };
const sectionAt = (p) => lastAtOrBefore(R.secStart, p);

/* ───────────────────────── Turning pages ─────────────────────────
   Moving the whole book as one layer is far too slow on a phone, so the
   screen shows a clone of just the current section and its neighbours.
   Sections always start on a fresh column, so the clone lays out exactly
   like the hidden measuring flow. */
const tx = (p) => `translate3d(${-(p - R.view.base) * R.pitch}px,0,0)`;

function buildView(p) {
  const s = sectionAt(p);
  const a = Math.max(0, s - 1), b = Math.min(R.sections.length - 1, s + 1);
  if (R.view && a >= R.view.a && b <= R.view.b) return false;
  const frag = document.createDocumentFragment();
  for (let i = a; i <= b; i++) {
    const sec = R.sections[i].cloneNode(true);
    sec.removeAttribute('id');
    sec.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    frag.appendChild(sec);
  }
  view.replaceChildren(frag);
  R.view = { a, b, base: R.secStart[a] };
  return true;
}

function paint(p, fromP = null) {
  const rebuilt = buildView(p);
  if (rebuilt && fromP !== null && view.classList.contains('anim-slide')) {
    // Keep a slide continuous across a rebuild: start from where we were.
    view.style.transition = 'none';
    view.style.transform = tx(fromP);
    void view.offsetWidth;
    view.style.transition = '';
  }
  view.style.transform = tx(p);
  updatePageChrome(p);
}

let saveTimer, lastTurnAt = 0;
function goTo(p, { animate = true, keepAnchor = false } = {}) {
  if (flip) endFlip(flip, true);
  p = norm(p);
  const prev = R.page;
  R.page = p;
  learnSpeed(prev, p);
  const mode = animate && p !== prev ? settings.turn : 'none';
  if (mode === 'fade') {
    view.classList.remove('anim-slide', 'anim-fade-in');
    view.classList.add('anim-fade-out');
    setTimeout(() => {
      buildView(p);
      view.style.transform = tx(p);
      view.classList.replace('anim-fade-out', 'anim-fade-in');
    }, 140);
    updatePageChrome(p);
  } else {
    view.classList.remove('anim-fade-out', 'anim-fade-in');
    view.classList.toggle('anim-slide', mode === 'slide' || mode === 'flip');
    paint(p, prev);
  }
  if (!keepAnchor) R.anchor = anchorAt(p);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, 300);
}

// Learn the reader's pace from how long they spend on each page.
function learnSpeed(prev, p) {
  const now = Date.now();
  const dt = now - lastTurnAt;
  lastTurnAt = now;
  if (p !== prev + step() || dt < 5000 || dt > 180000) return;
  const sample = clamp((R.wordsPerPage * step()) / (dt / 60000), 80, 700);
  settings.wpm = Math.round(settings.wpm * 0.85 + sample * 0.15);
  prefs.set('settings', settings);
}

function saveProgress() {
  if (!R.book) return;
  const lastPage = norm(R.pages - 1);
  prefs.set(`progress:${R.book.id}`, { v: 2, anchor: R.anchor, pct: lastPage ? R.page / lastPage : 0, at: Date.now() });
}

function turn(dir) {
  diag.turns++;
  if (settings.turn === 'flip') {
    const f = startFlip(dir);
    if (f) { f.auto = true; runFlip(f, 1); return; }
  }
  goTo(R.page + dir * step());
}
const next = () => turn(1);
const prev = () => turn(-1);

function haptic() { if (settings.haptics) navigator.vibrate?.(6); }

/* Page flip ---------------------------------------------------------------
   The real text flow jumps straight to the destination; a "leaf" made of
   cloned pages rotates over it around the spine (or the left edge on a
   single page). Each page belongs to exactly one section, so a face only
   needs a clone of that one section, not the whole book. */
let flip = null;

function makeFace(p, slot) {
  const g = R.geo;
  const face = document.createElement('div');
  face.className = 'face';
  const slotX = slot === 'R' ? g.spineX : 0;
  face.style.width = (slot === 'S' ? g.W : slot === 'L' ? g.spineX : g.W - g.spineX) + 'px';
  if (p >= 0 && p < R.pages) {
    const s = sectionAt(p);
    const vp = document.createElement('div');
    vp.className = 'face-vp';
    vp.style.left = ((slot === 'R' ? g.vx + g.colw + g.gap : g.vx) - slotX) + 'px';
    const fl = document.createElement('div');
    fl.className = 'flow';
    fl.lang = flow.lang;
    const sec = R.sections[s].cloneNode(true);
    sec.removeAttribute('id');
    sec.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    fl.appendChild(sec);
    fl.style.transform = `translate3d(${-(p - R.secStart[s]) * R.pitch}px,0,0)`;
    vp.appendChild(fl);
    face.appendChild(vp);
  }
  face.insertAdjacentHTML('beforeend', CHROME_HTML + '<div class="shade"></div>');
  fillChrome(face, p, slot);
  return face;
}

function startFlip(dir) {
  if (flip) endFlip(flip, true);
  const from = R.page, to = norm(from + dir * step());
  if (to === from || !R.geo) return null;
  const involved = R.spread ? [from, from + 1, to, to + 1] : [from, to];
  // Very long single-file books would be slow to clone; slide those instead.
  if (involved.some((p) => p < R.pages && R.sections[sectionAt(p)].textContent.length > 120000)) return null;
  const g = R.geo;
  const f = { from, to, dir, t: 0, raf: 0, spread: R.spread, auto: false };
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
  const backside = (face) => { face.classList.add('backside'); return face; };
  flipLayer.replaceChildren();
  if (R.spread) {
    let still;
    if (dir > 0) {
      still = makeFace(from, 'L');
      leaf.classList.add('pivot-left');
      Object.assign(leaf.style, { left: g.spineX + 'px', width: g.W - g.spineX + 'px' });
      leaf.append(makeFace(from + 1, 'R'), backside(makeFace(to, 'L')));
    } else {
      still = makeFace(from + 1, 'R');
      still.style.left = g.spineX + 'px';
      leaf.classList.add('pivot-right');
      Object.assign(leaf.style, { left: '0px', width: g.spineX + 'px' });
      leaf.append(makeFace(from, 'L'), backside(makeFace(to + 1, 'R')));
    }
    flipLayer.append(still, leaf);
    paint(to);
  } else {
    leaf.classList.add('pivot-left');
    Object.assign(leaf.style, { left: '0px', width: g.W + 'px' });
    const blank = document.createElement('div');
    blank.className = 'face';
    blank.innerHTML = '<div class="shade"></div>';
    leaf.append(makeFace(dir > 0 ? from : to, 'S'), backside(blank));
    flipLayer.append(leaf);
    if (dir > 0) paint(to);
  }
  flipLayer.hidden = false;
  Object.assign(f, { leaf, front: leaf.children[0], back: leaf.children[1] });
  flip = f;
  renderFlip(f);
  return f;
}

function renderFlip(f) {
  const angle = f.spread ? (f.dir > 0 ? -180 * f.t : 180 * f.t) : (f.dir > 0 ? -180 * f.t : -180 * (1 - f.t));
  const a = Math.abs(angle) / 180;
  f.leaf.style.transform = `rotateY(${angle}deg)`;
  f.front.lastElementChild.style.opacity = (a * 0.55).toFixed(3);
  f.back.lastElementChild.style.opacity = ((1 - a) * 0.55).toFixed(3);
  flipLayer.style.setProperty('--lift', Math.sin(a * Math.PI).toFixed(3));
}

function runFlip(f, target, ms = 560) {
  cancelAnimationFrame(f.raf);
  clearTimeout(f.watchdog);
  const t0 = f.t, start = performance.now();
  const dur = Math.max(140, ms * Math.abs(target - t0));
  const tick = (now) => {
    const k = Math.min(1, (now - start) / dur);
    f.t = t0 + (target - t0) * (1 - Math.pow(1 - k, 3));
    renderFlip(f);
    if (k < 1) f.raf = requestAnimationFrame(tick);
    else endFlip(f, target === 1);
  };
  f.raf = requestAnimationFrame(tick);
  // If animation frames stall (a throttled or embedded page), still finish the turn.
  f.watchdog = setTimeout(() => { if (flip === f) { diag.note('flip watchdog'); endFlip(f, target === 1); } }, dur + 400);
}

function endFlip(f, commit) {
  if (!f || flip !== f) return;
  cancelAnimationFrame(f.raf);
  clearTimeout(f.watchdog);
  flip = null;
  flipLayer.hidden = true;
  flipLayer.replaceChildren();
  if (commit) { goTo(f.to, { animate: false }); haptic(); }
  else paint(f.from);
}

/* ───────────────────────── Page chrome ───────────────────────── */
function timeLeft(lastVisible) {
  const nextStart = R.tocStart.find((s) => s > lastVisible);
  const where = nextStart === undefined ? 'book' : 'chapter';
  const pagesLeft = (nextStart ?? R.pages) - lastVisible - 1;
  if (pagesLeft <= 0) return where === 'book' ? 'End of book' : 'Last page of chapter';
  const min = (pagesLeft * R.wordsPerPage) / settings.wpm;
  return `${Math.max(1, Math.round(min))} min left in ${where}`;
}

function fillChrome(el, p, slot) {
  const exists = p >= 0 && p < R.pages;
  const c = chapterAt(p);
  const opening = c >= 0 && R.tocStart[c] === p;
  const bookTitle = splitTitle(R.book.title)[0];
  el.classList.toggle('blank-head', !exists || p < R.firstNum || opening);
  $('.run-head', el).textContent = slot === 'L' ? bookTitle : (c >= 0 ? R.toc[c].title : bookTitle);
  $('.folio', el).textContent = exists && p >= R.firstNum ? String(p - R.firstNum + 1) : '';
  const lastVisible = slot === 'L' ? Math.min(p + 1, R.pages - 1) : p;
  $('.foot-l', el).textContent = slot !== 'R' && exists && p >= R.firstNum ? timeLeft(lastVisible) : '';
  $('.foot-r', el).textContent = slot !== 'L' && exists ? `${Math.round(((p + 1) / R.pages) * 100)}%` : '';
}

function updatePageChrome(p) {
  if (R.spread) { fillChrome($('#chromeL'), p, 'L'); fillChrome($('#chromeR'), p + 1, 'R'); }
  else fillChrome($('#chromeL'), p, 'S');
  // Page-edge "thickness" on each side, like the pages of a real book.
  const prog = R.pages > 1 ? p / (R.pages - 1) : 0;
  reader.style.setProperty('--edge-l', R.spread ? (1 + prog * 6).toFixed(1) + 'px' : '0px');
  reader.style.setProperty('--edge-r', (1 + (1 - prog) * 6).toFixed(1) + 'px');

  const c = chapterAt(p + (R.spread ? 1 : 0));
  const last = R.spread ? Math.min(p + 1, R.pages - 1) : p;
  scrub.value = p;
  $('#scrubLabel').textContent = c >= 0 ? R.toc[c].title : 'Front matter';
  const shown = (q) => Math.max(1, q - R.firstNum + 1);
  const total = R.pages - R.firstNum;
  $('#pageMeta').textContent = last < R.firstNum ? 'Front matter'
    : (last > p && p >= R.firstNum ? `Pages ${shown(p)}–${shown(last)} of ${total}` : `Page ${shown(last)} of ${total}`);
  $('#leftMeta').textContent = timeLeft(last);
  $('#markBtn').classList.toggle('on', !!currentMark(p));
  if (!$('#tocSheet').hidden) renderToc();
}

/* ───────────────────────── Input ───────────────────────── */
// Diagnostics shown at the bottom of the settings sheet, for bug reports.
const diag = {
  last: 'none', turns: 0, notes: [],
  note(s) { this.notes.push(s); if (this.notes.length > 4) this.notes.shift(); },
  text() {
    const g = R.geo || {};
    return `${g.W || 0}×${g.H || 0} @${(window.devicePixelRatio || 1).toFixed(2)} · ${R.spread ? 'spread' : 'single'} · page ${R.page + 1}/${R.pages} · ` +
      `last input: ${this.last} · turns: ${this.turns} · pointer: ${'onpointerdown' in window ? 'yes' : 'no'} · touch: ${navigator.maxTouchPoints || 0}` +
      (window.viewport?.segments ? ` · segments: ${window.viewport.segments.length}` : '') +
      (this.notes.length ? ` · ${this.notes.join(', ')}` : '');
  },
};

let drag = null, lastHandled = 0;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  diag.last = `${e.pointerType} down`;
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, moved: false, id: e.pointerId, flip: null };
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    drag.moved = true;
    stage.setPointerCapture(e.pointerId);
    view.classList.remove('anim-slide');
    drag.dir = dx < 0 ? 1 : -1;
    if (settings.turn === 'flip') drag.flip = startFlip(drag.dir);
  }
  if (!drag.moved) return;
  drag.dx = dx;
  if (drag.flip) {
    // The leaf follows the finger.
    drag.flip.t = clamp((drag.dir * -dx) / (R.geo.W * (R.spread ? 0.5 : 0.7)), 0, 1);
    renderFlip(drag.flip);
  } else if (settings.turn === 'slide' || settings.turn === 'flip') {
    // Rubber-band at the ends of the book.
    const atEdge = (dx > 0 && R.page === 0) || (dx < 0 && R.page >= norm(R.pages - 1));
    view.style.transform = `translate3d(${-(R.page - R.view.base) * R.pitch + (atEdge ? dx * 0.25 : dx)}px,0,0)`;
  }
});

function tapAt(x, e) {
  lastHandled = performance.now();
  const link = e?.target?.closest?.('a');
  if (link && view.contains(link)) {
    if (link.dataset.target) followLink(link);
    return; // external links open on their own
  }
  if (reader.classList.contains('chrome-on')) { reader.classList.remove('chrome-on'); return; }
  const W = stage.clientWidth;
  if (x < W * 0.25) prev();
  else if (x > W * 0.75) next();
  else reader.classList.add('chrome-on');
}

const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  diag.last = `${e.pointerType} ${e.type}${d.moved ? ' swipe' : ' tap'}`;
  if (d.moved) {
    lastHandled = performance.now();
    const v = (d.dir * -d.dx) / Math.max(1, performance.now() - d.t);
    if (d.flip) return runFlip(d.flip, d.flip.t > 0.33 || v > 0.4 ? 1 : 0, 480);
    const W = stage.clientWidth;
    if (d.dx < -W * 0.12 || (d.dir > 0 && v > 0.45)) goTo(R.page + step());
    else if (d.dx > W * 0.12 || (d.dir < 0 && v > 0.45)) goTo(R.page - step());
    else goTo(R.page, { animate: settings.turn !== 'none' });
    return;
  }
  if (e.type === 'pointercancel') return;
  tapAt(e.clientX, e);
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
// Fallback: if pointer events never arrived, a plain click still turns the page.
stage.addEventListener('click', (e) => {
  if (performance.now() - lastHandled < 600) return;
  diag.last = 'click (fallback)';
  tapAt(e.clientX, e);
});
$('#prevBtn').addEventListener('click', () => { diag.last = 'button'; prev(); });
$('#nextBtn').addEventListener('click', () => { diag.last = 'button'; next(); });

// Footnote links pop up the note; other links jump.
function followLink(link) {
  const target = document.getElementById(link.dataset.target);
  if (!target) return;
  const isNote = link.hasAttribute('data-noteref') || /^\s*[[(]?[\d*†‡§]{1,3}[\])]?\s*$/.test(link.textContent);
  if (isNote) {
    const note = target.closest('li, aside, p, dd, div') || target;
    $('#noteBody').innerHTML = note.innerHTML;
    $('#noteBody').querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    $('#noteGo').onclick = () => { closeSheets(); jumpTo(target); };
    openSheet('note');
    return;
  }
  jumpTo(target);
}
function jumpTo(el) {
  const p = colOfX(el.getBoundingClientRect().left);
  const b = R.blocks.indexOf(el.closest(BLOCK_SEL));
  if (b >= 0) R.anchor = { b, o: 0 };
  goTo(p, { animate: false, keepAnchor: b >= 0 });
}

let wheelLock = 0;
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = Date.now();
  if (now < wheelLock) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 8) return;
  wheelLock = now + 450;
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

/* ───────────────────────── Bars & sheets ───────────────────────── */
$('#backBtn').addEventListener('click', () => nav(''));
$('#tocBtn').addEventListener('click', () => openSheet('toc'));
$('#setBtn').addEventListener('click', () => openSheet('set'));
$('#scrim').addEventListener('click', closeSheets);
$$('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));

function openSheet(which) {
  closeSheets();
  $('#scrim').hidden = false;
  if (which === 'toc') { renderToc(); renderMarks(); $('#tocSheet').hidden = false; $('#tocList .current')?.scrollIntoView({ block: 'center' }); }
  else if (which === 'note') $('#noteSheet').hidden = false;
  else { syncSettingsUI(); $('#setSheet').hidden = false; }
}
function closeSheets() {
  const open = !$('#scrim').hidden;
  $('#scrim').hidden = true;
  for (const id of ['#tocSheet', '#setSheet', '#noteSheet']) $(id).hidden = true;
  return open;
}

function renderToc() {
  const cur = chapterAt(R.page + (R.spread ? 1 : 0));
  $('#tocList').innerHTML = R.toc.map((t, i) => `
    <li class="${i === cur ? 'current' : ''}" style="--depth:${Math.min(t.depth, 3)}"><button data-toc-i="${i}">
      ${t.kicker ? `<span class="t-kick">${esc(t.kicker)}</span>` : ''}<span class="t-title">${esc(t.title)}</span><span class="t-page">${Math.max(1, R.tocStart[i] - R.firstNum + 1)}</span>
    </button></li>`).join('');
}
$('#tocList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-toc-i]');
  if (!b) return;
  closeSheets(); reader.classList.remove('chrome-on');
  jumpTo(R.toc[+b.dataset.tocI].el);
});
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#tocList').hidden = t.dataset.tab !== 'chapters';
  $('#markList').hidden = t.dataset.tab !== 'marks';
}));

/* ───────────────────────── Bookmarks ───────────────────────── */
function currentMark(p = R.page) {
  const visible = R.spread ? [p, p + 1] : [p];
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
    R.marks.push({ anchor: { ...R.anchor }, chapter: c >= 0 ? R.toc[c].title : splitTitle(R.book.title)[0], text: snippetAt(R.anchor), at: Date.now() });
    toast('Page bookmarked');
  }
  prefs.set(`marks:${R.book.id}`, R.marks);
  updatePageChrome(R.page);
  renderMarks();
});
function renderMarks() {
  const list = R.marks.map((m, i) => ({ m, i, p: pageOfAnchor(m.anchor) })).sort((a, b) => a.p - b.p);
  $('#markList').innerHTML = list.length
    ? list.map(({ m, i, p }) => `<li><button data-mark="${i}">
        <span class="t-kick">${esc(m.chapter)}</span><span class="t-title">${esc(m.text || 'Bookmark')}</span>
        <span class="t-page">${Math.max(1, p - R.firstNum + 1)} <span class="del" data-del="${i}" role="button" aria-label="Delete bookmark">✕</span></span>
      </button></li>`).join('')
    : '<li class="empty">No bookmarks yet. Tap the ribbon icon in the top bar to mark a page.</li>';
}
$('#markList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    R.marks.splice(+del.dataset.del, 1);
    prefs.set(`marks:${R.book.id}`, R.marks);
    renderMarks(); updatePageChrome(R.page);
    return;
  }
  const b = e.target.closest('[data-mark]');
  if (!b) return;
  const m = R.marks[+b.dataset.mark];
  closeSheets(); reader.classList.remove('chrome-on');
  R.anchor = { ...m.anchor };
  goTo(pageOfAnchor(m.anchor), { animate: false, keepAnchor: true });
});

/* ───────────────────────── Settings ───────────────────────── */
function applySettings() {
  reader.dataset.theme = settings.theme;
  reader.dataset.face = settings.face;
  setThemeColor(THEME_BAR[settings.theme]);
}
function setThemeColor(c) { $('meta[name="theme-color"]').setAttribute('content', c); }

function syncSettingsUI() {
  $('#diag').textContent = diag.text();
  $('#fontOut').textContent = Math.round(settings.fontScale * 100) + '%';
  $$('#setSheet [data-group]').forEach((g) => $$('[data-val]', g).forEach((b) => b.classList.toggle('active', b.dataset.val === settings[g.dataset.group])));
  $('#wakeChk').checked = settings.wake;
  $('#hapticChk').checked = settings.haptics;
}
function saveSettings(relay = true) {
  prefs.set('settings', settings);
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
$('#hapticChk').addEventListener('change', (e) => { settings.haptics = e.target.checked; saveSettings(false); haptic(); });
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Full screen isn’t available here'));
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

/* ───────────────────────── Routing & start-up ───────────────────────── */
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

(async () => {
  if (!current.startsWith('#/read/')) $('#shelf').innerHTML = '<p class="lib-loading">Opening your library…</p>';
  await seedCatalog();
  const shared = await takeInbox().catch(() => []);
  if (location.search.includes('shared')) history.replaceState(null, '', location.pathname + location.hash);
  route();
  if (shared.length) importFiles(shared.map((s) => s.file));
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
