/* .zip mínimo: crea (sin comprimir) y lee (sin comprimir o "deflate", como los que arma la PC con Python). */
'use strict';
const ZIP = (() => {
  const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  function crear(entradas) {
    const partes = [], central = []; let off = 0;
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const e of entradas) {
      const n = enc.encode(e.nombre), datos = e.datos instanceof Uint8Array ? e.datos : new Uint8Array(e.datos), crc = crc32(datos);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, hora, true); h.setUint16(12, dia, true);
      h.setUint32(14, crc, true); h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      partes.push(h.buffer, n, datos);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true);
      c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, n);
      off += 30 + n.length + datos.length;
    }
    const tamC = central.reduce((s, x) => s + (x.byteLength ?? x.length), 0);
    const f = new DataView(new ArrayBuffer(22));
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, entradas.length, true); f.setUint16(10, entradas.length, true); f.setUint32(12, tamC, true); f.setUint32(16, off, true);
    return new Blob([...partes, ...central, f.buffer], { type: 'application/zip' });
  }
  async function inflar(b) {
    const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function leer(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), v = new DataView(buf.buffer);
    let i = buf.length - 22; while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('El .zip está dañado');
    const n = v.getUint16(i + 10, true); let p = v.getUint32(i + 16, true); const out = [];
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('El .zip está dañado');
      const metodo = v.getUint16(p + 10, true), comp = v.getUint32(p + 20, true), ln = v.getUint16(p + 28, true), lx = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true);
      const nombre = dec.decode(buf.subarray(p + 46, p + 46 + ln)).replace(/\\/g, '/');
      const ini = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true), cruda = buf.subarray(ini, ini + comp);
      if (!nombre.endsWith('/')) out.push({ nombre, datos: async () => metodo === 0 ? cruda.slice() : metodo === 8 ? inflar(cruda) : Promise.reject(new Error('Compresión no soportada en ' + nombre)) });
      p += 46 + ln + lx + lc;
    }
    return out;
  }
  return { crear, leer };
})();
