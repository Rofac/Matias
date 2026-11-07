/* Las cuentas de la plata: saldos, gastos, ingresos, tarjeta en cuotas, gastos fijos y presupuesto. */
'use strict';

const TIPOS_CUENTA = { EFECTIVO: '💵 Efectivo', BANCO: '🏦 Banco', BILLETERA: '📱 Billetera (Mercado Pago, etc.)', AHORRO: '🐷 Ahorro' };
const mesDe = f => String(f || '').slice(0, 7);                                      // 'AAAA-MM'
const sumarMes = (ym, n) => sumarMeses(ym + '-01', n).slice(0, 7);
const nombreMes = ym => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const nombreMesC = ym => `${MESES[+ym.slice(5, 7) - 1].slice(0, 3)} ${ym.slice(2, 4)}`;
const activos = t => DB.donde(t, x => x.estado !== 'ANULADO');
const categorias = () => DB.cfg.categorias || CONFIG_INICIAL.categorias;
const catDe = n => categorias().find(c => c.n === n) || { n: n || 'Otros', e: '📦', tope: 0 };
const cuentasActivas = () => DB.todos('cuentas').filter(c => c.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id);
const tarjetasActivas = () => DB.todos('tarjetas').filter(t => t.activo !== false);
const moneda = c => (c && c.moneda) || 'ARS';
const plata = (n, mon) => mon === 'USD' ? 'US$ ' + (+n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : money(n);
const plata2 = (n, mon) => mon === 'USD' ? 'US$ ' + (+n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money2(n);

function montoOk(v, que = 'el monto') {
  const x = r2(aNum(v));
  if (isNaN(x) || x <= 0) throw new Error('Escribí ' + que);
  if (x > 1e12) throw new Error('Revisá ' + que + ': es demasiado grande');
  return x;
}
const fechaOk = f => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '') || iso(aFecha(f)) !== f) throw new Error('Revisá la fecha'); return f; };

/* ---------------------------------------------------------------- saldos */
function saldo(cid) {
  const c = DB.get('cuentas', cid); if (!c) return 0;
  let s = +c.saldo_inicial || 0;
  for (const m of activos('movimientos')) {
    if (m.cuenta_id === c.id) s += m.tipo === 'INGRESO' || m.tipo === 'AJUSTE' ? m.monto : -m.monto;
    if (m.tipo === 'TRANSFER' && m.cuenta_destino_id === c.id) s += m.monto_destino ?? m.monto;
  }
  return r2(s);
}
function totales() {
  const t = { ARS: 0, USD: 0, disponible: 0, ahorro: 0, ahorroUSD: 0 };
  for (const c of cuentasActivas()) {
    const s = saldo(c.id), mon = moneda(c);
    t[mon] = r2(t[mon] + s);
    if (mon === 'ARS') { if (c.tipo === 'AHORRO') t.ahorro = r2(t.ahorro + s); else t.disponible = r2(t.disponible + s); }
    else t.ahorroUSD = r2(t.ahorroUSD + s);
  }
  return t;
}

/* ---------------------------------------------------------------- tarjeta: en qué mes se paga cada cuota */
function primeraCuota(tarjeta, fecha) {
  // si la compra es después del cierre, entra en el resumen siguiente; el resumen se paga el mes después del cierre
  const d = aFecha(fecha).getDate();
  return sumarMes(mesDe(fecha), (d > (+tarjeta.cierre || 31) ? 1 : 0) + 1);
}
function cuotasDe(c) {
  const n = Math.max(1, +c.cuotas || 1), base = Math.floor(c.total / n * 100) / 100, out = [];
  for (let i = 0; i < n; i++) out.push({ n: i + 1, de: n, mes: sumarMes(c.primera, i), monto: i === n - 1 ? r2(c.total - base * (n - 1)) : base });
  return out;
}
/* lo que hay que pagar de una tarjeta en un mes (todas las cuotas que caen en ese resumen) */
function resumen(tid, ym) {
  const items = [];
  for (const c of activos('compras').filter(x => x.tarjeta_id === +tid)) for (const q of cuotasDe(c)) if (q.mes === ym) items.push(Object.assign({ compra: c }, q));
  const total = r2(items.reduce((s, x) => s + x.monto, 0));
  const pagos = activos('movimientos').filter(m => m.tipo === 'PAGO_TARJETA' && m.tarjeta_id === +tid && m.periodo === ym);
  const pagado = r2(pagos.reduce((s, m) => s + m.monto, 0));
  const t = DB.get('tarjetas', tid), vence = t ? `${ym}-${String(Math.min(+t.vence || 10, 28)).padStart(2, '0')}` : '';
  return { ym, items, total, pagos, pagado, falta: r2(total - pagado), vence };
}
/* lo que queda por pagar en cuotas desde un mes en adelante */
function deudaTarjeta(tid, desde) {
  let s = 0; for (const c of activos('compras').filter(x => tid == null || x.tarjeta_id === +tid)) for (const q of cuotasDe(c)) if (q.mes >= desde) s += q.monto;
  return r2(s);
}

