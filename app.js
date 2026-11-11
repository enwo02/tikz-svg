const code = document.querySelector('#code');
const renderButton = document.querySelector('#render');
const downloadButton = document.querySelector('#download');
const downloadPngButton = document.querySelector('#download-png');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
let frame, timer, svgText = '', previewURL, generation = 0;
let bundlePromise;
const ENGINE_CACHE = 'tikz-svg-engine-v1';
const offlineStatus = document.querySelector('#offline-status');
async function cachedResource(url) {
  const cache = await caches.open(ENGINE_CACHE);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url, {credentials:'omit'});
  if (!response.ok) throw new Error('Resource unavailable');
  await cache.put(url, response.clone());
  return response;
}
async function loadBundle() {
  const resources = {};
  let completed = 0, next = 0;
  const results = await Promise.allSettled(Array.from({length:6}, async () => {
    while (next < REMOTE_ASSETS.length) {
      const url = REMOTE_ASSETS[next++];
      resources[url] = await (await cachedResource(url)).arrayBuffer();
      completed++;
      offlineStatus.textContent = `Caching rendering engine for offline use (${Math.floor(completed / REMOTE_ASSETS.length * 100)}%)`;
    }
  }));
  if (results.some(result => result.status === 'rejected')) throw new Error('Offline download incomplete');
  const runner = await (await fetch('runner.js')).text();
  // Offline installation must never hold a ready compiler hostage.
  offlineStatus.textContent = 'Renderer ready. Finishing offline setup…';
  finishOfflineSetup();
  return {resources, runner};
}
async function finishOfflineSetup() {
  let timeout, onControl;
  const serviceWorker = navigator.serviceWorker;
  try {
    if (!serviceWorker) throw new Error('Service workers unavailable');
    await Promise.race([
      (async () => {
        await serviceWorker.register('sw.js');
        await serviceWorker.ready;
        if (!serviceWorker.controller) await new Promise(resolve => {
          onControl = () => { if (serviceWorker.controller) resolve(); };
          serviceWorker.addEventListener('controllerchange', onControl);
          onControl(); // Close the race between checking and subscribing.
        });
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Offline setup timed out')), 15000);
      })
    ]);
    offlineStatus.textContent = 'Ready for offline use';
  } catch {
    offlineStatus.textContent = 'Renderer ready. Offline setup unavailable; keep this page online.';
  } finally {
    clearTimeout(timeout);
    if (onControl) serviceWorker.removeEventListener('controllerchange', onControl);
  }
}
function prepare() {
  if (!bundlePromise) bundlePromise = loadBundle().catch(error => {
    bundlePromise = null;
    offlineStatus.textContent = 'Offline setup incomplete. Reconnect and click Render to retry.';
    throw error;
  });
  return bundlePromise;
}
prepare().catch(() => {});
function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
function stop() { generation++; clearTimeout(timer); frame?.remove(); frame = null; renderButton.disabled = false; }
function clearResult() {
  svgText = ''; downloadButton.disabled = downloadPngButton.disabled = true;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null; preview.replaceChildren();
}
code.addEventListener('input', () => { stop(); clearResult(); message('Code changed. Click Render.'); });
function extractPicture(input) {
  // Skip TeX comments and escaped characters while locating the delimiters.
  const tokens = /%[^\r\n]*|\\(begin|end)\s*\{tikzpicture\}|\\[\s\S]/g;
  const markers = [...input.matchAll(tokens)].filter(token => token[1]);
  if (markers.length !== 2 || markers[0][1] !== 'begin' || markers[1][1] !== 'end') return null;
  const [start, end] = markers;
  const prefix = input.slice(0, start.index);
  const suffix = input.slice(end.index + end[0].length);
  const preamble = prefix.replace(/\\[\s\S]|%[^\r\n]*/g, token => token.startsWith('%') ? '' : token).trim();
  // Keep the optional macro preamble for standalone snippets.
  const standalone = !suffix.replace(/%[^\r\n]*/g, '').trim() &&
    (!preamble || (/^\\/.test(preamble) && !/\\(?:documentclass|usepackage|begin|end)\b/.test(preamble)));
  return input.slice(standalone ? 0 : start.index, end.index + end[0].length).trim();
}
renderButton.addEventListener('click', async () => {
  stop(); clearResult();
  const source = extractPicture(code.value);
  if (source === null) {
    message('Paste exactly one complete \\begin{tikzpicture} … \\end{tikzpicture}.', true); return;
  }
  const attempt = generation;
  message('Preparing renderer…'); renderButton.disabled = true;
  let bundle;
  try { bundle = await prepare(); } catch { if (attempt === generation) { stop(); message('Renderer unavailable. Complete offline setup while online, then retry.', true); } return; }
  if (attempt !== generation) return;
  message('Rendering…');
  frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts';
  frame.title = 'TikZ renderer';
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'wasm-unsafe-eval\'; style-src \'unsafe-inline\'; font-src data:; img-src data:; connect-src \'none\'"></head><body><script>' + bundle.runner.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
  frame.addEventListener('load', () => frame?.contentWindow.postMessage({type:'render', source, resources:bundle.resources}, '*'), {once:true});
  document.body.append(frame);
  timer = setTimeout(() => { stop(); message('Render timed out. Check your code, connection, or try a simpler picture.', true); }, 90000);
});
window.addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'error') { stop(); message(event.data.message, true); return; }
  if (event.data?.type !== 'svg' || typeof event.data.svg !== 'string') return;
  const parsed = new DOMParser().parseFromString(event.data.svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
    stop(); message('The renderer returned an invalid SVG.', true); return;
  }
  svgText = event.data.svg;
  previewURL = URL.createObjectURL(new Blob([svgText], {type:'image/svg+xml'}));
  const img = new Image(); img.alt = 'Rendered TikZ picture'; img.src = previewURL; preview.append(img);
  stop(); downloadButton.disabled = downloadPngButton.disabled = false; message('Rendered. SVG and PNG ready to download.');
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
downloadButton.addEventListener('click', () => {
  if (!svgText) return;
  download(new Blob([svgText], {type:'image/svg+xml;charset=utf-8'}), 'tikz.svg');
});
const pngDpi = 300;

