/* Arranque de la app. */
'use strict';

const TAMANIOS = { chica: .88, normal: 1 };
function aplicarTema() {
  document.documentElement.style.zoom = TAMANIOS[DB.cfg.letra || 'normal'] || 1;
  const t = DB.cfg.tema || 'light';
  document.documentElement.dataset.theme = t !== 'auto' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* botón "Instalar app": Chrome avisa cuando se puede instalar y todavía no está instalada */
let PEDIDO_INSTALAR = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); PEDIDO_INSTALAR = e; if (!instalada()) $('#btnInstalar').hidden = false; });
window.addEventListener('appinstalled', () => { PEDIDO_INSTALAR = null; $('#btnInstalar').hidden = true; toast('¡Listo! Ya tenés el ícono en la pantalla'); });
function instalarApp() {
  if (PEDIDO_INSTALAR) { PEDIDO_INSTALAR.prompt(); PEDIDO_INSTALAR.userChoice.finally(() => { PEDIDO_INSTALAR = null; $('#btnInstalar').hidden = true; }); return; }
  ayudaInstalar();
}
/* si puso clave, la pide al abrir (no se puede cerrar la ventana sin ponerla) */
async function pedirClaveAlAbrir() {
  while (DB.cfg.pin) {
    window._trasOlvido = null;
    const ok = await new Promise(res => {
      let fin = false; const listo = v => { if (!fin) { fin = true; clearInterval(t); res(v); } };
      window._trasOlvido = () => listo(true);
      pedirPin('entrar').then(v => { if (v) listo(true); });
      const t = setInterval(() => { if (!$('.modal')) listo(false); }, 400);     // si cerró la ventana sin poner la clave, se vuelve a pedir
    });
    if (ok) return;
  }
}

(async () => {
  try {
    await DB.abrir();
    aplicarTema();
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicarTema);
    await datosIniciales();
    pintarMenu();
    $('#arranque').remove();
    await pedirClaveAlAbrir();
    DB.copiaDiaria();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    $('#btnCobrar').onclick = () => nuevoMov({ tipo: 'GASTO' }, recargar);
    $('#btnInstalar').onclick = instalarApp;
    $('#btnAtras').onclick = () => { const [id, args] = PILA.pop() || ['inicio', null]; ACTUAL = null; ir(id, args, false).then(() => { $('#btnAtras').hidden = !PILA.length; }); };
    await ir('inicio');
    if (/[?&]compartido=1/.test(location.search) || await DB._get('compartidos', 'ultimo')) recibirCompartido().catch(fallo);
  } catch (e) {
    console.error(e);
    $('#main').innerHTML = `<div class="card">${vacio('alerta', 'No se pudo abrir la app: ' + esc(e.message || e) + '<br>Probá cerrarla y abrirla de nuevo.')}</div>`;
  } finally { const a = $('#arranque'); if (a) a.remove(); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e));
})();
