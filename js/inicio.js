/* Inicio: cómo vengo este mes. */
'use strict';

const barra = (v, tope) => { const p = tope ? Math.min(100, Math.round(v * 100 / tope)) : 0; return `<div class="barra ${v > tope ? 'pasada' : v > tope * .8 ? 'cerca' : ''}"><i style="width:${p}%"></i></div>`; };

PANTALLAS.inicio = async (main) => {
  titulo('Inicio');
  const ym = mesDe(hoy()), r = mes(ym), ant = mes(sumarMes(ym, -1)), tot = totales();
  const fijos = fijosDelMes(ym), pend = fijos.filter(x => !x.hecho);
  const tarj = tarjetasActivas().map(t => ({ t, r: resumen(t.id, ym), sig: resumen(t.id, sumarMes(ym, 1)) }));
  const topes = categorias().filter(c => c.tope > 0);
  const ultimos = [...activos('movimientos').map(x => ({ tabla: 'movimientos', x })), ...activos('compras').map(x => ({ tabla: 'compras', x }))]
    .sort((a, b) => b.x.fecha.localeCompare(a.x.fecha) || (b.x.creado || '').localeCompare(a.x.creado || '')).slice(0, 8);
  const porCat = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]);
  const diasCopia = DB.cfg.ultima_copia ? diasEntre(DB.cfg.ultima_copia.slice(0, 10), hoy()) : null;
  const hayDatos = DB.todos('movimientos').length + DB.todos('compras').length > 3;
  const usd = DB.cfg.cotizacion_usd > 0 && tot.USD ? ` · total con dólares ${money(tot.ARS + tot.USD * DB.cfg.cotizacion_usd)}` : '';
  main.innerHTML = `
    <p class="hola">Hola ${esc((DB.cfg.nombre || '').split(' ')[0])} 👋 <span class="muted">· ${fechaLarga(hoy())}</span></p>
    ${hayDatos && (diasCopia === null || diasCopia >= (+DB.cfg.aviso_copia_dias || 7)) ? `<div class="card fila aviso">${ico('alerta')}<div class="sp"><b>${diasCopia === null ? 'Todavía no hiciste ninguna copia de seguridad' : `Hace ${diasCopia} días que no hacés una copia`}</b>
      <div class="chico">Si el celular se rompe o se pierde, sin copia se pierde todo.</div></div><button class="btn pri" id="inCopia">${ico('copia')} Hacer copia</button></div>` : ''}
    <div class="card resumen-mes">
      <div class="chico" style="text-transform:capitalize;opacity:.85">${nombreMes(ym)}</div>
      <div class="rm-fila"><div><small>Entró</small><b>${money(r.ingreso)}</b></div><div><small>Gastaste</small><b>${money(r.gasto)}</b></div></div>
      <div class="rm-queda"><small>Te queda del mes</small><b class="${r.balance < 0 ? 'neg' : ''}">${money(r.balance)}</b></div>
      ${ant.gasto ? `<div class="chico" style="opacity:.85">El mes pasado gastaste ${money(ant.gasto)}${r.gasto ? ` · vas ${r.gasto > ant.gasto ? 'arriba' : 'abajo'} ${Math.abs(Math.round((r.gasto - ant.gasto) * 100 / ant.gasto))}%` : ''}</div>` : ''}
    </div>
    <div class="kpis">
      <div class="kpi" data-ir="cuentas"><small>Plata disponible</small><b class="${tot.disponible < 0 ? 'mal' : ''}">${money(tot.disponible)}</b><div class="sub">en tus cuentas${usd}</div></div>
      <div class="kpi" data-ir="cuentas"><small>Ahorros</small><b>${money(tot.ahorro)}</b><div class="sub">${tot.USD ? plata(tot.USD, 'USD') : 'sin dólares'}</div></div>
      ${tarj.length ? `<div class="kpi" data-ir="tarjetas"><small>Tarjeta a pagar este mes</small><b class="${tarj.some(x => x.r.falta > 0.009) ? 'warn' : ''}">${money(Math.round(tarj.reduce((s, x) => s + Math.max(0, x.r.falta), 0)))}</b><div class="sub">el que viene ${money(Math.round(tarj.reduce((s, x) => s + x.sig.total, 0)))}</div></div>` : ''}
      <div class="kpi" data-ir="fijos"><small>Gastos fijos</small><b class="${pend.some(x => x.vencido) ? 'mal' : ''}">${fijos.length - pend.length}/${fijos.length}</b><div class="sub">${pend.length ? `falta${pend.length === 1 ? '' : 'n'} ${pend.length} · ${money(pend.reduce((s, x) => s + (+x.f.monto || 0), 0))}` : fijos.length ? 'todo pagado ✓' : 'cargá alquiler, luz…'}</div></div>
    </div>
    <div class="grid g2"><div>
      ${pend.length ? `<div class="card"><h2>${ico('reloj')} Para pagar este mes</h2>${pend.slice(0, 6).map(x => `<div class="it" data-fijo="${x.f.id}"><div class="av em">${catDe(x.f.categoria).e}</div><div class="tx"><b>${esc(x.f.nombre)}</b>
        <small class="${x.vencido ? 'mal' : ''}">${x.vencido ? 'Venció el ' : 'Vence el '}${dm(x.vence)}${x.f.monto ? ' · ' + money(x.f.monto) : ''}</small></div><button class="btn chico acento" data-pf="${x.f.id}">Pagar</button></div>`).join('')}</div>` : ''}
      ${tarj.filter(x => x.r.falta > 0.009).map(x => `<div class="card"><div class="fila"><div class="sp"><b>💳 ${esc(x.t.nombre)}</b><div class="chico ${x.r.vence < hoy() ? 'mal' : 'muted'}">Resumen de ${nombreMes(ym)} · vence ${dm(x.r.vence)}</div></div>
        <b style="font-size:18px">${money(Math.round(x.r.falta))}</b><button class="btn chico acento" data-pt="${x.t.id}">Pagar</button></div></div>`).join('')}
      <div class="card"><h2>${ico('informe')} En qué se fue la plata</h2>${porCat.slice(0, 7).map(([n, v]) => `<div class="cat-fila"><span>${catDe(n).e}</span><span class="sp">${esc(n)}</span><b>${money(v)}</b><span class="muted chico" style="width:42px;text-align:right">${Math.round(v * 100 / (r.gasto || 1))}%</span></div>`).join('')
        || vacio('informe', 'Todavía no cargaste gastos este mes')}${porCat.length ? `<button class="btn chico" data-ir="informes" style="margin-top:8px">Ver informes</button>` : ''}</div>
      ${topes.length ? `<div class="card"><h2>🎯 Presupuesto del mes</h2>${topes.map(c => { const g = r.porCat[c.n] || 0; return `<div style="margin-bottom:10px"><div class="fila"><span class="sp">${c.e} ${esc(c.n)}</span><b class="chico ${g > c.tope ? 'mal' : ''}">${money(g)} de ${money(c.tope)}</b></div>${barra(g, c.tope)}</div>`; }).join('')}</div>` : ''}
    </div><div>
      <div class="card" style="padding:6px 14px"><h2 style="margin:10px 0 4px">Últimos movimientos<span class="sp"></span><button class="btn chico" data-ir="movimientos">Ver todos</button></h2>
        <div class="lista" id="inUlt">${ultimos.map(filaMov).join('') || vacio('caja', 'Tocá "+ Gasto" arriba para cargar el primero')}</div></div>
      ${!DB.todos('movimientos').length ? `<div class="card"><h2>👋 Para empezar</h2><ol style="margin:0;padding-left:20px;line-height:1.8">
        <li>En <b>Cuentas</b> poné cuánta plata tenés hoy en cada una (efectivo, banco, Mercado Pago).</li>
        <li>Si tenés tarjeta de crédito, agregala en <b>Tarjetas</b> con su día de cierre y vencimiento.</li>
        <li>Cargá tus <b>Gastos fijos</b> (alquiler, luz, internet…) y cuándo vencen.</li>
        <li>Cada vez que gastás, tocá <b>+ Gasto</b>. O desde la app del banco o Mercado Pago: <b>Compartir › Gastos</b>.</li></ol></div>` : ''}
    </div></div>`;
  if ($('#inCopia')) $('#inCopia').onclick = hacerCopia;
  main.onclick = e => {
    const pf = e.target.closest('[data-pf]'); if (pf) return nuevoMov({ tipo: 'GASTO', fijo_id: +pf.dataset.pf, periodo: ym }, recargar);
    const pt = e.target.closest('[data-pt]'); if (pt) return pagarTarjeta(+pt.dataset.pt, ym, recargar);
    const fj = e.target.closest('[data-fijo]'); if (fj) return ir('fijos', null, true);
    abrirFila(e, recargar);
  };
};