function setPngResolution(png) {
  // PNG stores physical resolution as pixels per metre in a pHYs chunk.
  const chunk = new Uint8Array(21);
  const fields = new DataView(chunk.buffer);
  const pixelsPerMetre = Math.round(pngDpi / 0.0254);
  fields.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  fields.setUint32(8, pixelsPerMetre);
  fields.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  fields.setUint32(17, crc ^ 0xffffffff);

  return png.arrayBuffer().then(buffer => {
    const data = new DataView(buffer);
    const parts = [png.slice(0, 33), chunk]; // Signature and IHDR precede pHYs.
    for (let offset = 33; offset < data.byteLength;) {
      const end = offset + 12 + data.getUint32(offset);
      if (data.getUint32(offset + 4) !== 0x70485973) parts.push(png.slice(offset, end));
      offset = end;
    }
    return new Blob(parts, {type: 'image/png'});
  });
}

downloadPngButton.addEventListener('click', async () => {
  const img = preview.querySelector('img');
  if (!img) return;
  const attempt = generation;
  downloadPngButton.disabled = true;
  message('Preparing PNG…');
  try {
    await img.decode();
    if (attempt !== generation) return;
    const canvas = document.createElement('canvas');
    const scale = pngDpi / 96; // CSS pixels per inch.
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG encoding failed');
    const exportPng = await setPngResolution(png);
    if (attempt !== generation) return;
    download(exportPng, 'tikz.png');
    message('PNG ready to download.');
  } catch {
    if (attempt === generation) message('Could not create the PNG. Try a smaller picture.', true);
  } finally {
    if (attempt === generation) downloadPngButton.disabled = false;
  }
});
