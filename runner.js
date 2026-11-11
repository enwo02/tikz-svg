// A fresh opaque-origin frame isolates the compiler and is discarded after each render.
const fontsURL = 'https://tikzjax.com/v1/fonts.css';
let started = false, finished = false, embeddedCSS = '';
function dataURL(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:font/ttf;base64,' + btoa(binary);
}
function fail(error) {
  if (finished) return;
  finished = true;
  parent.postMessage({type:'error', message:'Could not render: ' + (error?.reason?.message || error?.message || error || 'Unknown error')}, '*');
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
  // TikZJax emits U+00A8 at TeX's accent position, but its bundled
  // Computer Modern fonts draw a different glyph there. Draw the dots
  // in SVG so the accent is identical in the preview and both downloads.
  for (const accent of copy.querySelectorAll('text')) {
    if (accent.textContent !== '¨' || !accent.style.fontFamily.startsWith('cm')) continue;
    const x = Number(accent.getAttribute('x'));
    const y = Number(accent.getAttribute('y'));
    const size = Number(accent.getAttribute('font-size'));
    if (![x, y, size].every(Number.isFinite) || size <= 0) continue;
    const dots = [0.16, 0.34].map(offset => {
      const dot = document.createElementNS(copy.namespaceURI, 'circle');
      dot.setAttribute('cx', x + size * offset);
      dot.setAttribute('cy', y - size * 0.62);
      dot.setAttribute('r', size * 0.05);
      return dot;
    });
    accent.replaceWith(...dots);
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
  // TikZJax v1's TeX input is not UTF-8. Preserve German labels using
  // equivalent TeX accents; NFC also accepts pasted decomposed umlauts.
  const german = {ä:'\\"{a}', ö:'\\"{o}', ü:'\\"{u}', Ä:'\\"{A}', Ö:'\\"{O}', Ü:'\\"{U}', ß:'{\\ss}'};
  const source = event.data.source.normalize('NFC').replace(/[äöüÄÖÜß]/g, character => german[character]);
  const picture = document.createElement('script'); picture.type = 'text/tikz'; picture.textContent = source; document.body.append(picture);
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
  const engine = document.createElement('script');
  // TFM's final character code is inclusive. Upstream v1 omits it, so
  // Computer Modern's umlaut (127) fails even with explicit TeX syntax.
  const upstream = new TextDecoder().decode(resources['https://tikzjax.com/v1/tikzjax.js']);
  engine.textContent = upstream.replace(
    'A<this.largest_character_code;A++)this.process_char(A)',
    'A<=this.largest_character_code;A++)this.process_char(A)'
  );
  engine.onerror = fail;
  document.head.append(engine);
  try { Promise.resolve(window.onload()).catch(fail); } catch (error) { fail(error); }
}, {once:true});
