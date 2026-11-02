// A fresh opaque-origin frame isolates the compiler and is discarded after each render.
const fontsURL = 'https://tikzjax.com/v1/fonts.css';
let started = false, finished = false;
function fail() {
  if (finished) return;
  finished = true;
  parent.postMessage({type:'error', message:'Could not render. Check TikZ syntax and supported features, and make sure you are online.'}, '*');
}
window.addEventListener('error', fail);
window.addEventListener('unhandledrejection', fail);
async function exportSVG(svg) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Keep every used Computer Modern font in the downloaded SVG itself.
  const cssResponse = await fetch(fontsURL);
  if (!cssResponse.ok) throw new Error('Font stylesheet unavailable');
  const css = await cssResponse.text();
  const used = new Set();
  svg.querySelectorAll('*').forEach(el => {
    getComputedStyle(el).fontFamily.split(',').forEach(name => used.add(name.trim().replace(/["']/g, '')));
  });
  const rules = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(m => m[0]).filter(rule => {
    const family = rule.match(/font-family:\s*([^;]+)/)?.[1].trim().replace(/["']/g, '');
    return used.has(family);
  });
  const embedded = await Promise.all(rules.map(async rule => {
    const path = rule.match(/url\(['"]?([^)'"\s]+)['"]?\)/)?.[1];
    if (!path) return rule;
    const response = await fetch(new URL(path, fontsURL));
    if (!response.ok) throw new Error('Font unavailable');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
      response.blob().then(blob => reader.readAsDataURL(blob), reject);
    });
    return rule.replace(/url\([^)]+\)/, `url("${data}")`);
  }));
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
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = fontsURL; document.head.append(stylesheet);
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
  const engine = document.createElement('script'); engine.src = 'https://tikzjax.com/v1/tikzjax.js';
  engine.onerror = fail;
  engine.onload = () => { try { Promise.resolve(window.onload()).catch(fail); } catch { fail(); } };
  document.head.append(engine);
}, {once:true});
