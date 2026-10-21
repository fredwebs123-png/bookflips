# Kingdom Hearts: A Journey of Light & Darkness

An unofficial fan companion to the Kingdom Hearts series, written as a book and published as an EPUB. Seventeen chapters: how the series began, a chapter for every game from the 2002 original to Kingdom Hearts IV, then the characters, the worlds, the music, the themes, a chronological timeline and a glossary.

Read it in any EPUB reader. It is laid out for [Spread](https://github.com/fredwebs123-png/designer-fun/tree/main/book-app), a reader built for foldable phones, where it gets its own chapter openers, drop caps, pull quotes and sidebars.

## Download

Every push to `main` builds the EPUB and publishes it on this repository's GitHub Pages site, with a download link. You can also build it yourself:

```sh
./build.sh          # writes dist/kingdom-hearts-companion.epub
```

(Needs `zip`.)

## Editing the book

The book lives in `book/` in standard EPUB layout:

```
book/
  mimetype
  META-INF/container.xml
  OEBPS/
    content.opf        title, author, chapter order
    nav.xhtml          table of contents
    style.css          plain styling for other readers
    images/cover.jpg
    text/              one XHTML file per chapter
```

To edit a chapter, open its file in `book/OEBPS/text/`. Each chapter is plain XHTML: `<p>` for paragraphs, `<h3>` for section headings. A few classes give extra treatment in Spread and sensible fallbacks elsewhere:

| Class | Use |
| --- | --- |
| `sb-ch-open` (header) with `sb-kicker`, `sb-title`, `sb-sub` | chapter opener |
| `sb-pull` (blockquote) | pull quote |
| `sb-note` (aside) with `sb-note-title` | sidebar box |
| `sb-timeline` (ol) | timeline list |
| `sb-glossary` (dl) | glossary |

To add a chapter: create `text/chNN.xhtml`, add an `<item>` to the manifest and an `<itemref>` to the spine in `content.opf`, and add it to `nav.xhtml`.

Files must be well-formed XML: close every tag, and write `&amp;` for `&`.

## Rights

This is a non-commercial fan work. Kingdom Hearts and all related characters, worlds, names and music are the property of Disney and Square Enix. This book is not affiliated with, endorsed by or sponsored by either company. The text of the book is the author's own. Quotations from the games are brief and used for commentary.
