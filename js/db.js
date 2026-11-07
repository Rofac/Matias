/* Datos guardados en el celular (IndexedDB). Todo se carga en memoria al abrir y cada cambio se escribe al instante.
   No hace falta internet. La copia de seguridad es un .zip con los datos y los comprobantes. */
'use strict';

const TABLAS = ['cuentas', 'tarjetas', 'movimientos', 'compras', 'fijos', 'actividad'];
/* OJO: el service worker (sw.js) abre esta misma base para dejar lo que se comparte: tiene que crear los mismos lugares */
const DB_NOMBRE = 'rofac_gastos', DB_VERSION = 1;

const CONFIG_INICIAL = {
  nombre: 'Matías',
  categorias: [
    { n: 'Supermercado', e: '🛒', tope: 0 }, { n: 'Comida y delivery', e: '🍔', tope: 0 }, { n: 'Nafta y auto', e: '⛽', tope: 0 },
    { n: 'Transporte', e: '🚌', tope: 0 }, { n: 'Casa y servicios', e: '🏠', tope: 0 }, { n: 'Salud y farmacia', e: '💊', tope: 0 },
    { n: 'Ropa', e: '👕', tope: 0 }, { n: 'Salidas', e: '🍻', tope: 0 }, { n: 'Suscripciones', e: '📺', tope: 0 },
    { n: 'Regalos', e: '🎁', tope: 0 }, { n: 'Educación', e: '📚', tope: 0 }, { n: 'Mascotas', e: '🐶', tope: 0 }, { n: 'Otros', e: '📦', tope: 0 },
  ],
  categorias_ingreso: ['Sueldo', 'Aguinaldo', 'Horas extra', 'Venta', 'Otros'],
  cotizacion_usd: 0,                 // opcional: para mostrar el total en pesos
  aviso_copia_dias: 7, ultima_copia: '', tema: 'light', letra: 'normal', pin: '',
};

