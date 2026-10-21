import { prefs, shelf, takeInbox } from './storage.js';
import { readEpubInfo, loadEpub } from './epub.js';

/* ───────────────────────── Helpers & settings ───────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const splitTitle = (t) => { const i = t.indexOf(': '); return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : [t, '']; };
const hueOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const DEFAULTS = {
  v: 3, fontScale: 1, fontFamily: 'literata', leading: 'normal', align: 'justify', para: 'indent', hyphens: true, dropCaps: true,
  layout: 'auto', margins: 'normal', runHeads: true, folios: true, footers: true, spine: true, edges: true,
  theme: 'paper', libraryTheme: false, brightness: 100, warmth: 0,
  turn: 'flip', sensitivity: 5, tapZones: 'edges', reverseTaps: false, haptics: true,
  immersive: true, wake: false, wpm: 230,
};
const saved = prefs.get('settings', {});
const settings = { ...DEFAULTS, ...saved, ...(saved.v ? {} : { turn: 'flip' }), v: 3 };
if (saved.face && !saved.fontFamily) settings.fontFamily = saved.face === 'sans' ? 'inter' : 'literata';
let bookThemes = prefs.get('bookThemes', {});
const LEADING = { tight: 1.45, normal: 1.6, loose: 1.8 };
// Built-in themes; custom ones derive their other colours from these three.
const THEMES = {
  paper: { name: 'Paper', paper: '#f7f2e7', ink: '#2a251e', accent: '#9a6a12', grain: true },
  sepia: { name: 'Sepia', paper: '#f1e3c6', ink: '#3b2e1c', accent: '#8a4b14', grain: true },
  night: { name: 'Night', paper: '#14161c', ink: '#cfcabd', accent: '#e0b25a', grain: true },
  heart: { name: 'Dive to the Heart', paper: '#0d1638', ink: '#dfe4ff', accent: '#f2c14e', grain: false },
};
let customThemes = prefs.get('themes', []);
const MARGIN = { narrow: 0.6, normal: 1, wide: 1.5 };
// Typefaces, fetched from Google Fonts only when chosen (the service worker
// keeps them for offline reading once they've loaded).
const FONTS = {
  literata: { name: 'Literata', css: "'Literata', 'Iowan Old Style', Georgia, serif", gf: 'Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400' },
  crimson: { name: 'Crimson Pro', css: "'Crimson Pro', Georgia, serif", gf: 'Crimson+Pro:ital,wght@0,400;0,600;1,400' },
  garamond: { name: 'EB Garamond', css: "'EB Garamond', Garamond, Georgia, serif", gf: 'EB+Garamond:ital,wght@0,400;0,600;1,400' },
  lora: { name: 'Lora', css: "'Lora', Georgia, serif", gf: 'Lora:ital,wght@0,400;0,600;1,400' },
  merriweather: { name: 'Merriweather', css: "'Merriweather', Georgia, serif", gf: 'Merriweather:ital,wght@0,400;0,700;1,400' },
  inter: { name: 'Inter', css: "'Inter', system-ui, sans-serif", gf: 'Inter:wght@400;500;600' },
  atkinson: { name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', system-ui, sans-serif", gf: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400' },
  nunito: { name: 'Nunito', css: "'Nunito', system-ui, sans-serif", gf: 'Nunito:ital,wght@0,400;0,700;1,400' },
};
const fontsLoaded = new Set(['literata', 'inter']);
function ensureFont(id) {
  const f = FONTS[id];
  if (!f || fontsLoaded.has(id)) return;
  fontsLoaded.add(id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`;
  document.head.appendChild(link);
}
// Turn sensitivity 1..9: how far (commit), how fast (flick) and how much the
// corner moves per finger movement (gain).
function sens() {
  const k = (settings.sensitivity - 1) / 8;
  return { commit: 0.45 - 0.4 * k, flick: 0.5 - 0.4 * k, gain: 0.6 + 0.8 * k };
}
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
      <p>BookFlips reads EPUB files. Import one from your phone, or share an EPUB to BookFlips from your Files app once the app is installed.</p>
      <div class="cta"><button class="btn" data-import>Import an EPUB</button></div>
      <p class="empty-links">Free, DRM-free classics: <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a> · <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a></p>
    </section>`;
    $('#shelf').innerHTML = html;
    renderStatsStrip();
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
        <p class="add-help">Import any DRM-free EPUB, or share one to BookFlips from your Files app. Free classics: <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a> · <a href="https://standardebooks.org" target="_blank" rel="noopener">Standard Ebooks</a></p>
      </div>
    </div>
  </section>`;
  $('#shelf').innerHTML = html;
  renderStatsStrip();
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
  anchor: { b: 0, o: 0 }, marks: [], hls: [], secBlocks: [],
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
      R.hls = prefs.get(`hl:${id}`, []);
      R.page = 0;
      applySettings();
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
  statsTick(false);
  closeSheets();
  hidePop();
  endFlip(flip, true);
  saveProgress();
  reader.hidden = true;
  $('#library').hidden = false;
  reader.classList.remove('chrome-on');
  renderLibrary();
  updateWakeLock();
  applySettings();
}

const BLOCK_SEL = 'section,p,h1,h2,h3,h4,h5,h6,li,dt,dd,pre,blockquote,figure,img,table,hr,header,aside,div';
const blocksIn = (root) => $$(BLOCK_SEL, root).filter((el) => el.localName !== 'div' || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));

async function renderFlow(book) {
  flow.lang = view.lang = book.language || 'en';
  R.view = null; view.replaceChildren();
  flow.innerHTML = book.sections.map((h, i) => `<section class="chapter epub-doc" id="s-${i}">${h}</section>`).join('');
  // Mark the very end of the text so we can count pages.
  let last = flow.lastElementChild;
  while (last?.lastElementChild && !/^(img|hr|table)$/i.test(last.lastElementChild.localName)) last = last.lastElementChild;
  (last || flow).insertAdjacentHTML('beforeend', '<span class="end-mark"></span>');

  R.sections = $$('.flow > section');
  R.blocks = blocksIn(flow);
  // Which blocks belong to which section, in document order (the section
  // element itself first), so a clone's blocks can be matched to the flow's.
  R.secBlocks = R.sections.map(() => []);
  R.blocks.forEach((el, i) => { const si = R.sections.indexOf(el.closest('.flow > section')); if (si >= 0) R.secBlocks[si].push(i); });
  for (const hl of R.hls) wrapHighlight(hl);
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
    const padX = Math.round(clamp(spineX * 0.085 * MARGIN[settings.margins], 14, 84));
    colw = Math.floor(spineX - hinge / 2 - padX * 2);
    gap = padX * 2 + hinge;
    vx = padX;
    vw = colw * 2 + gap;
  } else {
    const padX = Math.round(clamp(W * 0.065 * MARGIN[settings.margins], 12, 72));
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
    // Tag each cloned block with its index in the flow, for highlighting.
    const src = R.secBlocks[i];
    [sec, ...blocksIn(sec)].forEach((el, k) => { if (src[k] !== undefined) el.dataset.b = src[k]; });
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
  if (p !== prev) statsTurn(Math.abs(p - prev));
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
  const pct = lastPage ? R.page / lastPage : 0;
  prefs.set(`progress:${R.book.id}`, { v: 2, anchor: R.anchor, pct, at: Date.now() });
  if (pct >= 0.98) statsFinished(R.book.id, splitTitle(R.book.title)[0]);
}

function turn(dir) {
  diag.turns++;
  if (settings.turn === 'flip') {
    const f = startFlip(dir);
    if (f) { f.auto = true; runFlip(f, true, 1.6); return; }
  }
  goTo(R.page + dir * step());
}
const next = () => turn(1);
const prev = () => turn(-1);

function haptic() { if (settings.haptics) navigator.vibrate?.(6); }

/* Page curl --------------------------------------------------------------
   The real text flow jumps straight to the destination; a leaf made of
   cloned pages peels over it. The corner under the finger lifts and the
   fold line follows the hand, like paper. Geometry is done in a "local"
   frame: the spine is x = 0, the page extends to x = W away from it, so a
   turn of the left page is the same maths with x mirrored.

   Each page belongs to exactly one section, so a face only needs a clone
   of that one section, not the whole book. */
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

