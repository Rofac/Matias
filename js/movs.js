/* Cargar un gasto / ingreso / pase de plata (y compras con tarjeta), verlos y la lista de movimientos. */
'use strict';

const CUOTAS = [1, 2, 3, 4, 5, 6, 9, 10, 12, 18, 24];
function opcionesCuentas(sel, conTarjetas, excepto) {
  const cs = cuentasActivas().filter(c => c.id !== excepto).map(c => `<option value="${c.id}" ${String(sel) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)} · ${plata(saldo(c.id), moneda(c))}</option>`).join('');
  const ts = conTarjetas && tarjetasActivas().length ? `<optgroup label="Tarjeta de crédito">${tarjetasActivas().map(t => `<option value="t${t.id}" ${sel === 't' + t.id ? 'selected' : ''}>💳 ${esc(t.nombre)}</option>`).join('')}</optgroup>` : '';
  return cs + ts;
}

/* pre: { tipo, monto, categoria, detalle, operacion, fecha, archivos:[File], fijo_id, periodo, cuenta_id, tarjeta_id, editar:{tabla, x} } */
function nuevoMov(pre = {}, luego) {
  if (!cuentasActivas().length) return toast('Primero creá una cuenta (Más › Cuentas)', true);
  const ed = pre.editar, x = ed ? ed.x : null;
  let tipo = ed ? (ed.tabla === 'compras' ? 'GASTO' : x.tipo) : (pre.tipo || 'GASTO');
  let cat = x ? x.categoria : pre.categoria || '';
  const fijo = pre.fijo_id ? DB.get('fijos', pre.fijo_id) : null;
  if (fijo && !cat) cat = fijo.categoria;
  const conQue0 = x ? (ed.tabla === 'compras' ? 't' + x.tarjeta_id : x.cuenta_id) : pre.tarjeta_id ? 't' + pre.tarjeta_id : (pre.cuenta_id || (fijo && fijo.cuenta_id) || DB.cfg.ultima_cuenta || cuentasActivas()[0].id);
  const nuevos = [...(pre.archivos || [])], viejos = [...((x && x.adjuntos) || [])];
  const m = modal(ed ? 'Modificar' : fijo ? `Pagar ${esc(fijo.nombre)}` : 'Cargar', `
    <div class="seg ancho" id="nmT" ${ed || fijo ? 'style="display:none"' : ''}>${[['GASTO', 'Gasto'], ['INGRESO', 'Ingreso'], ['TRANSFER', 'Pasar plata']].map(([k, t]) => `<button data-t="${k}" class="${tipo === k ? 'act' : ''}">${t}</button>`).join('')}</div>
    <div class="campo"><label id="nmML">Monto</label>${campoMonto('id="nmM" class="monto grande" autofocus', x ? (x.monto ?? x.total) : pre.monto ?? (fijo && fijo.monto) ?? '')}</div>
    <div id="nmCat"></div>
    <div class="form">
      <div class="campo full" id="nmCQ"><label id="nmCQL">Con qué pagaste</label><select id="nmC"></select></div>
      <div class="campo full" id="nmDst" hidden><label>A qué cuenta</label><select id="nmD"></select></div>
      <div class="campo full" id="nmRec" hidden><label id="nmRecL">Cuánto recibiste</label>${campoMonto('id="nmR"', x && x.monto_destino != null && x.monto_destino !== x.monto ? x.monto_destino : '')}</div>
      <div class="campo full" id="nmCuo" hidden><label>Cuotas</label><div class="fila"><select id="nmQ" style="max-width:120px">${CUOTAS.map(n => `<option ${String(x && x.cuotas || 1) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <span class="chico muted sp" id="nmQI"></span></div>
        <details style="margin-top:6px" ${x && x.primera ? '' : ''}><summary class="chico muted">¿Es una compra vieja que ya venís pagando?</summary>
          <label style="margin-top:8px">La 1ª cuota se pagó / se paga en</label><select id="nmP"></select></details></div>
      <div class="campo"><label>Fecha</label><input type="date" id="nmF" value="${esc(x ? x.fecha : pre.fecha || hoy())}"></div>
      <div class="campo"><label>Detalle (opcional)</label><input id="nmDe" value="${esc(x ? x.detalle : pre.detalle || (fijo ? fijo.nombre : ''))}" placeholder="Ej. Coto, cumple de Juan"></div>
      <div class="campo full"><label>N° de operación (opcional)</label><input id="nmO" value="${esc(x ? x.operacion || '' : pre.operacion || '')}"></div>
    </div>
    <div class="campo"><label>Comprobante (opcional)</label><div class="minis" id="nmA"></div>
      <label class="btn chico" style="margin:6px 0 0">${ico('camara')} Foto o PDF<input type="file" id="nmAF" accept="image/*,application/pdf" multiple hidden></label></div>`,
    `${ed ? `<button class="btn rojo" id="nmB">${ico('trash')}</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="nmOk">${ico('check')} Guardar</button>`, 'ancho');
  const selC = $('#nmC', m), selD = $('#nmD', m);
  const pintarCats = () => {
    if (tipo === 'TRANSFER') { $('#nmCat', m).innerHTML = ''; return; }
    const lista = tipo === 'GASTO' ? categorias().map(c => ({ n: c.n, e: c.e })) : (DB.cfg.categorias_ingreso || []).map(n => ({ n, e: '💰' }));
    if (!lista.some(c => c.n === cat)) cat = tipo === 'INGRESO' ? (lista[0] && lista[0].n) || 'Otros' : cat;
    $('#nmCat', m).innerHTML = `<label>${tipo === 'GASTO' ? 'En qué' : 'Qué es'}</label><div class="cats">${lista.map(c => `<button type="button" data-c="${esc(c.n)}" class="${c.n === cat ? 'act' : ''}"><span>${c.e}</span>${esc(c.n)}</button>`).join('')}</div>`;
  };
  const enTarjeta = () => selC.value.startsWith('t');
  const pintarCuotas = () => {
    const t = enTarjeta() ? DB.get('tarjetas', selC.value.slice(1)) : null;
    $('#nmCuo', m).hidden = !t; if (!t) return;
    const auto = primeraCuota(t, val('nmF', m) || hoy()), n = +$('#nmQ', m).value || 1, tot = n0($('#nmM', m).value);
    const elegida = $('#nmP', m).value || (x && x.primera) || '';
    $('#nmP', m).innerHTML = `<option value="">Automático (${nombreMes(auto)})</option>` + Array.from({ length: 36 }, (_, i) => sumarMes(mesDe(hoy()), 2 - i)).map(ym => `<option value="${ym}" ${ym === elegida ? 'selected' : ''}>${nombreMes(ym)}</option>`).join('');
    const pri = $('#nmP', m).value || auto;
    $('#nmQI', m).textContent = (n > 1 && tot ? `${n} de ${money2(tot / n)} · ` : '') + `1ª cuota: resumen de ${nombreMes(pri)}${n > 1 ? `, última: ${nombreMes(sumarMes(pri, n - 1))}` : ''}`;
  };
  const pintarTipo = () => {
    $$('#nmT button', m).forEach(b => b.classList.toggle('act', b.dataset.t === tipo));
    const ant = selC.value || conQue0;
    $('#nmCQL', m).textContent = tipo === 'GASTO' ? 'Con qué pagaste' : tipo === 'INGRESO' ? 'En qué cuenta entró' : 'Desde qué cuenta';
    selC.innerHTML = opcionesCuentas(ant, tipo === 'GASTO' && (!ed || ed.tabla === 'compras'));
    if (ed && ed.tabla === 'compras') selC.innerHTML = tarjetasActivas().map(t => `<option value="t${t.id}" ${'t' + t.id === String(ant) ? 'selected' : ''}>💳 ${esc(t.nombre)}</option>`).join('');
    if (ed && ed.tabla !== 'compras' && tipo === 'GASTO') selC.innerHTML = opcionesCuentas(ant, false);
    $('#nmDst', m).hidden = tipo !== 'TRANSFER';
    if (tipo === 'TRANSFER') selD.innerHTML = opcionesCuentas(x ? x.cuenta_destino_id : selD.value, false, +selC.value);
    pintarCats(); pintarCuotas(); pintarRecibe();
  };
  const pintarRecibe = () => {
    const o = DB.get('cuentas', selC.value), d = DB.get('cuentas', selD.value);
    const dif = tipo === 'TRANSFER' && o && d && moneda(o) !== moneda(d);
    $('#nmRec', m).hidden = !dif;
    if (dif) $('#nmRecL', m).textContent = moneda(d) === 'USD' ? 'Cuántos dólares recibiste' : 'Cuántos pesos recibiste';
    $('#nmML', m).textContent = tipo === 'TRANSFER' && o ? `Monto (${moneda(o) === 'USD' ? 'dólares' : 'pesos'} que salen)` : 'Monto';
  };
  const pintarAdj = () => {
    $('#nmA', m).innerHTML = [...viejos.map((k, i) => `<div class="mini-w"><img class="mini" data-arch="${esc(k)}" data-ver="${esc(k)}" alt=""><button type="button" class="ib" data-qv="${i}">${ico('x')}</button></div>`),
      ...nuevos.map((f, i) => `<div class="mini-w"><div class="mini ${esPdf(f) ? 'pdf' : ''}" data-nf="${i}">${esPdf(f) ? 'PDF' : ''}</div><button type="button" class="ib" data-qn="${i}">${ico('x')}</button></div>`)].join('');
    pintarMiniaturas($('#nmA', m));
    nuevos.forEach((f, i) => { if (!esPdf(f)) { const el = $(`[data-nf="${i}"]`, m); const u = URL.createObjectURL(f); el.style.backgroundImage = `url(${u})`; } });
  };
  pintarTipo(); pintarAdj();
  $('#nmT', m).onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; tipo = b.dataset.t; pintarTipo(); };
  $('#nmCat', m).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; $$('#nmCat [data-c]', m).forEach(y => y.classList.toggle('act', y === b)); };
  selC.onchange = () => { if (tipo === 'TRANSFER') selD.innerHTML = opcionesCuentas(selD.value, false, +selC.value); pintarCuotas(); pintarRecibe(); };
  selD.onchange = pintarRecibe;
  ['nmQ', 'nmP', 'nmF'].forEach(id => $('#' + id, m).addEventListener('change', pintarCuotas));
  $('#nmM', m).addEventListener('input', pintarCuotas);
  $('#nmAF', m).onchange = e => { nuevos.push(...e.target.files); e.target.value = ''; pintarAdj(); };
  $('#nmA', m).onclick = e => { const a = e.target.closest('[data-qv]'), b = e.target.closest('[data-qn]'); if (a) { viejos.splice(+a.dataset.qv, 1); pintarAdj(); } if (b) { nuevos.splice(+b.dataset.qn, 1); pintarAdj(); } };
  if (ed) $('#nmB', m).onclick = async () => { if (!await confirmar('¿Borrar este movimiento?', 'Borrar', true)) return; try { await anular(ed.tabla, x.id); m.cerrar(); toast('Borrado'); luego && luego(); } catch (er) { fallo(er); } };
  $('#nmOk', m).onclick = async () => {
    try {
      if (tipo === 'GASTO' && !cat) throw new Error('Elegí en qué gastaste');
      montoOk($('#nmM', m).value);
      const adj = [...viejos]; for (const f of nuevos) adj.push(await guardarComprobante(f));
      const d = { tipo, monto: $('#nmM', m).value, categoria: cat, fecha: val('nmF', m), detalle: val('nmDe', m), operacion: val('nmO', m), adjuntos: adj, fijo_id: fijo ? fijo.id : x && x.fijo_id, periodo: pre.periodo || (x && x.periodo) };
      let g;
      if (tipo === 'GASTO' && enTarjeta()) {
        if (ed && ed.tabla !== 'compras') throw new Error('Para pasar este gasto a la tarjeta, borralo y cargalo de nuevo');
        g = await guardarCompra(Object.assign(d, { tarjeta_id: selC.value.slice(1), cuotas: $('#nmQ', m).value, primera: $('#nmP', m).value }), ed ? x : null);
      } else {
        g = await guardarMovimiento(Object.assign(d, { cuenta_id: selC.value, cuenta_destino_id: selD.value, monto_destino: $('#nmR', m).value }), ed ? x : null);
        await DB.setCfg('ultima_cuenta', +selC.value);
      }
      for (const k of (x && x.adjuntos || [])) if (!adj.includes(k)) DB.borrarArchivo(k);
      m.cerrar(); toast('Guardado'); luego && luego(g);
      avisoPresupuesto(tipo === 'GASTO' ? cat : null);
    } catch (er) { if (!er.cancelado) fallo(er); }
  };
}
function avisoPresupuesto(cat) {
  const c = cat && catDe(cat); if (!c || !c.tope) return;
  const g = mes(mesDe(hoy())).porCat[cat] || 0;
  if (g > c.tope) setTimeout(() => toast(`Ojo: en ${cat} ya gastaste ${money(g)} este mes (tu tope es ${money(c.tope)})`, true), 1200);
  else if (g > c.tope * 0.8) setTimeout(() => toast(`En ${cat} ya usaste el ${Math.round(g * 100 / c.tope)}% de tu tope del mes`), 1200);
}

