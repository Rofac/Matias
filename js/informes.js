/* Informes: en qué se va la plata, mes a mes. */
'use strict';

let MES_INF = null;
PANTALLAS.informes = async (main) => {
  titulo('Informes');
  const ym = MES_INF || mesDe(hoy()), r = mes(ym), ant = mes(sumarMes(ym, -1));
  const meses = Array.from({ length: 12 }, (_, i) => mes(sumarMes(ym, i - 11)));
  const maxM = Math.max(1, ...meses.map(x => Math.max(x.ingreso, x.gasto)));
  const cats = Object.entries(r.porCat).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...cats.map(c => c[1]));
  const anio = meses.filter(x => x.ym.slice(0, 4) === ym.slice(0, 4));
  const conDatos = meses.filter(x => x.gasto || x.ingreso);
  const promedio = conDatos.length ? conDatos.reduce((s, x) => s + x.gasto, 0) / conDatos.length : 0;
  main.innerHTML = `<div class="fila" style="margin-bottom:10px"><button class="ib" id="ifA" style="transform:scaleX(-1)">${ico('flecha')}</button><b class="sp" style="text-align:center;font-size:18px;text-transform:capitalize">${nombreMes(ym)}</b><button class="ib" id="ifS">${ico('flecha')}</button></div>
    <div class="kpis"><div class="kpi"><small>Entró</small><b class="ok">${money(r.ingreso)}</b></div><div class="kpi"><small>Gastaste</small><b class="mal">${money(r.gasto)}</b>
      <div class="sub">${ant.gasto ? `${r.gasto > ant.gasto ? '▲' : '▼'} ${Math.abs(Math.round((r.gasto - ant.gasto) * 100 / ant.gasto))}% que ${MESES[+sumarMes(ym, -1).slice(5) - 1]}` : ''}</div></div>
      <div class="kpi"><small>Ahorraste</small><b class="${r.balance < 0 ? 'mal' : 'ok'}">${money(r.balance)}</b><div class="sub">${r.ingreso ? Math.round(r.balance * 100 / r.ingreso) + '% de lo que entró' : ''}</div></div>
      <div class="kpi"><small>Gasto promedio</small><b>${money(promedio)}</b><div class="sub">por mes (últimos ${conDatos.length || 0})</div></div></div>
    <div class="grid g2"><div>
      <div class="card"><h2>🧾 Por categoría</h2>${cats.map(([n, v]) => { const a = ant.porCat[n] || 0; return `<div style="margin-bottom:10px"><div class="fila"><span>${catDe(n).e}</span><span class="sp">${esc(n)}</span><b>${money(v)}</b>
          <span class="chico ${a && v > a ? 'mal' : 'muted'}" style="width:52px;text-align:right">${a ? (v > a ? '▲' : '▼') + Math.abs(Math.round((v - a) * 100 / a)) + '%' : 'nuevo'}</span></div>
          <div class="barra"><i style="width:${Math.round(v * 100 / maxC)}%"></i></div></div>`; }).join('') || vacio('informe', 'Sin gastos este mes')}</div>
    </div><div>
      <div class="card"><h2>📊 Últimos 12 meses</h2><div class="barras">${meses.map(x => `<div class="bm" title="${nombreMes(x.ym)}"><div class="bb"><i class="in" style="height:${Math.round(x.ingreso * 100 / maxM)}%"></i><i class="ga" style="height:${Math.round(x.gasto * 100 / maxM)}%"></i></div><small>${MESES[+x.ym.slice(5) - 1].slice(0, 1).toUpperCase()}</small></div>`).join('')}</div>
        <div class="chico muted"><span class="ley in"></span> Entró <span class="ley ga" style="margin-left:10px"></span> Gastaste</div>
        <table class="t" style="margin-top:10px"><thead><tr><th>Mes</th><th class="r">Entró</th><th class="r">Gastó</th><th class="r">Quedó</th></tr></thead><tbody>
        ${meses.slice().reverse().filter(x => x.gasto || x.ingreso).map(x => `<tr><td style="text-transform:capitalize">${nombreMesC(x.ym)}</td><td class="r">${money(x.ingreso)}</td><td class="r">${money(x.gasto)}</td><td class="r ${x.balance < 0 ? 'mal' : 'ok'}"><b>${money(x.balance)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin datos</td></tr>'}</tbody></table>
        ${anio.some(x => x.gasto) ? `<p class="chico" style="margin-bottom:0">En ${ym.slice(0, 4)}: entró ${money(anio.reduce((s, x) => s + x.ingreso, 0))}, gastaste ${money(anio.reduce((s, x) => s + x.gasto, 0))}.</p>` : ''}</div>
    </div></div>
    <div class="fila"><button class="btn" id="ifCsv">${ico('copia')} Pasar a Excel (este mes)</button></div>`;
  $('#ifA').onclick = () => { MES_INF = sumarMes(ym, -1); PANTALLAS.informes(main); };
  $('#ifS').onclick = () => { MES_INF = sumarMes(ym, 1); PANTALLAS.informes(main); };
  $('#ifCsv').onclick = () => {
    const c = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Cuenta / tarjeta', 'Monto', 'Cuotas', 'N° operación']];
    for (const x of r.movs) filas.push([dmy(x.fecha), { GASTO: 'Gasto', INGRESO: 'Ingreso', TRANSFER: 'Pase', PAGO_TARJETA: 'Pago tarjeta', AJUSTE: 'Ajuste' }[x.tipo], x.categoria || '', x.detalle, DB.get('cuentas', x.cuenta_id)?.nombre || '', String(x.monto).replace('.', ','), '', x.operacion || '']);
    for (const x of r.compras) filas.push([dmy(x.fecha), 'Compra con tarjeta', x.categoria, x.detalle, DB.get('tarjetas', x.tarjeta_id)?.nombre || '', String(x.total).replace('.', ','), x.cuotas, x.operacion || '']);
    compartirArchivo(new Blob(['﻿' + filas.map(f => f.map(c).join(';')).join('\r\n')], { type: 'text/csv' }), `Gastos ${ym}.csv`);
  };
};