function startFlip(dir, finger = null) {
  if (flip) endFlip(flip, true);
  const from = R.page, to = norm(from + dir * step());
  if (to === from || !R.geo) return null;
  const involved = R.spread ? [from, from + 1, to, to + 1] : [from, to];
  // Very long single-file books would be slow to clone; slide those instead.
  if (involved.some((p) => p < R.pages && R.sections[sectionAt(p)].textContent.length > 120000)) return null;
  const g = R.geo;
  const mirror = R.spread && dir < 0;
  const W = R.spread ? (mirror ? g.spineX : g.W - g.spineX) : g.W, H = g.H;
  const f = { from, to, dir, mirror, W, H, raf: 0, watchdog: 0, auto: false, samples: [], slowSince: null };
  // Local <-> element coordinates (element = the turning page's rectangle).
  f.toEl = mirror ? (pt) => [W - pt[0], pt[1]] : (pt) => [pt[0], pt[1]];
  f.toLocalX = mirror ? (sx) => g.spineX - sx : (sx) => sx - (R.spread ? g.spineX : 0);
  const pageLeft = R.spread && !mirror ? g.spineX : 0;

  flipLayer.replaceChildren();
  const front = document.createElement('div'); front.className = 'curl-front';
  const back = document.createElement('div'); back.className = 'curl-back';
  const backInner = document.createElement('div'); backInner.className = 'curl-mirror';
  back.appendChild(backInner);
  for (const el of [front, back]) Object.assign(el.style, { left: pageLeft + 'px', width: W + 'px' });
  const shade = (cls) => { const d = document.createElement('div'); d.className = 'curl-shade ' + cls; return d; };
  const frontShade = shade('on-front'), backShade = shade('on-back');

  if (R.spread) {
    let still;
    if (!mirror) {
      still = makeFace(from, 'L');
      front.appendChild(makeFace(from + 1, 'R'));
      backInner.appendChild(makeFace(to, 'L'));
    } else {
      still = makeFace(from + 1, 'R'); still.style.left = g.spineX + 'px';
      front.appendChild(makeFace(from, 'L'));
      backInner.appendChild(makeFace(to + 1, 'R'));
    }
    flipLayer.append(still, front, back);
    paint(to);
  } else {
    // Forward: this page peels off to reveal the next. Backward: the previous
    // page unfolds in from the left over this one, so the flow stays put.
    front.appendChild(makeFace(dir > 0 ? from : to, 'S'));
    backInner.appendChild(Object.assign(document.createElement('div'), { className: 'face' }));
    flipLayer.append(front, back);
    if (dir > 0) paint(to);
  }
  front.querySelector('.face').style.width = W + 'px';
  front.appendChild(frontShade); back.appendChild(backShade);
  flipLayer.hidden = false;

  // The grabbed corner, and where the finger "holds" the page.
  // Curl from the bottom corner unless the page was grabbed right at the top.
  f.cy = finger && finger.y < H * 0.2 ? 0 : H;
  f.C = [W, f.cy];
  const singlePrev = !R.spread && dir < 0;
  f.start = singlePrev ? [-W, f.cy] : [W, f.cy];
  f.end = singlePrev ? [W, f.cy] : [-W, f.cy];
  f.P = [...f.start];
  f.finger0 = finger ? [f.toLocalX(finger.x), finger.y] : null;
  Object.assign(f, { front, back, frontShade, backShade });
  flip = f;
  renderFlip(f);
  return f;
}

// How far the turn has got, 0..1.
const flipProgress = (f) => clamp((f.P[0] - f.start[0]) / (f.end[0] - f.start[0]), 0, 1);

function setFlipPoint(f, x, y) {
  const { W, H, cy } = f;
  let px = Math.min(W, x), py = y;
  // The leaf is hinged at the spine, so the corner can't get further from
  // the hinge corners than the paper allows.
  const limit = (ox, oy, max) => {
    const dx = px - ox, dy = py - oy, d = Math.hypot(dx, dy);
    if (d > max) { px = ox + (dx * max) / d; py = oy + (dy * max) / d; }
  };
  limit(0, cy, W);
  limit(0, H - cy, Math.hypot(W, H));
  f.P = [px, py];
}

