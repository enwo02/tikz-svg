const code = document.querySelector('#code');
const renderButton = document.querySelector('#render');
const downloadButton = document.querySelector('#download');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
let frame, timer, svgText = '', previewURL;
function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
function stop() { clearTimeout(timer); frame?.remove(); frame = null; renderButton.disabled = false; }
function clearResult() {
  svgText = ''; downloadButton.disabled = true;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null; preview.replaceChildren();
}
code.addEventListener('input', () => { stop(); clearResult(); message('Code changed. Click Render.'); });
renderButton.addEventListener('click', () => {
  stop(); clearResult();
  const source = code.value.trim();
  if (!source.includes('\\begin{tikzpicture}') || !source.includes('\\end{tikzpicture}')) {
    message('Paste a complete \\begin{tikzpicture} … \\end{tikzpicture}.', true); return;
  }
  if (/\\(?:documentclass|usepackage)\b|\\(?:begin|end)\s*\{document\}/.test(source)) {
    message('Paste only the TikZ picture and macro definitions, without a document preamble.', true); return;
  }
  message('Rendering… first load can take a moment.'); renderButton.disabled = true;
  frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts';
  frame.title = 'TikZ renderer';
  frame.src = 'runner.html';
  frame.addEventListener('load', () => frame?.contentWindow.postMessage({type:'render', source}, '*'), {once:true});
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
  stop(); downloadButton.disabled = false; message('Rendered. SVG ready to download.');
});
downloadButton.addEventListener('click', () => {
  if (!svgText) return;
  const url = URL.createObjectURL(new Blob([svgText], {type:'image/svg+xml;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'tikz.svg';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