/* ---------- ver uno ---------- */
function verItem(tabla, id, luego) {
  const x = DB.get(tabla, id); if (!x) return;
  const c = DB.get('cuentas', x.cuenta_id), d = DB.get('cuentas', x.cuenta_destino_id), t = DB.get('tarjetas', x.tarjeta_id), f = DB.get('fijos', x.fijo_id);
  const titulo = tabla === 'compras' ? `💳 Compra con ${esc(t ? t.nombre : 'tarjeta')}` : { GASTO: `${catDe(x.categoria).e} ${esc(x.categoria)}`, INGRESO: `💰 ${esc(x.categoria)}`, TRANSFER: '🔁 Pase de plata', PAGO_TARJETA: `💳 Pago de ${esc(t ? t.nombre : 'tarjeta')}`, AJUSTE: '⚖️ Ajuste de saldo' }[x.tipo];
  const filas = [['Fecha', dmy(x.fecha)], ['Monto', `<b style="font-size:20px">${plata2(x.monto ?? x.total, moneda(c))}</b>`],
    tabla === 'compras' ? ['Cuotas', cuotasDe(x).map(q => `${q.n}/${q.de} ${nombreMesC(q.mes)}: ${money2(q.monto)}`).join('<br>')] : null,
    tabla === 'compras' ? ['Categoría', `${catDe(x.categoria).e} ${esc(x.categoria)}`] : null,
    c ? [x.tipo === 'INGRESO' ? 'Entró en' : 'Salió de', esc(c.nombre)] : null, d ? ['Pasó a', `${esc(d.nombre)}${x.monto_destino !== x.monto ? ' · ' + plata2(x.monto_destino, moneda(d)) : ''}`] : null,
    x.periodo && x.tipo === 'PAGO_TARJETA' ? ['Resumen', nombreMes(x.periodo)] : null, f ? ['Gasto fijo', `${esc(f.nombre)} (${nombreMes(x.periodo)})`] : null,
    x.detalle ? ['Detalle', esc(x.detalle)] : null, x.operacion ? ['N° de operación', esc(x.operacion)] : null, x.estado === 'ANULADO' ? ['Estado', '<b class="mal">BORRADO</b>'] : null].filter(Boolean);
  const m = modal(titulo, `<table class="t">${filas.map(([a, b]) => `<tr><td class="muted">${a}</td><td class="r">${b}</td></tr>`).join('')}</table>
    ${(x.adjuntos || []).length ? `<div class="minis" style="margin-top:12px">${x.adjuntos.map(k => `<img class="mini" data-arch="${esc(k)}" data-ver="${esc(k)}" alt="">`).join('')}</div>` : ''}`,
    `${x.estado !== 'ANULADO' ? `<button class="btn rojo" id="viB">${ico('trash')} Borrar</button>${['GASTO', 'INGRESO', 'TRANSFER'].includes(x.tipo) || tabla === 'compras' ? `<button class="btn" id="viE">${ico('lapiz')} Modificar</button>` : ''}` : ''}<button class="btn pri" data-cerrar>Listo</button>`);
  pintarMiniaturas(m);
  if ($('#viB', m)) $('#viB', m).onclick = async () => { if (!await confirmar('¿Borrar este movimiento? Se descuenta de los saldos e informes.', 'Borrar', true)) return; try { await anular(tabla, x.id); m.cerrar(); toast('Borrado'); luego ? luego() : recargar(); } catch (e) { fallo(e); } };
  if ($('#viE', m)) $('#viE', m).onclick = () => { m.cerrar(); nuevoMov({ editar: { tabla, x } }, luego || recargar); };
}

