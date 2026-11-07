/* Guarda la app en el celular para que abra sin internet, y recibe los comprobantes que se comparten desde el banco o Mercado Pago.
   Al cambiar VERSION, el celular baja la versión nueva la próxima vez que abre la app con internet. */
const VERSION = 'gas-1.0.0';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/zip.js', 'js/db.js', 'js/lic.js', 'js/ui.js', 'js/negocio.js', 'js/comprobantes.js', 'js/movs.js', 'js/inicio.js', 'js/cuentas.js', 'js/informes.js', 'js/config.js', 'js/main.js',
  'lib/pdf.js', 'lib/pdf.worker.js', 'img/logo.png', 'img/favicon.png', 'img/icono-192.png', 'img/icono-512.png', 'img/icono-maskable.png', 'img/apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
/* sólo se borran las versiones viejas DE ESTA APP (las otras apps de rofac.github.io comparten el mismo lugar) */
const PREFIJO = VERSION.split('-')[0] + '-';
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIJO) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const conTiempo = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok(null), ms))]);

/* lo compartido se deja guardado para que la app lo tome al abrir (misma base y mismos lugares que js/db.js) */
const abrirBase = () => new Promise((ok, mal) => {
  const r = indexedDB.open('rofac_gastos', 1);
  r.onupgradeneeded = () => { const d = r.result;
    for (const t of ['cuentas', 'tarjetas', 'movimientos', 'compras', 'fijos', 'actividad']) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' });
    for (const t of ['config', 'copias']) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'k' });
    for (const t of ['archivos', 'compartidos']) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t); };
  r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
});
async function recibir(req) {
  try {
    const fd = await req.formData(), archivos = fd.getAll('archivos').filter(f => f && typeof f !== 'string');
    const d = await abrirBase();
    await new Promise((ok, mal) => { const tx = d.transaction('compartidos', 'readwrite');
      tx.objectStore('compartidos').put({ archivos, title: fd.get('title') || '', text: fd.get('text') || '', cuando: Date.now() }, 'ultimo');
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error); });
    d.close();
  } catch (e) { /* igual se abre la app */ }
  return Response.redirect('./?app=gastos&compartido=1', 303);
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname.endsWith('/compartir')) return e.respondWith(recibir(e.request));
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const g = await c.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (g) return g;
    const r = await conTiempo(red, 8000);
    return r || (await c.match('index.html')) || (await red) || Response.error();
  }));
});