/* ---------------------------------------------------------------- guardar */
async function guardarMovimiento(d, viejo) {
  const tipo = d.tipo;
  if (!['GASTO', 'INGRESO', 'TRANSFER', 'PAGO_TARJETA', 'AJUSTE'].includes(tipo)) throw new Error('Tipo inválido');
  const monto = tipo === 'AJUSTE' ? r2(aNum(d.monto)) : montoOk(d.monto);
  if (tipo === 'AJUSTE' && (isNaN(monto) || !monto)) throw new Error('No hay diferencia para ajustar');
  const c = DB.get('cuentas', d.cuenta_id); if (!c) throw new Error(tipo === 'INGRESO' ? 'Elegí en qué cuenta entró la plata' : 'Elegí de dónde salió la plata');
  const m = Object.assign(viejo || { estado: 'ACTIVO' }, { tipo, fecha: fechaOk(d.fecha || hoy()), monto, cuenta_id: c.id, detalle: String(d.detalle || '').trim().slice(0, 200),
    operacion: String(d.operacion || '').trim().slice(0, 60), adjuntos: d.adjuntos || (viejo && viejo.adjuntos) || [] });
  if (tipo === 'GASTO' || tipo === 'INGRESO') { m.categoria = d.categoria || (tipo === 'GASTO' ? 'Otros' : 'Otros'); }
  if (tipo === 'GASTO') { m.fijo_id = +d.fijo_id || null; m.periodo = m.fijo_id ? (d.periodo || mesDe(m.fecha)) : ''; }
  if (tipo === 'TRANSFER') {
    const dst = DB.get('cuentas', d.cuenta_destino_id); if (!dst) throw new Error('Elegí a qué cuenta pasa la plata');
    if (dst.id === c.id) throw new Error('Elegí dos cuentas distintas');
    m.cuenta_destino_id = dst.id;
    m.monto_destino = moneda(dst) !== moneda(c) ? montoOk(d.monto_destino, 'cuánto recibiste en ' + (moneda(dst) === 'USD' ? 'dólares' : 'pesos')) : monto;
  }
  if (tipo === 'PAGO_TARJETA') { const t = DB.get('tarjetas', d.tarjeta_id); if (!t) throw new Error('Elegí la tarjeta'); m.tarjeta_id = t.id; m.periodo = d.periodo || mesDe(m.fecha); }
  if (m.operacion && !d.forzar) {
    const rep = activos('movimientos').find(x => x.id !== m.id && x.operacion === m.operacion);
    if (rep && !await confirmar(`Ya cargaste un movimiento con el N° de operación <b>${esc(m.operacion)}</b> (${dmy(rep.fecha)}, ${money2(rep.monto)}). ¿Lo guardo igual?`, 'Guardar igual')) throw Object.assign(new Error('No se guardó'), { cancelado: true });
  }
  const g = await DB.guardar('movimientos', m);
  await DB.anotar(viejo ? 'Movimiento modificado' : 'Movimiento cargado', `${tipo} ${dmy(g.fecha)} ${money2(g.monto)} ${g.categoria || ''} ${g.detalle}`);
  return g;
}
async function guardarCompra(d, vieja) {
  const t = DB.get('tarjetas', d.tarjeta_id); if (!t) throw new Error('Elegí la tarjeta');
  const cuotas = d.cuotas === undefined || d.cuotas === '' ? 1 : parseInt(d.cuotas); if (!(cuotas >= 1 && cuotas <= 60)) throw new Error('Las cuotas van de 1 a 60');
  const fecha = fechaOk(d.fecha || hoy());
  const primera = /^\d{4}-\d{2}$/.test(d.primera || '') ? d.primera : primeraCuota(t, fecha);
  const c = Object.assign(vieja || { estado: 'ACTIVO' }, { tarjeta_id: t.id, fecha, total: montoOk(d.monto), cuotas, primera, categoria: d.categoria || 'Otros',
    detalle: String(d.detalle || '').trim().slice(0, 200), operacion: String(d.operacion || '').trim().slice(0, 60), adjuntos: d.adjuntos || (vieja && vieja.adjuntos) || [] });
  const g = await DB.guardar('compras', c);
  await DB.anotar(vieja ? 'Compra con tarjeta modificada' : 'Compra con tarjeta', `${t.nombre} ${dmy(fecha)} ${money2(c.total)} en ${cuotas} cuota(s) ${c.detalle}`);
  return g;
}
async function anular(tabla, id, motivo) {
  const x = DB.get(tabla, id); if (!x || x.estado === 'ANULADO') throw new Error('Ya estaba borrado');
  x.estado = 'ANULADO'; x.anulado = ahora(); x.motivo = motivo || '';
  await DB.guardar(tabla, x);
  await DB.anotar('Borrado', `${tabla} ${dmy(x.fecha)} ${money2(x.monto ?? x.total)} ${x.detalle || ''}`);
}

