// EPUB support with no dependencies: a small ZIP reader (the browser's
// DecompressionStream does the inflating), OPF/nav parsing, and a sanitizer
// that turns each spine document into clean HTML for the paginated flow.

/* ───────────── ZIP ───────────── */
async function openZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file isn’t an EPUB (it isn’t a valid zip archive).');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count && dv.getUint32(off, true) === 0x02014b50; n++) {
    const nameLen = dv.getUint16(off + 28, true);
    entries.set(utf8.decode(buf.subarray(off + 46, off + 46 + nameLen)), {
      method: dv.getUint16(off + 10, true),
      size: dv.getUint32(off + 20, true),
      local: dv.getUint32(off + 42, true),
    });
    off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
  }
  const lower = new Map([...entries.keys()].map((k) => [k.toLowerCase(), k]));
  const find = (p) => entries.get(p) || entries.get(lower.get(p.toLowerCase()));

  async function bytes(path) {
    const e = find(path);
    if (!e) return null;
    const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const data = buf.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error('This EPUB uses an unsupported compression method.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {
    bytes,
    text: async (p) => { const b = await bytes(p); return b ? utf8.decode(b) : null; },
    blob: async (p, type) => { const b = await bytes(p); return b ? new Blob([b], { type }) : null; },
  };
}

/* ───────────── Package ───────────── */
function resolvePath(base, href) {
  let clean = href.split('#')[0];
  try { clean = decodeURIComponent(clean); } catch { /* keep as is */ }
  if (!clean) return base;
  const parts = clean.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function parseMarkup(src) {
  let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(src, 'text/html');
  return doc;
}
const parseXml = (src) => new DOMParser().parseFromString(src || '', 'application/xml');
const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
const tag = (node, name) => node.getElementsByTagNameNS('*', name)[0] || null;
const kids = (node, name) => [...node.children].filter((c) => c.localName === name);
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };

