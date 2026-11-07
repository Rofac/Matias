/* Cuentas (efectivo, banco, billeteras, ahorros, dólares), tarjetas de crédito y gastos fijos. */
'use strict';

PANTALLAS.cuentas = async (main) => {
  titulo('Cuentas');
  const tot = totales(), todas = DB.todos('cuentas').slice().sort((a, b) => (a.activo === false) - (b.activo === false) || (a.orden || 0) - (b.orden || 0));
  main.innerHTML = `<div class="kpis tres"><div class="kpi oscuro"><small>Disponible</small><b>${money(tot.disponible)}</b></div><div class="kpi"><small>Ahorro en pesos</small><b>${money(tot.ahorro)}</b></div>
      <div class="kpi"><small>Dólares</small><b>${plata(tot.USD, 'USD')}</b>${DB.cfg.cotizacion_usd > 0 && tot.USD ? `<div class="sub">≈ ${money(tot.USD * DB.cfg.cotizacion_usd)}</div>` : ''}</div></div>
    <div class="fila" style="margin-bottom:12px"><button class="btn acento" id="cuN">${ico('plus')} Cuenta</button><button class="btn" id="cuT">🔁 Pasar plata / comprar dólares</button></div>
    <div class="card" style="padding:6px 14px"><div class="lista">${todas.map(c => `<div class="it" data-cu="${c.id}" style="${c.activo === false ? 'opacity:.5' : ''}"><div class="av em">${(TIPOS_CUENTA[c.tipo] || '💵').split(' ')[0]}</div>
      <div class="tx"><b>${esc(c.nombre)}</b><small>${(TIPOS_CUENTA[c.tipo] || '').slice(3)}${moneda(c) === 'USD' ? ' · en dólares' : ''}${c.activo === false ? ' · no se usa' : ''}</small></div>
      <b class="num ${saldo(c.id) < 0 ? 'mal' : ''}">${plata(saldo(c.id), moneda(c))}</b></div>`).join('')}</div></div>
    <p class="muted chico">Tocá una cuenta para ver sus movimientos, corregir el saldo o cambiarle el nombre.</p>`;
  const re = () => PANTALLAS.cuentas(main);
  $('#cuN').onclick = () => editarCuenta({}, re);
  $('#cuT').onclick = () => nuevoMov({ tipo: 'TRANSFER' }, re);
  main.onclick = e => { const b = e.target.closest('[data-cu]'); if (b) verCuenta(+b.dataset.cu, re); };
};
function verCuenta(id, luego) {
  const c = DB.get('cuentas', id), s = saldo(id);
  const movs = activos('movimientos').filter(m => m.cuenta_id === id || m.cuenta_destino_id === id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).slice(0, 60);
  const m = modal(`${(TIPOS_CUENTA[c.tipo] || '💵').split(' ')[0]} ${esc(c.nombre)}`, `<div style="font-size:28px;font-weight:900;margin-bottom:10px">${plata2(s, moneda(c))}</div>
    <div class="fila" style="margin-bottom:12px"><button class="btn" id="vcAj">⚖️ Corregir saldo</button><button class="btn" id="vcEd">${ico('lapiz')} Modificar</button></div>
    <div class="lista">${movs.map(x => { if (x.tipo === 'TRANSFER' && x.cuenta_destino_id === id) return filaMov({ tabla: 'movimientos', x: Object.assign({}, x, { tipo: 'INGRESO', categoria: 'Pase de ' + (DB.get('cuentas', x.cuenta_id)?.nombre || ''), monto: x.monto_destino ?? x.monto, cuenta_id: id }) }).replace(/data-it="[^"]*"/, '');
      return filaMov({ tabla: 'movimientos', x }).replace(/data-it="[^"]*"/, ''); }).join('') || vacio('caja', 'Sin movimientos')}</div>`, '<button class="btn pri" data-cerrar>Listo</button>', 'ancho');
  $('#vcEd', m).onclick = () => { m.cerrar(); editarCuenta(c, luego); };
  $('#vcAj', m).onclick = async () => {
    const v = await pedirTexto('Corregir saldo', `¿Cuánta plata hay de verdad en ${esc(c.nombre)}? (la app anota la diferencia como ajuste)`, fmtIn(s)); if (v === null) return;
    const real = aNum(v); if (isNaN(real)) return toast('Revisá el número', true);
    try { await guardarMovimiento({ tipo: 'AJUSTE', monto: r2(real - s), cuenta_id: id, fecha: hoy(), detalle: `Saldo corregido a ${plata2(real, moneda(c))}` }); m.cerrar(); toast('Saldo corregido'); luego(); } catch (e) { fallo(e); }
  };
}
function editarCuenta(c, luego) {
  const usada = c.id && activos('movimientos').some(x => x.cuenta_id === c.id || x.cuenta_destino_id === c.id);
  const m = modal(c.id ? 'Modificar cuenta' : 'Nueva cuenta', `<div class="form">
      <div class="campo full"><label>Nombre</label><input id="ecN" value="${esc(c.nombre || '')}" placeholder="Ej. Banco Nación, Ualá, Caja de ahorro en dólares" autofocus></div>
      <div class="campo"><label>Tipo</label><select id="ecT">${Object.entries(TIPOS_CUENTA).map(([k, t]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label>Moneda</label><select id="ecM" ${usada ? 'disabled' : ''}><option value="ARS">Pesos</option><option value="USD" ${moneda(c) === 'USD' ? 'selected' : ''}>Dólares</option></select></div>
      ${c.id ? '' : `<div class="campo full"><label>Cuánta plata tiene hoy</label>${campoMonto('id="ecS"', '')}</div>`}
      ${c.id ? `<div class="campo full"><label class="chk"><input type="checkbox" id="ecA" ${c.activo !== false ? 'checked' : ''}> La uso (si la destildás, no aparece para cargar)</label></div>` : ''}</div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="ecOk">${ico('check')} Guardar</button>`);
  $('#ecOk', m).onclick = async () => { try {
    const nombre = val('ecN', m); if (!nombre) throw new Error('Poné el nombre');
    if (DB.todos('cuentas').some(x => x.id !== c.id && normal(x.nombre) === normal(nombre))) throw new Error('Ya hay una cuenta con ese nombre');
    const nueva = !c.id;
    Object.assign(c, { nombre, tipo: val('ecT', m), moneda: usada ? moneda(c) : val('ecM', m), activo: nueva ? true : $('#ecA', m).checked });
    if (nueva) { const s = aNum($('#ecS', m).value); c.saldo_inicial = isNaN(s) ? 0 : r2(s); c.orden = DB.todos('cuentas').length + 1; }
    if (!c.activo && saldo(c.id) && !await confirmar(`Esa cuenta todavía tiene ${plata(saldo(c.id), moneda(c))}. ¿Dejar de usarla igual?`, 'Sí')) return;
    await DB.guardar('cuentas', c); await DB.anotar(nueva ? 'Cuenta nueva' : 'Cuenta modificada', nombre); m.cerrar(); toast('Guardado'); luego && luego();
  } catch (e) { fallo(e); } };
}