/* ---------- una fila de la lista ---------- */
function filaMov(it) {
  const x = it.x, c = DB.get('cuentas', x.cuenta_id);
  if (it.tabla === 'compras') { const t = DB.get('tarjetas', x.tarjeta_id);
    return `<div class="it" data-it="compras:${x.id}"><div class="av em">${catDe(x.categoria).e}</div><div class="tx"><b>${esc(x.detalle || x.categoria)}</b><small>💳 ${esc(t ? t.nombre : '')}${x.cuotas > 1 ? ` · ${x.cuotas} cuotas de ${money(x.total / x.cuotas)}` : ''}${(x.adjuntos || []).length ? ' · 📎' : ''}</small></div><b class="num mal">− ${money(x.total)}</b></div>`; }
  const ing = x.tipo === 'INGRESO' || (x.tipo === 'AJUSTE' && x.monto > 0);
  const em = x.tipo === 'GASTO' ? catDe(x.categoria).e : x.tipo === 'INGRESO' ? '💰' : x.tipo === 'TRANSFER' ? '🔁' : x.tipo === 'PAGO_TARJETA' ? '💳' : '⚖️';
  const tit = x.tipo === 'TRANSFER' ? `${esc(c ? c.nombre : '')} → ${esc(DB.get('cuentas', x.cuenta_destino_id)?.nombre || '')}` : x.tipo === 'PAGO_TARJETA' ? `Pago ${esc(DB.get('tarjetas', x.tarjeta_id)?.nombre || 'tarjeta')} (${nombreMesC(x.periodo)})` : x.tipo === 'AJUSTE' ? 'Ajuste de saldo' : esc(x.detalle || x.categoria);
  const sub = x.tipo === 'TRANSFER' ? (x.detalle ? esc(x.detalle) : 'Pase de plata') : `${x.tipo === 'GASTO' || x.tipo === 'INGRESO' ? esc(x.categoria) + ' · ' : ''}${esc(c ? c.nombre : '')}`;
  return `<div class="it" data-it="movimientos:${x.id}"><div class="av em">${em}</div><div class="tx"><b>${tit}</b><small>${sub}${(x.adjuntos || []).length ? ' · 📎' : ''}</small></div>
    <b class="num ${x.tipo === 'TRANSFER' ? '' : ing ? 'ok' : 'mal'}">${x.tipo === 'TRANSFER' ? '' : ing ? '+ ' : '− '}${plata(Math.abs(x.monto), moneda(c))}</b></div>`;
}
function abrirFila(e, luego) { const b = e.target.closest('[data-it]'); if (!b) return false; const [t, id] = b.dataset.it.split(':'); verItem(t, +id, luego); return true; }

