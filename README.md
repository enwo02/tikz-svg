# TikZ → SVG

**[Use the app →](https://enwo02.github.io/tikz-svg/)**

Paste your TikZ code, click **Render**, then **Download SVG**. On your first visit, stay online until **Ready for offline use** appears; afterward, the app works offline in the same browser.

Minimal static website: paste one `tikzpicture`, click Render, download SVG. All compilation happens client-side using [TikZJax v1](https://tikzjax.com/). No backend, build step, npm packages or API keys.

## Run locally

From this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. Use an HTTP server rather than opening index.html directly. On the first visit, keep the internet connected until **Ready for offline use** appears. This saves the app, compiler, WASM/TeX core and all 140 font files in this browser. After that you can disconnect, reload, render new code and download SVGs. Clearing site data, private browsing, browser storage eviction or a different browser/profile requires setup again. The first download contacts TikZJax and Amazon S3, but does not include your TikZ code. Code is passed only to the local render frame, never uploaded to a compiler service.

## Supported input

A single `\begin{tikzpicture} ... \end{tikzpicture}` with optional macro definitions before it. Basic drawing paths, shapes, colors, arrows, nodes and math labels were tested. This is a fixed TikZJax TeX environment, not a full TeX distribution. Full document preambles and `\usepackage` are rejected. Additional libraries, PGFPlots, custom packages, external files, system fonts, shell escape and LuaLaTeX/XeLaTeX features are not supported by this app. No arbitrary package/library installation is provided. Unsupported TeX may fail or yield incomplete output.

Each render runs in a fresh sandboxed frame with network access blocked by Content Security Policy. The parent supplies cached engine, WASM, TeX core and font bytes through postMessage. The renderer’s fetch shim serves only those supplied resources. A service worker caches the app shell; Cache Storage retains the full renderer asset list. It only reports offline readiness after all resources are saved and the page is controlled by the service worker. Failed setup can be retried by clicking Render; partial downloads are reused. No pasted code or rendered SVG is stored in these caches.

Each render runs in a fresh sandboxed frame. The frame is discarded on completion, edits, errors or a 90-second timeout. Very complex or nonterminating TeX may block its browser process; a timeout cannot guarantee interruption of synchronous WASM. Export embeds used Computer Modern fonts as data URLs. Labels remain text, so SVG editors that ignore embedded fonts may substitute fonts.

## GitHub Pages

Publish all application files (`index.html`, `app.js`, `assets.js`, `runner.js`, `sw.js`) at the repository root. In **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/(root)** and Save. No Actions workflow or build is needed. Relative paths support project Pages URLs.

## Local verification

Browser-tested in the Codex in-app browser on 2026-11-02:
- Default plot with arrowheads, color, curve and math labels renders.
- Download produces a valid SVG XML file with embedded font data and paths.
- Editing clears the old result and disables Download.
- Empty input shows a validation message.
- Unknown TeX command shows a render error.
- A subsequent valid render with a circle and text/math labels recovers successfully.
- Offline update: after setup, stopped the local HTTP server, reloaded the page from the service worker, and rendered successfully with network access blocked inside the renderer.

Upstream engine and font files remain hosted by TikZJax and are subject to their availability and licenses. See [TikZJax source and license](https://github.com/kisonecat/tikzjax).