/* ---------------------------------------------------------------- tarjetas */
let MES_TAR = null;
PANTALLAS.tarjetas = async (main) => {
  titulo('Tarjetas');
  const ym = MES_TAR || mesDe(hoy()), ts = DB.todos('tarjetas').filter(t => t.activo !== false);
  main.innerHTML = `<div class="fila" style="margin-bottom:12px"><button class="btn acento" id="taC">${ico('plus')} Compra con tarjeta</button><button class="btn" id="taN">${ico('plus')} Tarjeta</button></div>
    ${ts.length ? `<div class="fila" style="margin-bottom:10px"><button class="ib" id="taA" style="transform:scaleX(-1)">${ico('flecha')}</button><b class="sp" style="text-align:center;font-size:17px">Resumen de ${nombreMes(ym)}</b><button class="ib" id="taS">${ico('flecha')}</button></div>` : ''}
    ${ts.map(t => { const r = resumen(t.id, ym), prox = [1, 2, 3].map(i => resumen(t.id, sumarMes(ym, i)));
      return `<div class="card"><h2>💳 ${esc(t.nombre)}<span class="sp"></span><button class="btn chico" data-et="${t.id}">${ico('lapiz')}</button></h2>
        <div class="muted chico" style="margin:-6px 0 10px">Cierra el ${t.cierre} · vence el ${t.vence}</div>
        <div class="fila"><div class="sp"><small class="muted">A pagar (vence ${dm(r.vence)})</small><div style="font-size:26px;font-weight:900" class="${r.falta > 0.009 && r.vence < hoy() ? 'mal' : ''}">${money2(r.falta > 0 ? r.falta : 0)}</div>
          <div class="chico muted">Total del resumen ${money2(r.total)}${r.pagado ? ` · pagaste ${money2(r.pagado)}` : ''}</div></div>${r.falta > 0.009 ? `<button class="btn acento" data-pt="${t.id}">Pagar</button>` : r.total ? '<span class="pill ok">Pagado ✓</span>' : ''}</div>
        ${r.items.length ? `<details style="margin-top:10px"><summary class="chico">Qué hay en este resumen (${r.items.length})</summary><div class="lista">${r.items.map(q => `<div class="it" data-it="compras:${q.compra.id}"><div class="av em">${catDe(q.compra.categoria).e}</div>
          <div class="tx"><b>${esc(q.compra.detalle || q.compra.categoria)}</b><small>${dmy(q.compra.fecha)}${q.de > 1 ? ` · cuota ${q.n} de ${q.de}` : ''}</small></div><b class="num">${money2(q.monto)}</b></div>`).join('')}</div></details>` : ''}
        <div class="prox">${prox.map(p => `<div><small>${nombreMesC(p.ym)}</small><b>${money(Math.round(p.total))}</b></div>`).join('')}<div><small>Deuda total</small><b>${money(Math.round(deudaTarjeta(t.id, ym) - r.pagado))}</b></div></div></div>`; }).join('')
      || `<div class="card">${vacio('caja', 'No cargaste tarjetas. Tocá "+ Tarjeta" y poné el día de cierre y de vencimiento.')}</div>`}`;
  const re = () => PANTALLAS.tarjetas(main);
  $('#taN').onclick = () => editarTarjeta({}, re);
  $('#taC').onclick = () => { if (!ts.length) return toast('Primero agregá la tarjeta', true); nuevoMov({ tipo: 'GASTO', tarjeta_id: ts[0].id }, re); };
  if ($('#taA')) { $('#taA').onclick = () => { MES_TAR = sumarMes(ym, -1); re(); }; $('#taS').onclick = () => { MES_TAR = sumarMes(ym, 1); re(); }; }
  main.onclick = e => {
    const et = e.target.closest('[data-et]'); if (et) return editarTarjeta(DB.get('tarjetas', et.dataset.et), re);
    const pt = e.target.closest('[data-pt]'); if (pt) return pagarTarjeta(+pt.dataset.pt, ym, re);
    abrirFila(e, re);
  };
};
function editarTarjeta(t, luego) {
  const m = modal(t.id ? 'Modificar tarjeta' : 'Nueva tarjeta', `<div class="form">
      <div class="campo full"><label>Nombre</label><input id="etN" value="${esc(t.nombre || '')}" placeholder="Ej. Visa Galicia, Naranja" autofocus></div>
      <div class="campo"><label>Día de cierre</label><input id="etC" inputmode="numeric" value="${esc(t.cierre || '')}" placeholder="Ej. 25"></div>
      <div class="campo"><label>Día de vencimiento</label><input id="etV" inputmode="numeric" value="${esc(t.vence || '')}" placeholder="Ej. 6"></div>
      <p class="muted chico full" style="margin:0">Lo que comprás después del cierre entra en el resumen del mes siguiente. Los días los ves en el resumen de la tarjeta.</p>
      ${t.id ? `<div class="campo full"><label class="chk"><input type="checkbox" id="etA" ${t.activo !== false ? 'checked' : ''}> La uso</label></div>` : ''}</div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="etOk">${ico('check')} Guardar</button>`);
  $('#etOk', m).onclick = async () => { try {
    const nombre = val('etN', m), c = parseInt(val('etC', m)), v = parseInt(val('etV', m));
    if (!nombre) throw new Error('Poné el nombre'); if (!(c >= 1 && c <= 31) || !(v >= 1 && v <= 31)) throw new Error('Los días van del 1 al 31');
    Object.assign(t, { nombre, cierre: c, vence: v, activo: t.id ? $('#etA', m).checked : true });
    await DB.guardar('tarjetas', t); await DB.anotar('Tarjeta guardada', nombre); m.cerrar(); toast('Guardado'); luego && luego();
  } catch (e) { fallo(e); } };
}
function pagarTarjeta(tid, ym, luego) {
  const t = DB.get('tarjetas', tid), r = resumen(tid, ym);
  const m = modal(`Pagar ${esc(t.nombre)}`, `<p style="margin-top:0">Resumen de <b>${nombreMes(ym)}</b>: ${money2(r.total)}${r.pagado ? ` · ya pagaste ${money2(r.pagado)}` : ''}</p>
    <div class="campo"><label>Cuánto pagás</label>${campoMonto('id="ptM" class="monto grande"', r.falta > 0 ? r.falta : '')}</div>
    <div class="form"><div class="campo"><label>Desde qué cuenta</label><select id="ptC">${opcionesCuentas(DB.cfg.ultima_cuenta, false)}</select></div>
      <div class="campo"><label>Fecha</label><input type="date" id="ptF" value="${hoy()}"></div></div>
    <p class="muted chico">El pago de la tarjeta no cuenta como gasto (los gastos ya se anotaron cuando compraste); sólo descuenta la plata de la cuenta.</p>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="ptOk">${ico('check')} Pagar</button>`);
  $('#ptOk', m).onclick = async () => { try { await guardarMovimiento({ tipo: 'PAGO_TARJETA', tarjeta_id: tid, periodo: ym, monto: $('#ptM', m).value, cuenta_id: val('ptC', m), fecha: val('ptF', m) }); m.cerrar(); toast('Pago anotado'); luego && luego(); } catch (e) { if (!e.cancelado) fallo(e); } };
}

