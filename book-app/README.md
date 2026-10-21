# Spread Books

An EPUB reader built for the **Galaxy Z Fold 7**: open the phone and you get a real two-page spread with a spine down the fold; close it and the book reflows to one page on the cover screen, keeping you on the same sentence.

The app contains no book content. Books are standard EPUB files that you import. (The first book made for it, an unofficial Kingdom Hearts companion, lives in its own repository: [kingdom-hearts-companion](https://github.com/fredwebs123-png/kingdom-hearts-companion).)

## Features

- **Two-page spreads** on the open Fold, single page on the cover screen, re-paginated on fold/unfold/rotate without losing your place. Uses the Viewport Segments API to align the spine with a hinge where one is reported.
- **Page flip** that follows your finger (or Slide, Fade, Instant), with page-edge thickness, paper texture and a light haptic tick.
- **Import any DRM-free EPUB** with the Import button or drag and drop. Once installed on Android, you can also **Share → Spread** from the Files app.
- **Kindle-style reading:** "min left in chapter" that learns your reading speed, % read, contents, bookmarks, footnote pop-ups, a page scrubber.
- **Reading settings:** text size, Literata or Inter, line spacing, layout, four themes, keep screen on, full screen.
- **Offline-ready PWA.** Books are stored in IndexedDB on the device.

## Run it

No build step. Serve the folder and open it:

```sh
npx http-server book-app -p 8080
```

To use it on your phone, enable GitHub Pages for this repo (**Settings → Pages → Source: GitHub Actions**). The workflow in `.github/workflows/pages.yml` deploys `book-app/` on every push to `main`. Open the Pages URL in Chrome on the Fold and choose **Add to home screen**.

## Bundling a book

`catalog.json` lists EPUBs that ship with the app and are copied into the library on first launch (`{ "id", "file", "version", "featured" }`). It is empty by default. If you add one, also add the file to `SHELL` in `sw.js` so it works offline.

---

Spread is an EPUB reader and contains no copyrighted book content.
