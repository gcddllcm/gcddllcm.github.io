# Penguin Logistics

## Releasing

    python tools/release.py X.Y.Z

Sets the version everywhere, then warns if the newest entry in `RELEASES` (js/locales/en.js) does not match.

## Publishing

The GitHub Pages workflow runs these steps before every deployment (a failing test stops the deploy):

1. `sh tests/run-all.sh` runs all checks.
2. `tools/update_project_line_count.py` counts every Unicode character (including whitespace and line endings), lines, and files in UTF-8 text files (excluding binary files, `.git`, and generated dependency/build folders) and updates all three About Us statistics.
3. `tools/cache_bust.py <commit SHA>` replaces every `?v=...` reference (index.html, js/, js/locales/) with the commit SHA, so a browser never mixes new and old cached files after a deploy.

Set the repository's Pages source to **GitHub Actions** for the workflow to publish the site.
`python tools/release.py X.Y.Z` still sets the readable version for local use; the SHA stamp is applied only to the deployed copy.

## Tests

    sh tests/run-all.sh

Checks the syntax of every script, the image helpers (`js/imgcore.js`) and the Notebook to PDF worker (`js/pdfworker.js`).
Everything runs on Node only; no extra packages are needed.

## Tool taglines

Tool names and taglines are kept in `js/locales/en.js` under the keys below. They are reference copy and are not displayed in the workspace.

| Tool | Tagline key | English tagline |
|---|---|---|
| File Creator | `creator.sub` | Turn images into a SMART Notebook, one image per page |
| Convert to PDF | `pdf.sub` | One PDF per .notebook file |
| PDF to JPG | `pdfToJpg.sub` | Preview PDF pages and export selected pages as JPG |
| PDF image extraction mode | `pdfToJpg.imagesSub` | Extract embedded images from one PDF and download them as PNG files. |
| PDF QR Detector | `pdfQrDetector.sub` | Find QR codes in PDF images and list their pages. |
| Notebook to JPG | `jpg.sub` | Preview every page in your SMART Notebook and export selected pages as JPG |
| Page Locker | `pagelock.sub` | Lock or unlock every image on every page |
| Image Resizer | `resizer.sub` | Resize images and 'TRULY' set DPI in bulk |
| Canvas Extractor | `learncraft.sub` | Read Master Canvas tabs and extract some data from it. |
| Ultimate Go Live | `golive.sub` | Takes courses to Ready: it approves the Master Canvas, then updates every variant you selected. |
| Timestamp Maker | `timestampMaker.sub` | Fill Page and Problem number for assets in an open Master Canvas. |

## Ultimate Go Live

Code: `js/golive.js` (page), `js/glcore.js` (progress helpers, tested in Node), `extension/background.js` (`runGoLive` / `lcGoLiveStep`).

- Canvas Extractor, Timestamp Maker, and Ultimate Go Live show a device notice on phones and tablets; desktop and laptop browsers remain available, including narrow windows and touch-screen computers.
- The page asks the extension to run a Master Canvas tab to Ready; the extension never clicks Go live, Reject, Cancel or Go to Edit.
- Progress events: a step (`round`, `queue`, `code`, `did`, `state`), `{event: 'variants', codes}` and `{event: 'variant-done', code, ok, message}`.
- A failed look at a page is retried with `observe: true`, which looks but never clicks.
- Changing the extension's behaviour or assets? Bump `extension/manifest.json`, `EXT_MIN` in `js/golive.js`, `js/learncraft.js`, and `js/timestamp-maker.js` together (tests check they agree).

## Images

- Active site and extension images live in `assets/images/`.
- Use `js/assets.js` for image URLs in JavaScript. It also maps the shared logo into the extension ZIP at the path specified by `extension/manifest.json`, so the source image is stored only once.
- Previous branding assets are kept in `assets/archive/branding/` for future reuse.

## Timestamp Maker

The LearnCraft tool shows the Master Canvas hierarchy and all detected assets, including empty sections and subsections. When video preview paths include their recording date, the date filter lists recording days with video counts; click one day or month to filter, or Ctrl-click to add or remove dates, and matching course sections stay visible. Videos with a recognized preview path have a Preview button that opens the full recording in a modal; playback is loaded only when requested. In the modal, Ctrl-scroll zooms up to 3x and dragging the zoomed video pans it. Page no. and Pb no. can be entered for video assets only when a timestamp has not already been filled; values are prefilled from matching `หน้า` / `หน้าที่` and `ข้อ` / `ข้อที่` text in asset titles. Paste newline-separated values into either field to fill that field down the visible asset rows, or paste tab-separated Page/Pb columns into either field to fill both columns from that asset row onward. Select the assets to fill with their checkboxes. Filling shows per-asset progress and switches to the Master Canvas tab while applying values. If LearnCraft shows an error dialog with a Refresh button during timestamp entry, the tool presses Refresh and resumes waiting for the current step. Selected assets in the same subsection are added to one timestamp dialog and saved together; the tool waits until every asset in that subsection shows a filled timestamp before continuing. Assets outside subsections are handled individually. Use Stop to end a run after the current asset group has been saved and verified. When all selected assets have been processed, the browser always returns to the tool tab and scrolls the final result into view. The Master Canvas itself is not saved. Review the course and save it in LearnCraft when finished. The browser extension must be updated along with `EXT_MIN` in `js/learncraft.js`, `js/golive.js`, and `js/timestamp-maker.js`.

Canvas Extractor's **Copy current view** action copies the expanded/collapsed hierarchy as shown, while **Copy table** continues to copy the full hierarchy.

## Convert to JPG

The SMART Notebook tool lists pages on the left and previews the active page on the right for one or more `.notebook` files. Pages start unselected; export selected pages or all pages as individual JPG downloads, with JPEG quality from 70% to 100% (default 100%).

## I Philo PDF

The **Convert to JPG** tool has two modes: preview and export selected PDF pages (or all pages) as JPG in a ZIP, or extract embedded images from one PDF as PNG files in a ZIP. Page export defaults to 300 DPI in the JPEG metadata with quality fixed at 100%. The **QR Detector** scans embedded images and rendered page graphics in one PDF, can show unique QR codes with their pages or group codes by page, and lets users open HTTP(S) links by clicking the QR image. It shows elapsed processing time and a page-based ETA. Scanning renders each page at up to 1,800 pixels per side, downsizes image objects to 1,600 pixels maximum per side, and parallelizes rendered-page scans using up to four Web Workers for QR decoding without reducing render resolution. It tries normal and inverted QR decoding, uses the browser's built-in `BarcodeDetector` when available, and retries with the locally vendored jsQR decoder when native detection finds no code. PDF.js 5.4.394 and its worker, CMaps, and standard fonts are vendored locally under `js/vendor/pdfjs/`; jsQR and its Apache 2.0 license are in `js/vendor/`. Files stay in the browser and are not uploaded.