/* ---------------------------------------------------------------- gastos fijos */
let MES_FIJ = null;
PANTALLAS.fijos = async (main) => {
  titulo('Gastos fijos');
  const ym = MES_FIJ || mesDe(hoy()), l = fijosDelMes(ym), falta = l.filter(x => !x.hecho);
  main.innerHTML = `<div class="fila" style="margin-bottom:10px"><button class="ib" id="fiA" style="transform:scaleX(-1)">${ico('flecha')}</button><b class="sp" style="text-align:center;font-size:18px;text-transform:capitalize">${nombreMes(ym)}</b><button class="ib" id="fiS">${ico('flecha')}</button></div>
    <div class="kpis tres"><div class="kpi"><small>Pagados</small><b class="ok">${l.length - falta.length}/${l.length}</b></div><div class="kpi"><small>Pagaste</small><b>${money(l.reduce((s, x) => s + x.pagado, 0))}</b></div>
      <div class="kpi"><small>Falta (aprox.)</small><b class="${falta.some(x => x.vencido) ? 'mal' : ''}">${money(falta.reduce((s, x) => s + (+x.f.monto || 0), 0))}</b></div></div>
    <div class="fila" style="margin-bottom:12px"><button class="btn acento" id="fiN">${ico('plus')} Gasto fijo</button></div>
    <div class="card" style="padding:6px 14px"><div class="lista">${l.map(x => `<div class="it" data-fi="${x.f.id}"><div class="av em">${catDe(x.f.categoria).e}</div><div class="tx"><b>${esc(x.f.nombre)}</b>
      <small class="${x.vencido ? 'mal' : ''}">${x.hecho ? `Pagado ${money2(x.pagado)} el ${dm(x.pagos[0].fecha)}` : `${x.vencido ? 'Venció' : 'Vence'} el ${dm(x.vence)}${x.f.monto ? ' · aprox. ' + money(x.f.monto) : ''}`}</small></div>
      ${x.hecho ? '<span class="pill ok">✓</span>' : `<button class="btn chico acento" data-pf="${x.f.id}">Pagar</button>`}</div>`).join('')
      || vacio('reloj', 'Cargá lo que pagás todos los meses: alquiler, luz, gas, internet, celular, cuota del auto, gimnasio…')}</div></div>
    <p class="muted chico">Al tocar "Pagar" se carga como gasto. Si un mes sale distinto, cambiás el monto en ese momento.</p>`;
  const re = () => PANTALLAS.fijos(main);
  $('#fiA').onclick = () => { MES_FIJ = sumarMes(ym, -1); re(); }; $('#fiS').onclick = () => { MES_FIJ = sumarMes(ym, 1); re(); };
  $('#fiN').onclick = () => editarFijo({}, re);
  main.onclick = e => {
    const pf = e.target.closest('[data-pf]'); if (pf) return nuevoMov({ tipo: 'GASTO', fijo_id: +pf.dataset.pf, periodo: ym, fecha: ym === mesDe(hoy()) ? hoy() : ym < mesDe(hoy()) ? fijosDelMes(ym).find(x => x.f.id === +pf.dataset.pf).vence : hoy() }, re);
    const fi = e.target.closest('[data-fi]'); if (fi) { const x = l.find(y => y.f.id === +fi.dataset.fi); return x.hecho ? verItem('movimientos', x.pagos[0].id, re) : editarFijo(x.f, re); }
  };
};
function editarFijo(f, luego) {
  const m = modal(f.id ? 'Modificar gasto fijo' : 'Nuevo gasto fijo', `<div class="form">
      <div class="campo full"><label>Qué es</label><input id="efN" value="${esc(f.nombre || '')}" placeholder="Ej. Alquiler, Luz, Internet, Cuota auto" autofocus></div>
      <div class="campo"><label>Monto aproximado</label>${campoMonto('id="efM"', f.monto ?? '')}</div>
      <div class="campo"><label>Día que vence</label><input id="efD" inputmode="numeric" value="${esc(f.dia || '')}" placeholder="Ej. 10"></div>
      <div class="campo"><label>Categoría</label><select id="efC">${categorias().map(c => `<option ${c.n === (f.categoria || 'Casa y servicios') ? 'selected' : ''} value="${esc(c.n)}">${c.e} ${esc(c.n)}</option>`).join('')}</select></div>
      <div class="campo"><label>Se paga desde (opcional)</label><select id="efQ"><option value="">—</option>${opcionesCuentas(f.cuenta_id, false)}</select></div>
      ${f.id ? `<div class="campo full"><label class="chk"><input type="checkbox" id="efA" ${f.activo !== false ? 'checked' : ''}> Lo sigo pagando (si lo destildás, deja de aparecer)</label></div>` : ''}</div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="efOk">${ico('check')} Guardar</button>`);
  $('#efOk', m).onclick = async () => { try {
    const nombre = val('efN', m), dia = parseInt(val('efD', m)); if (!nombre) throw new Error('Poné qué es'); if (!(dia >= 1 && dia <= 31)) throw new Error('El día de vencimiento va del 1 al 31');
    const mm = $('#efM', m).value.trim() ? aNum($('#efM', m).value) : 0; if (isNaN(mm) || mm < 0) throw new Error('Revisá el monto');
    Object.assign(f, { nombre, monto: r2(mm), dia, categoria: val('efC', m), cuenta_id: +val('efQ', m) || null, activo: f.id ? $('#efA', m).checked : true, desde: f.desde || mesDe(hoy()) });
    await DB.guardar('fijos', f); await DB.anotar('Gasto fijo guardado', nombre); m.cerrar(); toast('Guardado'); luego && luego();
  } catch (e) { fallo(e); } };
}