/* ---------- pantalla Movimientos ---------- */
let MES_MOV = null, FIL_MOV = 'todos', BUS_MOV = '';
PANTALLAS.movimientos = async (main) => {
  titulo('Movimientos');
  const ym = MES_MOV || mesDe(hoy());
  main.innerHTML = `<div class="fila" style="margin-bottom:10px"><button class="ib" id="mvA" style="transform:scaleX(-1)">${ico('flecha')}</button><b class="sp" style="text-align:center;font-size:18px;text-transform:capitalize">${nombreMes(ym)}</b><button class="ib" id="mvS">${ico('flecha')}</button></div>
    <div class="buscar" style="margin-bottom:10px">${ico('buscar')}<input id="mvB" placeholder="Buscar (detalle, monto, N° de operación)" value="${esc(BUS_MOV)}" autocomplete="off"></div>
    <div class="seg" id="mvF" style="margin-bottom:12px">${[['todos', 'Todo'], ['GASTO', 'Gastos'], ['INGRESO', 'Ingresos'], ['TARJETA', 'Tarjeta'], ['OTROS', 'Otros']].map(([k, t]) => `<button data-f="${k}" class="${FIL_MOV === k ? 'act' : ''}">${t}</button>`).join('')}</div>
    <div id="mvRes"></div><div id="mvL"></div>`;
  const pintar = () => {
    let l = [...activos('movimientos').filter(x => mesDe(x.fecha) === ym).map(x => ({ tabla: 'movimientos', x })), ...activos('compras').filter(x => mesDe(x.fecha) === ym).map(x => ({ tabla: 'compras', x }))];
    if (BUS_MOV.trim()) { const q = BUS_MOV.trim(), n = aNum(q);
      l = [...activos('movimientos').map(x => ({ tabla: 'movimientos', x })), ...activos('compras').map(x => ({ tabla: 'compras', x }))]
        .filter(({ x }) => coincide(`${x.detalle || ''} ${x.categoria || ''} ${x.operacion || ''}`, q) || (n > 0 && Math.abs((x.monto ?? x.total) - n) < 1)); }
    if (FIL_MOV === 'GASTO') l = l.filter(i => i.x.tipo === 'GASTO');
    if (FIL_MOV === 'INGRESO') l = l.filter(i => i.x.tipo === 'INGRESO');
    if (FIL_MOV === 'TARJETA') l = l.filter(i => i.tabla === 'compras' || i.x.tipo === 'PAGO_TARJETA');
    if (FIL_MOV === 'OTROS') l = l.filter(i => ['TRANSFER', 'PAGO_TARJETA', 'AJUSTE'].includes(i.x.tipo));
    l.sort((a, b) => b.x.fecha.localeCompare(a.x.fecha) || (b.x.creado || '').localeCompare(a.x.creado || ''));
    const r = mes(ym);
    $('#mvRes').innerHTML = BUS_MOV.trim() ? `<p class="muted chico">${l.length} resultado(s) en todos los meses</p>` : `<div class="kpis tres"><div class="kpi"><small>Entró</small><b class="ok">${money(r.ingreso)}</b></div>
      <div class="kpi"><small>Gastaste</small><b class="mal">${money(r.gasto)}</b><div class="sub">${r.enTarjeta ? 'con tarjeta ' + money(r.enTarjeta) : ''}</div></div><div class="kpi"><small>Te quedó</small><b class="${r.balance < 0 ? 'mal' : 'ok'}">${money(r.balance)}</b></div></div>`;
    let dia = '', html = '';
    for (const i of l) { if (i.x.fecha !== dia) { dia = i.x.fecha; html += `<div class="dia">${fechaLarga(dia)}${BUS_MOV.trim() ? ' ' + dia.slice(0, 4) : ''}</div>`; } html += filaMov(i); }
    $('#mvL').innerHTML = `<div class="card" style="padding:4px 14px"><div class="lista">${html || vacio('caja', 'No hay movimientos. Tocá "+ Gasto" para cargar el primero.')}</div></div>`;
  };
  pintar();
  $('#mvA').onclick = () => { MES_MOV = sumarMes(ym, -1); PANTALLAS.movimientos(main); };
  $('#mvS').onclick = () => { MES_MOV = sumarMes(ym, 1); PANTALLAS.movimientos(main); };
  $('#mvB').oninput = debounce(e => { BUS_MOV = e.target.value; pintar(); }, 200);
  $('#mvF').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; FIL_MOV = b.dataset.f; $$('#mvF button').forEach(y => y.classList.toggle('act', y === b)); pintar(); };
  main.onclick = e => abrirFila(e, () => PANTALLAS.movimientos(main));
};