function flipFromFinger(f, sx, sy) {
  const lx = f.toLocalX(sx), g = sens().gain;
  // Sideways movement turns the page; up-and-down only tilts the fold a little,
  // so a swipe across the middle of the page gives a near-vertical fold.
  const dy = (sy - f.finger0[1]) * 0.25 * g;
  const py = f.cy === 0 ? clamp(f.start[1] + dy, 0, f.H * 0.35) : clamp(f.start[1] + dy, f.H * 0.65, f.H);
  setFlipPoint(f, f.start[0] + (lx - f.finger0[0]) * g, py);
}

// Clip a rectangle 0..W × 0..H to the half-plane (X - M)·n ≥ 0 (sign = 1)
// or ≤ 0 (sign = -1). Returns element-space points.
function halfPage(f, M, n, sign) {
  const { W, H } = f;
  const pts = [[0, 0], [W, 0], [W, H], [0, H]];
  const side = (pt) => sign * ((pt[0] - M[0]) * n[0] + (pt[1] - M[1]) * n[1]);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const k = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out.map(f.toEl);
}
const polygon = (pts) => (pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`);

function renderFlip(f) {
  const { W, H, C, P, front, back } = f;
  const dx = P[0] - C[0], dy = P[1] - C[1], len = Math.hypot(dx, dy);
  if (len < 1) { // nothing lifted yet
    front.style.clipPath = 'none'; back.style.clipPath = polygon([]);
    f.frontShade.style.opacity = 0; f.backShade.style.opacity = 0;
    return;
  }
  const n = [dx / len, dy / len];                    // unit normal of the fold line
  const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];  // a point on the fold line
  front.style.clipPath = polygon(halfPage(f, M, n, 1));
  back.style.clipPath = polygon(halfPage(f, M, n, -1));
  // Reflect the folded part across the fold line (in element coordinates).
  const [ex, ey] = f.toEl(M), nx = f.mirror ? -n[0] : n[0], ny = n[1];
  const k = 2 * (ex * nx + ey * ny);
  back.style.transform = `matrix(${1 - 2 * nx * nx},${-2 * nx * ny},${-2 * nx * ny},${1 - 2 * ny * ny},${k * nx},${k * ny})`;
  // Shadows: a crease along the fold on the folded part, a soft shadow on the
  // page it hangs over. Both are gradients aimed along the fold normal.
  const angle = (Math.atan2(nx, -ny) * 180) / Math.PI;
  const L = Math.abs(W * Math.sin((angle * Math.PI) / 180)) + Math.abs(H * Math.cos((angle * Math.PI) / 180));
  const pos = (ex - W / 2) * nx + (ey - H / 2) * ny + L / 2;
  const lift = Math.min(1, len / (W * 0.6));
  f.backShade.style.background = `linear-gradient(${angle}deg, rgba(0,0,0,0) ${pos - 90}px, rgba(0,0,0,${0.22 * lift}) ${pos - 4}px, rgba(0,0,0,0) ${pos}px)`;
  f.backShade.style.opacity = 1;
  f.frontShade.style.background = `linear-gradient(${angle + 180}deg, rgba(0,0,0,0) ${L - pos - 50}px, rgba(0,0,0,${0.16 * lift}) ${L - pos}px)`;
  f.frontShade.style.opacity = 1;
}

// Animate the held point to the end (commit) or back to the start (cancel).
// `speed` is px/ms along the way; the hand's own speed when it let go.
function runFlip(f, commit, speed = 0) {
  cancelAnimationFrame(f.raf);
  clearTimeout(f.watchdog);
  const target = commit ? f.end : f.start;
  const [x0, y0] = f.P, dist = Math.hypot(target[0] - x0, target[1] - y0);
  const v = speed > 0.15 ? Math.min(speed, 4) : 0.75;
  const dur = clamp(dist / v, 120, 700);
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 2.2);
    setFlipPoint(f, x0 + (target[0] - x0) * e, y0 + (target[1] - y0) * e);
    renderFlip(f);
    if (k < 1) f.raf = requestAnimationFrame(tick);
    else endFlip(f, commit);
  };
  f.raf = requestAnimationFrame(tick);
  // If animation frames stall (a throttled or embedded page), still finish the turn.
  f.watchdog = setTimeout(() => { if (flip === f) { diag.note('flip watchdog'); endFlip(f, commit); } }, dur + 400);
}

function endFlip(f, commit) {
  if (!f || flip !== f) return;
  cancelAnimationFrame(f.raf);
  clearTimeout(f.watchdog);
  clearInterval(f.holdTimer);
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
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, moved: false, id: e.pointerId, flip: null, sel: null };
  if (!$('#hlPop').hidden || $('#scrim').hidden === false) return;
  // Press and hold on a word to start selecting text.
  drag.press = setTimeout(() => { if (drag && !drag.moved) beginSelect(drag, e.clientX, e.clientY, e.pointerId); }, 450);
});
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.sel) { updateSelect(drag.sel, e.clientX, e.clientY); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 8) clearTimeout(drag.press);
  if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    drag.moved = true;
    stage.setPointerCapture(e.pointerId);
    view.classList.remove('anim-slide');
    drag.dir = dx < 0 ? 1 : -1;
    if (settings.turn === 'flip') {
      drag.flip = startFlip(drag.dir, { x: drag.x, y: drag.y });
      if (drag.flip) drag.flip.holdTimer = setInterval(() => checkHold(drag), 100);
    }
  }
  if (!drag.moved) return;
  drag.dx = dx;
  if (drag.flip) {
    const f = drag.flip;
    // The corner follows the finger; remember recent motion for the release.
    flipFromFinger(f, e.clientX, e.clientY);
    const now = performance.now();
    const last = f.samples[f.samples.length - 1];
    if (last) {
      const speed = Math.abs(e.clientX - last.x) / Math.max(1, now - last.t);
      f.slowSince = speed < 0.08 ? (f.slowSince ?? now) : null;
    }
    f.samples.push({ t: now, x: e.clientX });
    if (f.samples.length > 8) f.samples.shift();
    renderFlip(f);
  } else if (settings.turn === 'slide' || settings.turn === 'flip') {
    // Rubber-band at the ends of the book.
    const atEdge = (dx > 0 && R.page === 0) || (dx < 0 && R.page >= norm(R.pages - 1));
    view.style.transform = `translate3d(${-(R.page - R.view.base) * R.pitch + (atEdge ? dx * 0.25 : dx)}px,0,0)`;
  }
});

function tapAt(x, e) {
  lastHandled = performance.now();
  if (!$('#hlPop').hidden) { hidePop(); return; }
  const mark = e?.target?.closest?.('mark.hl') || document.elementFromPoint(x, e?.clientY ?? 0)?.closest?.('mark.hl');
  if (mark && view.contains(mark)) { openHighlight(mark.dataset.hl, mark); return; }
  const link = e?.target?.closest?.('a');
  if (link && view.contains(link)) {
    if (link.dataset.target) followLink(link);
    return; // external links open on their own
  }
  if (reader.classList.contains('chrome-on')) { reader.classList.remove('chrome-on'); return; }
  const W = stage.clientWidth, H = stage.clientHeight;
  const y = e?.clientY ?? H / 2;
  let zone;
  if (settings.tapZones === 'edges') zone = x < W * 0.25 ? 'back' : x > W * 0.75 ? 'next' : 'menu';
  else if (settings.tapZones === 'kindle') zone = y < H * 0.15 ? 'menu' : x < W * 0.2 ? 'back' : 'next';
  else zone = y < H * 0.15 ? 'menu' : x < W * 0.5 ? 'back' : 'next';
  if (settings.reverseTaps && zone !== 'menu') zone = zone === 'back' ? 'next' : 'back';
  if (zone === 'back') prev(); else if (zone === 'next') next(); else reader.classList.add('chrome-on');
}

// A slow, deliberate turn: once the page is lifted, moving slowly (or holding)
// for a full second finishes the turn on its own.
function checkHold(d) {
  const f = d.flip;
  if (!f || flip !== f) return;
  const now = performance.now();
  const last = f.samples[f.samples.length - 1];
  if (last && now - last.t > 120) f.slowSince ??= last.t; // finger resting
  if (f.slowSince !== null && now - f.slowSince >= 1000 && flipProgress(f) > sens().commit * 0.3) {
    clearInterval(f.holdTimer);
    d.flip = null; d.done = true;
    diag.note('hold flip');
    runFlip(f, true, 0.5);
  }
}

// Speed of the hand over the last ~100ms, px/ms, positive toward the turn.
function releaseSpeed(f, dir) {
  const s = f.samples, last = s[s.length - 1];
  if (!last) return 0;
  let i = s.length - 1;
  while (i > 0 && last.t - s[i - 1].t < 100) i--;
  const first = s[i];
  if (first === last) return 0;
  const sign = f.mirror || (!R.spread && dir < 0) ? 1 : -1; // which screen direction is "toward the turn"
  return (sign * (last.x - first.x)) / (last.t - first.t);
}

const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  clearTimeout(d.press);
  diag.last = `${e.pointerType} ${e.type}${d.moved ? ' swipe' : ' tap'}`;
  if (d.sel) { lastHandled = performance.now(); finishSelect(d.sel); return; }
  if (d.done) return;
  if (d.moved) {
    lastHandled = performance.now();
    const v = (d.dir * -d.dx) / Math.max(1, performance.now() - d.t);
    if (d.flip) {
      const f = d.flip;
      clearInterval(f.holdTimer);
      const u = flipProgress(f), vf = releaseSpeed(f, d.dir), held = performance.now() - d.t;
      // A flick commits, a flick back cancels; otherwise past halfway commits,
      // and a slow deliberate pull that got the page moving commits too.
      const S = sens();
      // A page that's mostly over stays over unless flicked back hard; otherwise
      // a flick forward commits, a flick back cancels, and past the threshold commits.
      const commit = u > 0.7 ? vf > -0.9
        : vf > S.flick ? true : vf < -S.flick ? false : u > S.commit || (held >= 1000 && u > S.commit * 0.3);
      diag.note(`release u=${u.toFixed(2)} v=${vf.toFixed(2)} ${commit ? 'commit' : 'cancel'}`);
      return runFlip(f, commit, Math.abs(vf));
    }
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
  else if (which === 'hlnote') $('#hlNoteSheet').hidden = false;
  else if (which === 'theme') { renderThemeList(); $('#themeSheet').hidden = false; }
  else { syncSettingsUI(); $('#setSheet').hidden = false; }
}
function closeSheets() {
  const open = !$('#scrim').hidden;
  $('#scrim').hidden = true;
  for (const id of ['#tocSheet', '#setSheet', '#noteSheet', '#themeSheet', '#hlNoteSheet']) $(id).hidden = true;
  if (themeDraft) { themeDraft = null; applySettings(); }
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
  $('#hlPane').hidden = t.dataset.tab !== 'hls';
  if (t.dataset.tab === 'hls') renderHlList();
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

/* ───────────────────────── Highlights & notes ─────────────────────────
   A highlight is { b: block index, s, e: character offsets in that block }
   plus a colour and an optional note. Marks are wrapped into the hidden
   flow, so the on-screen clones and the curl faces pick them up. */
const HL_COLORS = { yellow: '#ffd84d', green: '#8fe39b', blue: '#8ec8ff', pink: '#ffa8c8' };
let pendingSel = null, activeHl = null;

function textPieces(block, s, e) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const pieces = [];
  let off = 0, n;
  while ((n = walker.nextNode())) {
    const a = Math.max(s, off), z = Math.min(e, off + n.length);
    if (a < z) pieces.push({ node: n, from: a - off, to: z - off });
    off += n.length;
    if (off >= e) break;
  }
  return pieces;
}
function wrapHighlight(hl) {
  const block = R.blocks[hl.b];
  if (!block) return;
  for (const { node, from, to } of textPieces(block, hl.s, hl.e)) {
    let n = node;
    if (to < n.length) n.splitText(to);
    if (from > 0) n = n.splitText(from);
    const mark = document.createElement('mark');
    mark.className = 'hl' + (hl.note ? ' has-note' : '');
    mark.dataset.hl = hl.id;
    mark.style.setProperty('--hl', HL_COLORS[hl.color] || HL_COLORS.yellow);
    n.parentNode.insertBefore(mark, n);
    mark.appendChild(n);
  }
}
function unwrapHighlight(hl) {
  for (const m of $$(`mark[data-hl="${hl.id}"]`, flow)) m.replaceWith(...m.childNodes);
  R.blocks[hl.b]?.normalize();
}
function saveHls() { prefs.set(`hl:${R.book.id}`, R.hls); }
function refreshView() { R.view = null; paint(R.page); }

// Caret under a point, as (clone block, offset within that block).
function caretAt(x, y) {
  let node, offset;
  if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (!c) return null; node = c.offsetNode; offset = c.offset; }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (!r) return null; node = r.startContainer; offset = r.startOffset; }
  else return null;
  if (node.nodeType !== 3 || !view.contains(node)) return null;
  const cb = node.parentElement.closest('[data-b]');
  if (!cb) return null;
  const walker = document.createTreeWalker(cb, NodeFilter.SHOW_TEXT);
  let off = 0, n;
  while ((n = walker.nextNode())) { if (n === node) return { cb, b: +cb.dataset.b, off: off + offset }; off += n.length; }
  return null;
}
function wordBounds(text, i) {
  let s = i, e = i;
  while (s > 0 && /\S/.test(text[s - 1])) s--;
  while (e < text.length && /\S/.test(text[e])) e++;
  return [s, e];
}
function rangeInBlock(block, s, e) {
  const pieces = textPieces(block, s, e);
  if (!pieces.length) return null;
  const r = document.createRange();
  r.setStart(pieces[0].node, pieces[0].from);
  r.setEnd(pieces[pieces.length - 1].node, pieces[pieces.length - 1].to);
  return r;
}
function drawSelection(sel) {
  const layer = $('#selLayer');
  const r = sel && rangeInBlock(sel.cb, sel.s, sel.e);
  if (!r) { layer.replaceChildren(); return []; }
  const base = stage.getBoundingClientRect();
  const rects = [...r.getClientRects()];
  layer.innerHTML = rects.map((q) => `<i class="sel-rect" style="left:${q.left - base.left}px;top:${q.top - base.top}px;width:${q.width}px;height:${q.height}px"></i>`).join('');
  return rects;
}
function beginSelect(d, x, y, pointerId) {
  const c = caretAt(x, y);
  if (!c) return;
  const text = c.cb.textContent;
  const [s, e] = wordBounds(text, Math.min(c.off, text.length - 1));
  if (e <= s) return;
  d.sel = { cb: c.cb, b: c.b, text, a0: s, a1: e, s, e };
  try { stage.setPointerCapture(pointerId); } catch { /* fine */ }
  drawSelection(d.sel);
  haptic();
  diag.last = 'long-press select';
}
function updateSelect(sel, x, y) {
  const c = caretAt(x, y);
  if (!c || c.cb !== sel.cb) return;
  const [ws, we] = wordBounds(sel.text, Math.min(c.off, sel.text.length - 1));
  sel.s = Math.min(sel.a0, ws); sel.e = Math.max(sel.a1, we);
  drawSelection(sel);
}
function finishSelect(sel) {
  const rects = drawSelection(sel);
  if (!rects.length) return;
  pendingSel = { b: sel.b, s: sel.s, e: sel.e, text: sel.text.slice(sel.s, sel.e).trim() };
  activeHl = null;
  showPop(rects, false);
}
function showPop(rects, existing) {
  const pop = $('#hlPop');
  pop.hidden = false;
  $('[data-act="delete"]', pop).hidden = !existing;
  const base = stage.getBoundingClientRect();
  const first = rects[0], last = rects[rects.length - 1];
  const cx = (first.left + last.right) / 2 - base.left;
  const above = first.top - base.top > 70;
  pop.style.left = clamp(cx - pop.offsetWidth / 2, 8, base.width - pop.offsetWidth - 8) + 'px';
  pop.style.top = (above ? first.top - base.top - pop.offsetHeight - 10 : last.bottom - base.top + 10) + 'px';
}
function hidePop() {
  $('#hlPop').hidden = true;
  $('#selLayer').replaceChildren();
  pendingSel = null; activeHl = null;
}
function openHighlight(id, mark) {
  const hl = R.hls.find((h) => h.id === id);
  if (!hl) return;
  activeHl = hl; pendingSel = null;
  const rects = [...$$(`mark[data-hl="${id}"]`, view).flatMap((m) => [...m.getClientRects()])];
  showPop(rects.length ? rects : [...mark.getClientRects()], true);
}
function createHighlight(color) {
  const c = chapterAt(R.page + (R.spread ? 1 : 0));
  const hl = { id: 'h-' + Date.now().toString(36), ...pendingSel, color, note: '', chapter: c >= 0 ? R.toc[c].title : '', at: Date.now() };
  R.hls.push(hl); saveHls(); wrapHighlight(hl); refreshView();
  return hl;
}
function recolorHighlight(hl, color) { hl.color = color; saveHls(); unwrapHighlight(hl); wrapHighlight(hl); refreshView(); }
function deleteHighlight(hl) { R.hls = R.hls.filter((h) => h !== hl); saveHls(); unwrapHighlight(hl); refreshView(); }

$('#hlPop').addEventListener('click', (e) => {
  const color = e.target.closest('[data-color]')?.dataset.color;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (color) {
    if (activeHl) recolorHighlight(activeHl, color); else if (pendingSel) createHighlight(color);
    haptic(); hidePop(); toast('Highlighted');
  } else if (act === 'copy') {
    const text = activeHl ? activeHl.text : pendingSel?.text;
    navigator.clipboard?.writeText(text || '').then(() => toast('Copied'), () => toast('Couldn’t copy'));
    hidePop();
  } else if (act === 'delete') {
    if (activeHl) deleteHighlight(activeHl);
    hidePop(); toast('Highlight removed');
  } else if (act === 'note') {
    $('#hlQuote').textContent = activeHl ? activeHl.text : pendingSel?.text || '';
    $('#hlNoteText').value = activeHl?.note || '';
    $('#hlPop').hidden = true;
    openSheet('hlnote');
    $('#hlNoteText').focus();
  }
});
$('#hlNoteSave').addEventListener('click', () => {
  const note = $('#hlNoteText').value.trim();
  let hl = activeHl;
  if (!hl && pendingSel) hl = createHighlight('yellow');
  if (hl) { hl.note = note; saveHls(); unwrapHighlight(hl); wrapHighlight(hl); refreshView(); }
  closeSheets(); hidePop(); toast(note ? 'Note saved' : 'Note removed');
});

function renderHlList() {
  const list = [...R.hls].sort((a, b) => a.b - b.b || a.s - b.s);
  $('#hlCount').textContent = list.length ? `${list.length} highlight${list.length > 1 ? 's' : ''}` : '';
  $('#hlList').innerHTML = list.length
    ? list.map((h) => `<li><button data-hl-id="${h.id}" style="--hl:${HL_COLORS[h.color] || HL_COLORS.yellow}">
        ${h.chapter ? `<span class="t-kick">${esc(h.chapter)}</span>` : ''}
        <span class="t-title hl-snip">${esc(h.text)}</span>
        <span class="t-page"><span class="del" data-del-hl="${h.id}" role="button" aria-label="Delete highlight">✕</span></span>
        ${h.note ? `<span class="hl-note">${esc(h.note)}</span>` : ''}
      </button></li>`).join('')
    : '<li class="empty">No highlights yet. Press and hold a word, then drag to select; let go to choose a colour or add a note.</li>';
}
$('#hlList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-hl]')?.dataset.delHl;
  if (del) { const hl = R.hls.find((h) => h.id === del); if (hl) deleteHighlight(hl); renderHlList(); return; }
  const id = e.target.closest('[data-hl-id]')?.dataset.hlId;
  const hl = id && R.hls.find((h) => h.id === id);
  if (!hl) return;
  closeSheets(); reader.classList.remove('chrome-on');
  jumpTo(R.blocks[hl.b]);
});
$('#hlCopyAll').addEventListener('click', () => {
  const text = [...R.hls].sort((a, b) => a.b - b.b || a.s - b.s)
    .map((h) => `“${h.text}”${h.chapter ? ` — ${h.chapter}` : ''}${h.note ? `\n  Note: ${h.note}` : ''}`).join('\n\n');
  navigator.clipboard?.writeText(`${R.book.title}\n\n${text}`).then(() => toast('All highlights copied'), () => toast('Couldn’t copy'));
});

/* ───────────────────────── Reading stats ─────────────────────────
   Time is counted while a book is open, the app is visible and a page has
   been turned in the last five minutes. */
let stats = prefs.get('stats', { days: {}, books: {}, goal: 20 });
let tickAt = null;
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayRec = (k) => (stats.days[k] ??= { ms: 0, pages: 0 });
const bookRec = (id) => (stats.books[id] ??= { ms: 0, pages: 0 });
const readingActive = () => !!R.book && !reader.hidden && document.visibilityState === 'visible' && Date.now() - lastTurnAt < 5 * 60 * 1000;
function statsTick(active = readingActive()) {
  const now = Date.now();
  if (tickAt && active && R.book) {
    const dt = Math.min(now - tickAt, 60000);
    dayRec(dayKey()).ms += dt; bookRec(R.book.id).ms += dt;
    prefs.set('stats', stats);
  }
  tickAt = active ? now : null;
}
function statsTurn(pages) {
  if (!R.book) return;
  statsTick(true);
  dayRec(dayKey()).pages += pages; bookRec(R.book.id).pages += pages;
}
function statsFinished(id, title) {
  const b = bookRec(id);
  if (b.finishedAt) return;
  b.finishedAt = Date.now(); prefs.set('stats', stats);
  toast(`You finished “${title}”`, 3000);
}
setInterval(() => statsTick(), 15000);
document.addEventListener('visibilitychange', () => statsTick(document.visibilityState === 'visible' && readingActive()));

const fmtTime = (ms) => { const m = Math.round(ms / 60000); if (ms > 0 && m === 0) return 'under a minute'; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad2(m % 60)}`; };
function streak() {
  let n = 0; const d = new Date();
  if (!((stats.days[dayKey(d)]?.ms || 0) >= 60000)) d.setDate(d.getDate() - 1);
  while ((stats.days[dayKey(d)]?.ms || 0) >= 60000) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function lastDays(n) {
  const out = []; const d = new Date(); d.setDate(d.getDate() - n + 1);
  for (let i = 0; i < n; i++, d.setDate(d.getDate() + 1)) out.push({ key: dayKey(d), label: 'SMTWTFS'[d.getDay()], ms: stats.days[dayKey(d)]?.ms || 0 });
  return out;
}
function ringSvg(frac, size, label) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="8"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp(frac, 0, 1))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${label ? `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="currentColor" font-size="${size * 0.2}" font-weight="600">${label}</text>` : ''}
  </svg>`;
}
function renderStatsStrip() {
  const strip = $('#statsStrip');
  const todayMs = stats.days[dayKey()]?.ms || 0, goalMs = stats.goal * 60000;
  const any = Object.keys(stats.days).length > 0;
  strip.hidden = !any;
  if (!any) return;
  const sk = streak();
  strip.innerHTML = `<button class="stats-card" id="statsOpen">
    ${ringSvg(todayMs / goalMs, 56, Math.round(todayMs / 60000))}
    <div class="stats-text"><b>${fmtTime(todayMs)} today</b><span>Goal ${stats.goal} min · ${sk ? `${sk}-day streak` : 'Start a streak today'}</span></div>
    <span class="stats-more">Stats ›</span>
  </button>`;
}
$('#statsStrip').addEventListener('click', (e) => { if (e.target.closest('#statsOpen')) openStats(); });
async function openStats() {
  const books = await shelf.all().catch(() => []);
  const titles = Object.fromEntries(books.map((b) => [b.id, splitTitle(b.title)[0]]));
  const todayMs = stats.days[dayKey()]?.ms || 0, goalMs = stats.goal * 60000;
  const week = lastDays(7), max = Math.max(goalMs, ...week.map((d) => d.ms));
  const totalMs = Object.values(stats.days).reduce((a, d) => a + d.ms, 0);
  const totalPages = Object.values(stats.days).reduce((a, d) => a + d.pages, 0);
  const finished = Object.values(stats.books).filter((b) => b.finishedAt).length;
  const perBook = Object.entries(stats.books).filter(([id]) => titles[id]).sort((a, b) => b[1].ms - a[1].ms);
  $('#statsBody').innerHTML = `
    <section class="stats-hero">
      ${ringSvg(todayMs / goalMs, 150, `${Math.round(todayMs / 60000)}`)}
      <div>
        <div class="eyebrow">Today</div>
        <h2>${fmtTime(todayMs)} <small>of ${stats.goal} min</small></h2>
        <div class="goal-row"><span>Daily goal</span><button class="pill" data-goal="-5" aria-label="Lower goal">−</button><b>${stats.goal} min</b><button class="pill" data-goal="5" aria-label="Raise goal">+</button></div>
      </div>
    </section>
    <section class="stats-tiles">
      <div class="tile-stat"><b>${streak()}</b><span>day streak</span></div>
      <div class="tile-stat"><b>${fmtTime(totalMs)}</b><span>all time</span></div>
      <div class="tile-stat"><b>${totalPages}</b><span>pages turned</span></div>
      <div class="tile-stat"><b>${finished}</b><span>books finished</span></div>
      <div class="tile-stat"><b>${settings.wpm}</b><span>words / min</span></div>
    </section>
    <section>
      <h3 class="sec-title">This week</h3>
      <div class="week">${week.map((d) => `<div class="day ${d.key === dayKey() ? 'today' : ''}"><i style="height:${Math.max(4, (d.ms / max) * 100)}%"></i><span>${d.label}</span></div>`).join('')}</div>
      <div class="week-goal" style="bottom:${(goalMs / max) * 100}%"></div>
    </section>
    <section>
      <h3 class="sec-title">By book</h3>
      ${perBook.length ? perBook.map(([id, b]) => `<div class="book-stat"><span class="book-stat-title">${esc(titles[id])}${b.finishedAt ? ' <em>finished</em>' : ''}</span><span>${fmtTime(b.ms)} · ${b.pages} pages</span></div>`).join('') : '<p class="stats-empty">Nothing read yet.</p>'}
    </section>`;
  $('#statsView').hidden = false;
}
$('#statsBack').addEventListener('click', () => { $('#statsView').hidden = true; renderStatsStrip(); });
$('#statsBody').addEventListener('click', (e) => {
  const g = e.target.closest('[data-goal]')?.dataset.goal;
  if (!g) return;
  stats.goal = clamp(stats.goal + +g, 5, 180); prefs.set('stats', stats); openStats();
});

/* ───────────────────────── Settings ───────────────────────── */
function themeById(id) { return THEMES[id] || customThemes.find((t) => t.id === id) || THEMES.paper; }
// The theme in force: a per-book choice wins over the global one.
function currentThemeId() { return (R.book && bookThemes[R.book.id]) || settings.theme; }

function applySettings() {
  const id = currentThemeId();
  const t = themeDraft || themeById(id);
  const builtIn = !themeDraft && THEMES[id];
  reader.dataset.theme = builtIn ? id : 'custom';
  reader.dataset.grain = t.grain ? '1' : '0';
  const s = reader.style;
  for (const k of ['paper', 'ink', 'accent']) { if (builtIn) s.removeProperty('--' + k); else s.setProperty('--' + k, t[k]); }
  for (const k of ['align', 'para']) reader.dataset[k] = settings[k];
  for (const k of ['hyphens', 'dropCaps', 'runHeads', 'folios', 'footers', 'spine', 'edges']) reader.dataset[k.toLowerCase()] = settings[k] ? '1' : '0';
  ensureFont(settings.fontFamily);
  s.setProperty('--book-font', (FONTS[settings.fontFamily] || FONTS.literata).css);
  // Night light
  $('#dim').style.opacity = (1 - settings.brightness / 100).toFixed(2);
  $('#warm').style.opacity = (settings.warmth / 100).toFixed(2);
  // Library colours
  const lib = $('#library');
  document.body.dataset.lib = settings.libraryTheme ? 'theme' : 'sky';
  const lt = themeById(settings.theme);
  for (const [k, v] of Object.entries({ paper: lt.paper, ink: lt.ink, accent: lt.accent })) lib.style.setProperty('--lt-' + k, settings.libraryTheme ? v : '');
  setThemeColor(reader.hidden ? (settings.libraryTheme ? lt.paper : '#0b1230') : t.paper);
}
function setThemeColor(c) { $('meta[name="theme-color"]').setAttribute('content', c); }

function swatchHtml(id, t, cls = '') {
  return `<button data-val="${id}" class="sw ${cls}" style="background:radial-gradient(circle at 50% 70%, ${t.accent}, ${t.paper} 58%)" aria-label="${esc(t.name)}" title="${esc(t.name)}"></button>`;
}
function renderSwatches() {
  $('#themeSwatches').innerHTML = Object.entries(THEMES).map(([id, t]) => swatchHtml(id, t)).join('') + customThemes.map((t) => swatchHtml(t.id, t, 'custom')).join('');
}

const TAP_HELP = {
  edges: 'Tap the left or right quarter of the screen to turn; tap the middle for the menu.',
  kindle: 'Tap almost anywhere to go forward; the left strip goes back; the top strip opens the menu.',
  halves: 'Left half goes back, right half goes forward; the top strip opens the menu.',
};
function syncSettingsUI() {
  $('#diag').textContent = diag.text();
  $('#fontOut').textContent = Math.round(settings.fontScale * 100) + '%';
  renderSwatches();
  if (!$('#fontChips').children.length) {
    Object.keys(FONTS).forEach(ensureFont);
    $('#fontChips').innerHTML = Object.entries(FONTS).map(([id, f]) => `<button data-val="${id}" style="font-family:${f.css}">${f.name}</button>`).join('');
  }
  const themeId = currentThemeId();
  $$('#setSheet [data-group]').forEach((g) => $$('[data-val]', g).forEach((b) => b.classList.toggle('active', b.dataset.val === (g.dataset.group === 'theme' ? themeId : settings[g.dataset.group]))));
  $$('#setSheet [data-setting]').forEach((el) => { if (el.type === 'checkbox') el.checked = !!settings[el.dataset.setting]; else el.value = settings[el.dataset.setting]; });
  $('#bookThemeChk').checked = !!(R.book && bookThemes[R.book.id]);
  $('#bookThemeChk').disabled = !R.book;
  $('#tapHelp').textContent = TAP_HELP[settings.tapZones];
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
  if (group === 'theme' && R.book && $('#bookThemeChk').checked) {
    bookThemes[R.book.id] = val.dataset.val;
    prefs.set('bookThemes', bookThemes);
    return saveSettings(false);
  }
  settings[group] = val.dataset.val;
  saveSettings(['theme', 'turn', 'tapZones'].includes(group) ? false : true);
});
// Checkboxes and sliders: data-setting names the key, data-relay="1" means the text reflows.
const AFTER = {
  wake: updateWakeLock,
  haptics: () => haptic(),
  immersive: () => { if (settings.immersive) enterFullscreen(); else if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); },
};
$('#setSheet').addEventListener('input', (e) => {
  const key = e.target.dataset.setting;
  if (!key) return;
  settings[key] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
  saveSettings(e.target.dataset.relay === '1');
  AFTER[key]?.();
});
$('#bookThemeChk').addEventListener('change', (e) => {
  if (!R.book) return;
  if (e.target.checked) bookThemes[R.book.id] = currentThemeId();
  else delete bookThemes[R.book.id];
  prefs.set('bookThemes', bookThemes);
  saveSettings(false);
});
$('#resetBtn').addEventListener('click', () => {
  const keep = { wpm: settings.wpm };
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, DEFAULTS, keep);
  saveSettings(true);
  toast('Settings reset');
});
$('#editThemesBtn').addEventListener('click', () => openSheet('theme'));

/* Full screen: the browser only allows it in response to a tap, so when the
   setting is on we ask on the next tap anywhere (and again after the system
   brings the bars back). */
function enterFullscreen() {
  if (!settings.immersive || document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
document.addEventListener('pointerup', () => enterFullscreen(), { capture: true });
document.addEventListener('keyup', () => enterFullscreen(), { capture: true });

/* Theme editor ----------------------------------------------------------- */
let themeDraft = null;
const thEl = (id) => $('#' + id);
function renderThemeList() {
  const list = $('#themeList');
  list.innerHTML = customThemes.map((t) => `<div class="theme-item">
      ${swatchHtml(t.id, t)}<span class="theme-name">${esc(t.name)}</span>
      <button class="pill" data-edit="${t.id}">Edit</button>
    </div>`).join('') + `<div class="theme-item"><button class="btn small" id="thNew">New theme</button></div>`;
  $('#themeForm').hidden = true;
}
function fillThemeForm(t) {
  thEl('thName').value = t.name || '';
  thEl('thPaper').value = t.paper; thEl('thInk').value = t.ink; thEl('thAccent').value = t.accent;
  thEl('thGrain').checked = !!t.grain;
  previewTheme();
}
function previewTheme() {
  themeDraft = { name: thEl('thName').value.trim(), paper: thEl('thPaper').value, ink: thEl('thInk').value, accent: thEl('thAccent').value, grain: thEl('thGrain').checked };
  for (const k of ['Paper', 'Ink', 'Accent']) thEl('th' + k + 'Hex').textContent = thEl('th' + k).value;
  applySettings();
}
$('#themeList').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]')?.dataset.edit;
  const isNew = e.target.closest('#thNew');
  if (!edit && !isNew) return;
  const t = edit ? customThemes.find((x) => x.id === edit) : { ...themeById(currentThemeId()), name: '' };
  thEl('thId').value = edit || '';
  thEl('thDelete').hidden = !edit;
  $('#themeList').hidden = true;
  $('#themeForm').hidden = false;
  fillThemeForm(t);
  thEl('thName').focus();
});
$('#thPresets').addEventListener('click', (e) => {
  const id = e.target.closest('[data-preset]')?.dataset.preset;
  if (id) fillThemeForm({ ...THEMES[id], name: thEl('thName').value });
});
for (const id of ['thPaper', 'thInk', 'thAccent', 'thGrain']) thEl(id).addEventListener('input', previewTheme);
$('#themeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  previewTheme();
  const id = thEl('thId').value || 't-' + Date.now().toString(36);
  const t = { ...themeDraft, id, name: themeDraft.name || 'My theme' };
  const i = customThemes.findIndex((x) => x.id === id);
  if (i >= 0) customThemes[i] = t; else customThemes.push(t);
  prefs.set('themes', customThemes);
  themeDraft = null;
  if (R.book && bookThemes[R.book.id]) { bookThemes[R.book.id] = id; prefs.set('bookThemes', bookThemes); } else settings.theme = id;
  saveSettings(false);
  toast(`Theme “${t.name}” saved`);
  $('#themeForm').hidden = true; $('#themeList').hidden = false; renderThemeList();
});
$('#thCancel').addEventListener('click', () => { themeDraft = null; applySettings(); $('#themeForm').hidden = true; $('#themeList').hidden = false; });
$('#thDelete').addEventListener('click', () => {
  const id = thEl('thId').value;
  customThemes = customThemes.filter((x) => x.id !== id);
  prefs.set('themes', customThemes);
  if (settings.theme === id) settings.theme = 'paper';
  for (const b of Object.keys(bookThemes)) if (bookThemes[b] === id) delete bookThemes[b];
  prefs.set('bookThemes', bookThemes);
  themeDraft = null;
  saveSettings(false);
  $('#themeForm').hidden = true; $('#themeList').hidden = false; renderThemeList();
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
