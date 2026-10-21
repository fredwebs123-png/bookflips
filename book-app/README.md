# Spread Books

A book-reader web app built for the **Galaxy Z Fold 7**: open the phone and you get a real two-page spread with a spine down the fold; close it and the same book reflows to one page on the cover screen, keeping you on the same sentence.

First book: **Kingdom Hearts: A Journey of Light & Darkness**, an unofficial fan companion covering the whole saga (17 chapters, from the 2002 original to Kingdom Hearts IV, plus characters, worlds, music, a timeline and a glossary).

## Features

- **Auto spread / single page.** Spread when the screen is wide and close to square (the Fold's inner display), single page otherwise. Can be forced in settings.
- **Fold-aware.** Re-paginates on fold/unfold/rotate and resumes at the exact character you were reading. Uses the Viewport Segments API to line the spine up with a hinge on devices that report one.
- **Book typography.** Justified Literata text, drop caps, chapter openers, running heads, page numbers, pull quotes and sidebars.
- **Reading controls.** Swipe or tap the edges to turn pages; tap the middle for contents, bookmarks, a page scrubber and settings (text size, typeface, line spacing, four themes including a "Dive to the Heart" night theme, page-turn style, keep-screen-on, full screen).
- **Installable + offline.** A PWA with a service worker; add it to your home screen from Chrome.

## Run it

No build step. Serve the folder and open it:

```sh
npx http-server book-app -p 8080
```

To put it on your phone, enable GitHub Pages for this repo (**Settings → Pages → Source: GitHub Actions**). The workflow in `.github/workflows/pages.yml` deploys `book-app/` on every push to `main`. Then open the Pages URL in Chrome on the Fold and choose **Add to home screen**.

## Add a book

Create `book-app/books/<id>.js` exporting `{ id, title, subtitle, author, edition, blurb, theme, chapters: [{ kicker, title, sub, html }] }` (see `kingdom-hearts.js`), list it in `book-app/books/index.js`, and add the file to `SHELL` in `book-app/sw.js` (bump `VERSION`).

---

Kingdom Hearts and related characters, worlds and music are the property of Disney and Square Enix. This is a non-commercial fan project and is not affiliated with or endorsed by either company.
