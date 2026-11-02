// A fresh opaque-origin frame isolates the compiler and is discarded after each render.
const fontsURL = 'https://tikzjax.com/v1/fonts.css';
let started = false, finished = false, embeddedCSS = '';
function dataURL(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:font/ttf;base64,' + btoa(binary);
}
function fail() {
  if (finished) return;
  finished = true;
  parent.postMessage({type:'error', message:'Could not render. Check TikZ syntax and supported features, try a simpler picture.'}, '*');
}
window.addEventListener('error', fail);
window.addEventListener('unhandledrejection', fail);
async function exportSVG(svg) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Keep every used Computer Modern font in the downloaded SVG itself.
  const css = embeddedCSS;
  const used = new Set();
  svg.querySelectorAll('*').forEach(el => {
    getComputedStyle(el).fontFamily.split(',').forEach(name => used.add(name.trim().replace(/["']/g, '')));
  });
  const rules = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(m => m[0]).filter(rule => {
    const family = rule.match(/font-family:\s*([^;]+)/)?.[1].trim().replace(/["']/g, '');
    return used.has(family);
  });
  const embedded = rules;
  if (embedded.length) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = embedded.join('\n'); copy.prepend(style);
  }
  // Display/export only passive SVG, even if TeX specials inserted markup.
  copy.querySelectorAll('script, foreignObject, iframe, object, embed, a').forEach(el => el.remove());
  copy.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attr => {
    if (/^on/i.test(attr.name) || /^(?:href|xlink:href)$/i.test(attr.name) && !attr.value.startsWith('#')) el.removeAttribute(attr.name);
  }));
  return new XMLSerializer().serializeToString(copy);
}
window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'render' || started) return;
  started = true;
  const resources = event.data.resources;
  // The isolated renderer can only read the supplied bytes, never the network.
  window.fetch = async input => {
    const url = typeof input === 'string' ? input : input.url;
    if (!Object.hasOwn(resources, url)) throw new Error('Resource not bundled');
    return new Response(resources[url]);
  };
  embeddedCSS = new TextDecoder().decode(resources[fontsURL]).replace(/url\(['"]?([^)'"\s]+)['"]?\)/g, (_, path) => {
    return `url("${dataURL(resources[new URL(path, fontsURL).href])}")`;
  });
  const stylesheet = document.createElement('style'); stylesheet.textContent = embeddedCSS; document.head.append(stylesheet);
  const picture = document.createElement('script'); picture.type = 'text/tikz'; picture.textContent = event.data.source; document.body.append(picture);
  const observer = new MutationObserver(async () => {
    const svg = document.querySelector('svg');
    if (!svg || finished) return;
    observer.disconnect();
    try {
      const result = await exportSVG(svg);
      if (finished) return;
      finished = true; parent.postMessage({type:'svg', svg:result}, '*');
    } catch { fail(); }
  });
  observer.observe(document.body, {childList:true, subtree:true});
  const engine = document.createElement('script'); engine.textContent = new TextDecoder().decode(resources['https://tikzjax.com/v1/tikzjax.js']);
  engine.onerror = fail;
  document.head.append(engine);
  try { Promise.resolve(window.onload()).catch(fail); } catch { fail(); }
}, {once:true});