/* ---------------------------------------------------------------- gastos fijos del mes */
function fijosDelMes(ym) {
  return DB.todos('fijos').filter(f => f.activo !== false && (!f.desde || f.desde <= ym)).map(f => {
    const pagos = activos('movimientos').filter(m => m.tipo === 'GASTO' && m.fijo_id === f.id && m.periodo === ym);
    const vence = `${ym}-${String(Math.min(+f.dia || 10, new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate())).padStart(2, '0')}`;
    return { f, pagos, pagado: r2(pagos.reduce((s, m) => s + m.monto, 0)), hecho: pagos.length > 0, vence, vencido: !pagos.length && vence < hoy() };
  }).sort((a, b) => a.vence.localeCompare(b.vence));
}

/* ---------------------------------------------------------------- el mes: ingresos, gastos (incluye compras con tarjeta) y por categoría */
function mes(ym) {
  const movs = activos('movimientos').filter(m => mesDe(m.fecha) === ym);
  const gastos = movs.filter(m => m.tipo === 'GASTO'), ingresos = movs.filter(m => m.tipo === 'INGRESO');
  const compras = activos('compras').filter(c => mesDe(c.fecha) === ym);
  const porCat = {};
  for (const g of gastos) porCat[g.categoria || 'Otros'] = r2((porCat[g.categoria || 'Otros'] || 0) + g.monto);
  for (const c of compras) porCat[c.categoria || 'Otros'] = r2((porCat[c.categoria || 'Otros'] || 0) + c.total);
  const totIng = r2(ingresos.reduce((s, m) => s + m.monto, 0)), totGas = r2(gastos.reduce((s, m) => s + m.monto, 0) + compras.reduce((s, c) => s + c.total, 0));
  return { ym, movs, gastos, ingresos, compras, porCat, ingreso: totIng, gasto: totGas, enTarjeta: r2(compras.reduce((s, c) => s + c.total, 0)), balance: r2(totIng - totGas) };
}

/* ---------------------------------------------------------------- primera vez */
async function datosIniciales() {
  if (DB.cfg.iniciado) return;
  if (!DB.todos('cuentas').length) {
    await DB.guardar('cuentas', { nombre: 'Efectivo', tipo: 'EFECTIVO', moneda: 'ARS', saldo_inicial: 0, activo: true, orden: 1 });
    await DB.guardar('cuentas', { nombre: 'Banco (sueldo)', tipo: 'BANCO', moneda: 'ARS', saldo_inicial: 0, activo: true, orden: 2 });
    await DB.guardar('cuentas', { nombre: 'Mercado Pago', tipo: 'BILLETERA', moneda: 'ARS', saldo_inicial: 0, activo: true, orden: 3 });
  }
  await DB.setCfg('iniciado', true);
}
