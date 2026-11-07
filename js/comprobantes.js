/* Comprobantes (fotos y PDF) y "Compartir" desde la app del banco o Mercado Pago. */
'use strict';

/* las fotos se achican para que no ocupen tanto (1600 px) */
async function aJpg(blob, max = 1600, calidad = 0.85) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', calidad));
}
const esPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
async function guardarComprobante(f) {
  if (/\.(heic|heif)$/i.test(f.name || '')) throw new Error('Las fotos HEIC del iPhone no se pueden ver: mandala por WhatsApp y guardala desde ahí');
  if (esPdf(f)) return DB.guardarArchivo(new Blob([await f.arrayBuffer()], { type: 'application/pdf' }));
  let b; try { b = await aJpg(f); } catch (e) { throw new Error(`${f.name || 'El archivo'} no es una foto ni un PDF`); }
  return DB.guardarArchivo(b);
}
const URLS = new Map();
async function urlArchivo(k) { if (!URLS.has(k)) { const b = await DB.archivo(k); URLS.set(k, b ? URL.createObjectURL(b) : ''); } return URLS.get(k); }
/* miniaturas: <img data-arch="clave"> se completan solas */
function pintarMiniaturas(raiz) {
  $$('[data-arch]', raiz).forEach(async el => {
    const k = el.dataset.arch;
    if (/\.pdf$/.test(k)) { el.outerHTML = `<div class="mini pdf" data-ver="${esc(k)}">PDF</div>`; return; }
    const u = await urlArchivo(k); if (u) el.src = u; else el.alt = 'No está';
  });
}
let _pdfjs = null;
function cargarPdfJs() {
  return _pdfjs = _pdfjs || new Promise((ok, mal) => {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script'); s.src = 'lib/pdf.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js'; ok(pdfjsLib); };
    s.onerror = () => { _pdfjs = null; mal(new Error('No se pudo cargar el lector de PDF')); };
    document.head.appendChild(s);
  });
}
async function compartirArchivo(blob, nombre) {
  const f = new File([blob], nombre, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: nombre }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  toast('Se guardó en Descargas'); return true;
}
async function verComprobante(k) {
  const b = await DB.archivo(k); if (!b) return toast('No se encontró el comprobante', true);
  const pdf = /\.pdf$/.test(k);
  const m = modal('Comprobante', `<div id="vcC" style="text-align:center">${pdf ? '<p class="muted">Abriendo el PDF…</p>' : `<img src="${await urlArchivo(k)}" style="max-width:100%;border-radius:10px">`}</div>`,
    `<button class="btn" data-cerrar>Cerrar</button><button class="btn pri" id="vcS">${ico('compartir')} Compartir / guardar</button>`, 'ancho');
  $('#vcS', m).onclick = () => compartirArchivo(b, `Comprobante ${hoy()}.${pdf ? 'pdf' : 'jpg'}`);
  if (pdf) try {
    const doc = await (await cargarPdfJs()).getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise, c = $('#vcC', m); c.innerHTML = '';
    for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
      const pg = await doc.getPage(i), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(2.5, (Math.min(innerWidth, 900) * (devicePixelRatio || 1)) / v0.width) });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.cssText = 'width:100%;border:1px solid var(--borde);border-radius:8px;margin-bottom:8px;background:#fff';
      c.appendChild(cv); await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) { $('#vcC', m).innerHTML = '<p class="muted">No se pudo mostrar el PDF acá. Tocá "Compartir / guardar" para abrirlo con otra app.</p>'; }
}
document.addEventListener('click', e => { const v = e.target.closest('[data-ver]'); if (v) { e.stopPropagation(); verComprobante(v.dataset.ver); } }, true);

/* ---------- leer el comprobante: importe, N° de operación y fecha ---------- */
async function textoPdf(file) {
  const doc = await (await cargarPdfJs()).getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let t = '';
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) { const c = await (await doc.getPage(i)).getTextContent(); t += c.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; }
  return t;
}
function leerDatos(texto, archivos = []) {
  const out = {}, t = String(texto || '').replace(/ /g, ' ');
  const MONTO = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)';
  const conClave = t.match(new RegExp('(?:importe|monto|total|transferiste|pagaste|enviaste|valor)[^\\d$\\n]{0,40}\\$?\\s*' + MONTO, 'i'));
  const todos = [...t.matchAll(new RegExp('\\$\\s*' + MONTO, 'g'))].map(m => aNum(m[1])).filter(x => x > 0);
  const imp = conClave ? aNum(conClave[1]) : todos.length ? Math.max(...todos) : 0;
  if (imp > 0) out.monto = imp;
  const op = t.match(/(?:operaci[oó]n|comprobante|transacci[oó]n|referencia|n[°º]\s*de\s*control|c[oó]digo de identificaci[oó]n)[^A-Za-z0-9]{0,25}(?:de mercado pago[^A-Za-z0-9]{0,5})?(?:n[°º.]*\s*:?\s*)?([A-Z0-9-]*\d[A-Z0-9-]{3,})/i);
  if (op) out.operacion = op[1];
  if (!out.operacion) for (const f of archivos) { const m = String(f.name || '').match(/(\d{8,})/); if (m) { out.operacion = m[1]; break; } }   // Mercado Pago: comprobante_<N°>.png
  const fm = t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/); if (fm) { const f = `${fm[3]}-${fm[2]}-${fm[1]}`; if (f <= hoy() && f >= sumarDias(hoy(), -60)) out.fecha = f; }
  const p = t.match(/(?:para|destinatario|a nombre de|beneficiario)\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n$]{2,40})/i); if (p) out.detalle = p[1].trim().replace(/\s+/g, ' ');
  return out;
}
async function recibirCompartido() {
  const c = await DB._get('compartidos', 'ultimo'); if (!c) return;
  await DB._del('compartidos', 'ultimo');
  if (Date.now() - (c.cuando || 0) > 30 * 60000) return;
  const archivos = (c.archivos || []).filter(f => f && f.size);
  if (!archivos.length) return toast('No llegó ningún archivo. Compartí el comprobante como imagen o PDF.', true);
  let texto = [c.title, c.text].filter(Boolean).join('\n');
  for (const f of archivos) if (esPdf(f)) { try { texto += '\n' + await textoPdf(f); } catch (e) { /* se completa a mano */ } }
  const d = leerDatos(texto, archivos);
  history.replaceState(null, '', location.pathname);
  nuevoMov(Object.assign({ tipo: 'GASTO', archivos }, d), recargar);
  toast(d.monto ? 'Revisá el monto leído del comprobante y elegí la categoría' : 'Comprobante adjuntado: escribí el monto y elegí la categoría');
}