const DB = {
  db: null, t: {}, cfg: {}, soloLectura: false, mensajeBloqueo: '',
  abrir() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(DB_NOMBRE, DB_VERSION);
      r.onupgradeneeded = () => crearLugares(r.result);
      r.onerror = () => mal(r.error || new Error('No se pudo abrir la base de datos'));
      r.onsuccess = async () => {
        this.db = r.result;
        try {
          for (const t of TABLAS) this.t[t] = await this._todo(t);
          const c = await this._todo('config');
          this.cfg = Object.assign({}, CONFIG_INICIAL);
          for (const x of c) this.cfg[x.k] = x.v;
          ok();
        } catch (e) { mal(e); }
      };
    });
  },
  _tx(t, modo = 'readonly') { return this.db.transaction(t, modo).objectStore(t); },
  _req(q) { return new Promise((ok, mal) => { q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); }); },
  _todo(t) { return this._req(this._tx(t).getAll()).then(r => r || []); },
  _put(t, v, k) { return this._req(k === undefined ? this._tx(t, 'readwrite').put(v) : this._tx(t, 'readwrite').put(v, k)); },
  _del(t, k) { return this._req(this._tx(t, 'readwrite').delete(k)); },
  _get(t, k) { return this._req(this._tx(t).get(k)); },
  _claves(t) { return this._req(this._tx(t).getAllKeys()); },

  todos(t) { return this.t[t] || []; },
  get(t, id) { id = +id; return this.todos(t).find(x => x.id === id) || null; },
  donde(t, f) { return this.todos(t).filter(f); },
  verificarEscritura() { if (this.soloLectura) throw new Error(this.mensajeBloqueo || 'Sólo lectura'); },
  async guardar(t, obj) {
    this.verificarEscritura();
    const lista = this.t[t];
    if (!obj.id) { obj.id = lista.reduce((m, x) => Math.max(m, x.id), 0) + 1; obj.creado = obj.creado || ahora(); }
    obj.modificado = ahora();
    await this._put(t, obj);
    const i = lista.findIndex(x => x.id === obj.id);
    if (i >= 0) lista[i] = obj; else lista.push(obj);
    return obj;
  },
  async borrar(t, id) { this.verificarEscritura(); id = +id; await this._del(t, id); this.t[t] = this.t[t].filter(x => x.id !== id); },
  async setCfg(k, v) { this.cfg[k] = v; await this._put('config', { k, v }); },
  async anotar(accion, detalle = '') {
    try { await this.guardar('actividad', { fecha: ahora(), accion, detalle }); } catch (e) { /* no importa */ }
    const a = this.t.actividad;
    if (a.length > 2100) { for (const x of a.slice(0, a.length - 2000)) await this._del('actividad', x.id).catch(() => {}); this.t.actividad = a.slice(a.length - 2000); }
  },

  /* ---------- comprobantes (fotos y PDF), aparte de los datos ---------- */
  async guardarArchivo(blob) { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (blob.type === 'application/pdf' ? '.pdf' : '.jpg'); await this._put('archivos', blob, k); return k; },
  archivo(k) { return this._get('archivos', k); },
  borrarArchivo(k) { return this._del('archivos', k).catch(() => {}); },

  /* ---------- copias de seguridad ---------- */
  exportar() {
    const data = {};
    for (const t of TABLAS) data[t] = this.t[t];
    const cfg = Object.assign({}, this.cfg); delete cfg.pin;
    return { app: 'rofac-gastos', version: 1, fecha: ahora(), nombre: this.cfg.nombre, config: cfg, pin: this.cfg.pin || '', data };
  },
  async exportarZip() {
    const ent = [{ nombre: 'datos.json', datos: new TextEncoder().encode(JSON.stringify(this.exportar())) }];
    for (const k of await this._claves('archivos')) { const b = await this._get('archivos', k); if (b) ent.push({ nombre: 'comprobantes/' + k, datos: new Uint8Array(await b.arrayBuffer()) }); }
    return ZIP.crear(ent);
  },
  async importar(j, archivos) {
    if (!j || j.app !== 'rofac-gastos' || !j.data) throw new Error('Ese archivo no es una copia de esta app de gastos');
    const lugares = [...TABLAS, 'config', ...(archivos ? ['archivos'] : [])];
    const tx = this.db.transaction(lugares, 'readwrite');
    await new Promise((ok, mal) => {
      for (const t of TABLAS) { const s = tx.objectStore(t); s.clear(); for (const x of j.data[t] || []) s.put(x); }
      const c = tx.objectStore('config'); c.clear();
      for (const [k, v] of Object.entries(Object.assign({}, j.config, { pin: j.pin || '' }))) c.put({ k, v });
      if (archivos) { const a = tx.objectStore('archivos'); a.clear(); for (const [k, b] of Object.entries(archivos)) a.put(b, k); }
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error || new Error('No se pudo restaurar'));
    });
    for (const t of TABLAS) this.t[t] = j.data[t] || [];
    this.cfg = Object.assign({}, CONFIG_INICIAL, j.config, { pin: j.pin || '' });
  },
  async leerCopia(file) {        // .zip (con comprobantes) o .json (sólo datos)
    const cab = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (cab[0] === 0x50 && cab[1] === 0x4b) {
      const ents = await ZIP.leer(file), d = ents.find(e => e.nombre === 'datos.json');
      if (!d) throw new Error('Ese .zip no es una copia de esta app');
      const j = JSON.parse(new TextDecoder().decode(await d.datos())), archivos = {};
      for (const e of ents) { const m = e.nombre.match(/^comprobantes\/(.+)$/); if (m) archivos[m[1]] = new Blob([await e.datos()], { type: /\.pdf$/.test(m[1]) ? 'application/pdf' : 'image/jpeg' }); }
      return { j, archivos };
    }
    return { j: JSON.parse(await file.text()), archivos: null };
  },
  /* una copia automática por día adentro del celular (las últimas 7, sin los comprobantes) */
  async copiaDiaria() {
    try {
      const k = 'dia-' + hoy();
      if (await this._get('copias', k)) return;
      await this._put('copias', { k, v: JSON.stringify(this.exportar()) });
      const todas = (await this._todo('copias')).map(x => x.k).sort();
      for (const x of todas.slice(0, Math.max(0, todas.length - 7))) await this._del('copias', x);
    } catch (e) { console.warn('copia diaria', e); }
  },
  async copiasInternas() { return (await this._todo('copias')).map(x => ({ k: x.k, fecha: x.k.slice(4) })).sort((a, b) => b.k.localeCompare(a.k)); },
  async copiaInterna(k) { const x = await this._get('copias', k); return x ? JSON.parse(x.v) : null; },
};
function crearLugares(d) {
  for (const t of TABLAS) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' });
  for (const t of ['config', 'copias']) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'k' });
  for (const t of ['archivos', 'compartidos']) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t);
}