async function readPackage(zip) {
  const container = await zip.text('META-INF/container.xml');
  if (!container) throw new Error('This file isn’t an EPUB (META-INF/container.xml is missing).');
  const opfPath = tag(parseXml(container), 'rootfile')?.getAttribute('full-path');
  const opfText = opfPath && (await zip.text(opfPath));
  if (!opfText) throw new Error('This EPUB is missing its package file.');
  const opf = parseXml(opfText);
  const meta = tag(opf, 'metadata') || opf;
  const dc = (n) => tag(meta, n)?.textContent.trim().replace(/\s+/g, ' ') || '';

  const manifest = new Map();
  for (const it of tags(opf, 'item')) {
    manifest.set(it.getAttribute('id'), {
      href: resolvePath(opfPath, it.getAttribute('href') || ''),
      type: it.getAttribute('media-type') || '',
      props: it.getAttribute('properties') || '',
    });
  }
  const items = [...manifest.values()];
  const spineEl = tag(opf, 'spine');
  const spine = tags(opf, 'itemref')
    .map((r) => manifest.get(r.getAttribute('idref')))
    .filter((it) => it && /html|xml/.test(it.type));

  let cover = items.find((i) => /\bcover-image\b/.test(i.props));
  if (!cover) {
    const id = tags(meta, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    cover = id && manifest.get(id);
  }
  if (!cover) cover = [...manifest.entries()].find(([id, i]) => /cover/i.test(id + i.href) && i.type.startsWith('image/'))?.[1];

  return {
    title: dc('title') || 'Untitled',
    author: tags(meta, 'creator').map((c) => c.textContent.trim()).filter(Boolean).join(', '),
    description: dc('description').replace(/<[^>]+>/g, ''),
    language: dc('language') || 'en',
    manifest, spine, cover,
    nav: items.find((i) => /\bnav\b/.test(i.props)),
    ncx: manifest.get(spineEl?.getAttribute('toc')) || items.find((i) => i.type === 'application/x-dtbncx+xml'),
  };
}

async function readToc(zip, pkg) {
  const out = [];
  if (pkg.nav) {
    const doc = parseMarkup((await zip.text(pkg.nav.href)) || '');
    const navs = tags(doc, 'nav');
    const typeOf = (n) => n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || n.getAttribute('epub:type') || '';
    const nav = navs.find((n) => typeOf(n).includes('toc')) || navs[0];
    const walk = (ol, depth) => {
      for (const li of kids(ol, 'li')) {
        const a = kids(li, 'a')[0];
        const href = a?.getAttribute('href');
        if (href) out.push({ title: a.textContent.trim().replace(/\s+/g, ' '), path: resolvePath(pkg.nav.href, href), frag: href.split('#')[1] || '', depth });
        const sub = kids(li, 'ol')[0];
        if (sub) walk(sub, depth + 1);
      }
    };
    const ol = nav && tag(nav, 'ol');
    if (ol) walk(ol, 0);
  }
  if (!out.length && pkg.ncx) {
    const doc = parseXml(await zip.text(pkg.ncx.href));
    const walk = (parent, depth) => {
      for (const np of kids(parent, 'navPoint')) {
        const src = tag(np, 'content')?.getAttribute('src');
        if (src) out.push({ title: tag(np, 'text')?.textContent.trim() || '', path: resolvePath(pkg.ncx.href, src), frag: src.split('#')[1] || '', depth });
        walk(np, depth + 1);
      }
    };
    const map = tag(doc, 'navMap');
    if (map) walk(map, 0);
  }
  return out;
}

/* ───────────── Sanitizing ───────────── */
const DROP = new Set(['script', 'style', 'link', 'meta', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'select', 'textarea', 'audio', 'video', 'canvas', 'noscript', 'head', 'title', 'base', 'template']);
const KEEP = { a: ['href'], img: ['src', 'alt'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ol: ['start'] };
const XLINK = 'http://www.w3.org/1999/xlink';

async function cleanDocument(zip, path, index, pkg, images) {
  const src = await zip.text(path);
  if (!src) return '';
  const doc = parseMarkup(src);
  const body = doc.body || tag(doc, 'body');
  if (!body) return '';
  // Clean inside the parsed (inert) document so nothing loads, then import.
  const secIndex = index.get(path);

  const imageUrl = async (ref) => {
    const p = resolvePath(path, ref);
    if (!images.has(p)) {
      const type = IMAGE_TYPES[p.split('.').pop().toLowerCase()] || 'image/*';
      const blob = await zip.blob(p, type);
      images.set(p, blob ? URL.createObjectURL(blob) : '');
    }
    return images.get(p);
  };

  for (const el of [...body.querySelectorAll('*')]) {
    if (!body.contains(el)) continue; // removed along with an earlier parent
    const name = el.localName.toLowerCase();
    if (DROP.has(name)) { el.remove(); continue; }
    if (name === 'svg') {
      // Cover pages often wrap a single <image> in an SVG; turn it into an <img>.
      const image = tag(el, 'image');
      if (image) {
        const img = doc.createElementNS('http://www.w3.org/1999/xhtml', 'img');
        img.src = await imageUrl(image.getAttributeNS(XLINK, 'href') || image.getAttribute('href') || '');
        el.replaceWith(img);
      } else el.remove();
      continue;
    }
    const keep = KEEP[name] || [];
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      if (n === 'id') { el.id = `s${secIndex}-${attr.value}`; continue; }
      if (n === 'class') {
        // Only Spread's own styling hooks survive; publisher classes are ignored.
        const own = attr.value.split(/\s+/).filter((c) => c.startsWith('sb-'));
        if (own.length) el.setAttribute('class', own.join(' ')); else el.removeAttribute('class');
        continue;
      }
      if (n.endsWith(':type') && /noteref/.test(attr.value)) { el.setAttribute('data-noteref', ''); el.removeAttribute(attr.name); continue; }
      if (!keep.includes(n)) el.removeAttribute(attr.name);
    }
    if (name === 'img') {
      const s = el.getAttribute('src');
      if (s && !/^data:/.test(s)) el.src = await imageUrl(s);
    } else if (name === 'a') {
      const href = el.getAttribute('href') || '';
      if (/^(https?|mailto):/i.test(href)) {
        el.target = '_blank'; el.rel = 'noopener';
      } else {
        el.removeAttribute('href');
        const target = resolvePath(path, href);
        const frag = href.split('#')[1];
        if (index.has(target)) el.dataset.target = frag ? `s${index.get(target)}-${frag}` : `s-${index.get(target)}`;
      }
    }
  }
  const root = document.createElement('div');
  for (const n of [...body.childNodes]) root.appendChild(document.importNode(n, true));
  return root.innerHTML;
}

/* ───────────── Public API ───────────── */

// Quick look for the library: title, author, description and cover.
export async function readEpubInfo(blob) {
  const zip = await openZip(blob);
  const pkg = await readPackage(zip);
  const cover = pkg.cover ? await zip.blob(pkg.cover.href, pkg.cover.type) : null;
  return { title: pkg.title, author: pkg.author, description: pkg.description, cover };
}

// Full parse for reading. Returns HTML sections, a TOC whose targets are
// element ids inside those sections, and object URLs to revoke later.
export async function loadEpub(blob) {
  const zip = await openZip(blob);
  const pkg = await readPackage(zip);
  const index = new Map(pkg.spine.map((it, i) => [it.href, i]));
  const images = new Map();
  const sections = [];
  for (const it of pkg.spine) sections.push(await cleanDocument(zip, it.href, index, pkg, images));
  const toc = (await readToc(zip, pkg))
    .filter((t) => t.title && index.has(t.path))
    .map((t) => ({ title: t.title, depth: t.depth, target: t.frag ? `s${index.get(t.path)}-${t.frag}` : `s-${index.get(t.path)}` }));
  return { title: pkg.title, author: pkg.author, language: pkg.language, sections, toc, urls: [...images.values()].filter(Boolean) };
}
