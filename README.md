# TikZ → SVG

Minimal static website: paste one `tikzpicture`, click Render, download SVG. All compilation happens client-side using [TikZJax v1](https://tikzjax.com/). No backend, build step, npm packages or API keys.

## Run locally

From this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. Use an HTTP server rather than opening index.html directly. Internet is required for the upstream compiler, WASM/TeX core and fonts; this is not an offline application. Code is passed only to the local render frame, never uploaded to a compiler service.

## Supported input

A single `\\begin{tikzpicture} ... \\end{tikzpicture}` with optional macro definitions before it. Basic drawing paths, shapes, colors, arrows, nodes and math labels were tested. This is a fixed TikZJax TeX environment, not a full TeX distribution. Full document preambles and `\\usepackage` are rejected. Additional libraries, PGFPlots, custom packages, external files, system fonts, shell escape and LuaLaTeX/XeLaTeX features are not supported by this app. No arbitrary package/library installation is provided. Unsupported TeX may fail or yield incomplete output.

Each render runs in a fresh sandboxed frame. The frame is discarded on completion, edits, errors or a 90-second timeout. Very complex or nonterminating TeX may block its browser process; a timeout cannot guarantee interruption of synchronous WASM. Export embeds used Computer Modern fonts as data URLs. Labels remain text, so SVG editors that ignore embedded fonts may substitute fonts.

## GitHub Pages

Publish these four files (`index.html`, `app.js`, `runner.html`, `runner.js`) at the repository root. In **Settings → Pages**, select **Deploy from a branch**, branch **main**, folder **/(root)** and Save. No Actions workflow or build is needed. Relative paths support project Pages URLs.

## Local verification

Browser-tested in the Codex in-app browser on 2026-11-02:
- Default plot with arrowheads, color, curve and math labels renders.
- Download produces a valid SVG XML file with embedded font data and paths.
- Editing clears the old result and disables Download.
- Empty input shows a validation message.
- Unknown TeX command shows a render error.
- A subsequent valid render with a circle and text/math labels recovers successfully.

Upstream engine and font files remain hosted by TikZJax and are subject to their availability and licenses. See [TikZJax source and license](https://github.com/kisonecat/tikzjax).
