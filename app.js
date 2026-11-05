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
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing?.active) await navigator.serviceWorker.register('sw.js');
  else navigator.serviceWorker.register('sw.js').catch(() => {});
  await navigator.serviceWorker.ready;
  // Wait until this page is controlled, so a reload also works offline.
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
  offlineStatus.textContent = 'Ready for offline use';
  return {resources, runner};
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
renderButton.addEventListener('click', async () => {
  stop(); clearResult();
  const source = code.value.trim();
  if (!source.includes('\\begin{tikzpicture}') || !source.includes('\\end{tikzpicture}')) {
    message('Paste a complete \\begin{tikzpicture} … \\end{tikzpicture}.', true); return;
  }
  if (/\\(?:documentclass|usepackage)\b|\\(?:begin|end)\s*\{document\}/.test(source)) {
    message('Paste only the TikZ picture and macro definitions, without a document preamble.', true); return;
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
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (attempt !== generation) return;
    if (!png) throw new Error('PNG encoding failed');
    download(png, 'tikz.png');
    message('PNG ready to download.');
  } catch {
    if (attempt === generation) message('Could not create the PNG. Try a smaller picture.', true);
  } finally {
    if (attempt === generation) downloadPngButton.disabled = false;
  }
});
