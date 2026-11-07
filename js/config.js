/* Configuración, copias de seguridad y "Más". */
'use strict';

PANTALLAS.mas = async (main) => {
  titulo('Más');
  const it = (id, i, t, d) => `<div class="it" data-ir2="${id}"><div class="av em">${i}</div><div class="tx"><b>${t}</b><small>${d}</small></div>${ico('flecha')}</div>`;
  main.innerHTML = `<div class="card" style="padding:6px 14px"><div class="lista">
    ${it('cuentas', '🏦', 'Cuentas', 'Efectivo, banco, Mercado Pago, ahorros y dólares')}${it('informes', '📊', 'Informes', 'En qué se va la plata, mes a mes')}
    ${it('fijos', '📅', 'Gastos fijos', 'Alquiler, luz, internet… y si ya los pagaste')}${it('config', '⚙️', 'Configuración', 'Categorías, presupuesto, copia de seguridad, clave')}
    <div class="it" id="maCopia"><div class="av em">💾</div><div class="tx"><b>Copia de seguridad</b><small>${DB.cfg.ultima_copia ? 'Última: ' + dmy(DB.cfg.ultima_copia) : 'Nunca se hizo'}</small></div>${ico('flecha')}</div></div></div>`;
  main.onclick = e => { const b = e.target.closest('[data-ir2]'); if (b) ir(b.dataset.ir2, null, true); if (e.target.closest('#maCopia')) hacerCopia(); };
};

async function hacerCopia() {
  try {
    toast('Armando la copia…');
    const z = await DB.exportarZip(), nombre = `Copia gastos ${(DB.cfg.nombre || '').replace(/[^\w áéíóúñÁÉÍÓÚÑ-]/g, '')} ${hoy()}.zip`;
    if (!await compartirArchivo(z, nombre)) return;
    await DB.setCfg('ultima_copia', ahora()); toast('Copia lista. Guardala en tu Google Drive.');
    if (['inicio', 'config', 'mas'].includes(ACTUAL)) recargar();
  } catch (e) { fallo(e); }
}
async function restaurarCopia(j, archivos) {
  const n = (j.data && j.data.movimientos || []).length + (j.data && j.data.compras || []).length;
  if (!await confirmar(`Se van a REEMPLAZAR todos los datos de este celular por la copia del <b>${esc(dmy(j.fecha))} ${esc((j.fecha || '').slice(11))}</b> (${n} movimientos${archivos ? ', ' + Object.keys(archivos).length + ' comprobantes' : ''}). ¿Seguro?`, 'Sí, restaurar', true)) return;
  try { await DB.copiaDiaria(); await DB.importar(j, archivos); toast('Copia restaurada'); setTimeout(() => location.reload(), 900); } catch (e) { fallo(e); }
}

let LIC_ESTADO = null;
PANTALLAS.config = async (main) => {
  titulo('Configuración');
  const c = DB.cfg, copias = await DB.copiasInternas();
  main.innerHTML = `
    <div class="card"><h2>👤 Tus datos</h2><div class="form">
      <div class="campo"><label>Tu nombre</label><input id="cf_n" value="${esc(c.nombre)}"></div>
      <div class="campo"><label>Cotización del dólar (opcional)</label>${campoMonto('id="cf_usd"', c.cotizacion_usd || '')}</div></div>
      <p class="muted chico">La cotización sólo sirve para mostrar cuánto son tus dólares en pesos.</p>
      <button class="btn pri" id="cfG1">${ico('check')} Guardar</button></div>

    <div class="card"><h2>🧾 Categorías de gasto y presupuesto</h2><p class="muted chico" style="margin-top:0">Poné un tope por mes en las que quieras controlar (vacío = sin tope). Te avisa cuando te acercás.</p>
      <div id="cfCats">${(c.categorias || []).map((k, i) => filaCat(k, i)).join('')}</div>
      <div class="fila"><button class="btn" id="cfCatN">${ico('plus')} Categoría</button><span class="sp"></span><button class="btn pri" id="cfG2">${ico('check')} Guardar</button></div></div>

    <div class="card"><h2>💰 Tipos de ingreso</h2><div class="campo"><label>Uno por renglón</label><textarea id="cf_ing">${esc((c.categorias_ingreso || []).join('\n'))}</textarea></div>
      <button class="btn pri" id="cfG3">${ico('check')} Guardar</button></div>

    <div class="card"><h2>${ico('copia')} Copia de seguridad</h2>
      <p style="margin-top:0">Todo está guardado <b>en este celular</b>. Si se rompe, se pierde o la resetean, sólo se recupera con una copia.
        Tocá "Hacer copia" y mandala a <b>Google Drive</b> o a tu <b>WhatsApp</b> (por ejemplo a vos mismo). Conviene una vez por semana.</p>
      <p class="${!c.ultima_copia ? 'mal' : ''}"><b>Última copia:</b> ${c.ultima_copia ? dmy(c.ultima_copia) + ' ' + c.ultima_copia.slice(11) : 'nunca'}</p>
      <div class="fila"><button class="btn acento" id="cfCp">${ico('copia')} Hacer copia</button><label class="btn" style="margin:0">${ico('subir')} Restaurar una copia<input type="file" accept=".zip,.json,application/zip,application/json" id="cfRs" hidden></label>
        <label class="chk" style="margin-left:6px">Avisar cada <input id="cf_ac" inputmode="numeric" value="${esc(c.aviso_copia_dias)}" style="width:64px;min-height:38px;padding:6px"> días</label></div>
      ${copias.length ? `<p class="muted chico" style="margin-bottom:6px">Además la app guarda sola una copia por día adentro del celular (las últimas 7), por si se borra algo sin querer:</p>
        <div class="fila">${copias.map(x => `<button class="btn chico" data-ci="${x.k}">${dmy(x.fecha)}</button>`).join('')}</div>` : ''}</div>

    <div class="card"><h2>${ico('candado')} Clave para abrir la app</h2>
      <p style="margin-top:0" class="muted">Si la ponés, la app la pide cada vez que se abre, así nadie ve tus gastos si agarra tu celular.</p>
      <div class="fila"><input id="cf_pin" type="password" inputmode="numeric" placeholder="${c.pin ? 'Nueva clave (4 a 8 números)' : '4 a 8 números'}" style="max-width:240px" autocomplete="new-password">
        <button class="btn pri" id="cfPin">${c.pin ? 'Cambiar clave' : 'Poner clave'}</button>${c.pin ? `<button class="btn rojo" id="cfPinQ">Quitar clave</button>` : ''}</div></div>

    <div class="card"><h2>${ico('config')} Apariencia y ayuda</h2><div class="fila">
      <div><label>Colores</label><div class="seg" id="cfTema">${[['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Como el celular']].map(([k, t]) => `<button data-tm="${k}" class="${(c.tema || 'light') === k ? 'act' : ''}">${t}</button>`).join('')}</div></div>
      <div><label>Tamaño de letra</label><div class="seg" id="cfLetra">${[['chica', 'Chica'], ['normal', 'Normal']].map(([k, t]) => `<button data-lt="${k}" class="${(c.letra || 'normal') === k ? 'act' : ''}">${t}</button>`).join('')}</div></div>
      <button class="btn" id="cfAct">${ico('reloj')} Registro de actividad</button><button class="btn" id="cfInst">Cómo instalar la app</button></div></div>
    <div class="card"><h2>Acerca de</h2><div class="sp"><b style="font-size:18px">RoFac</b><div class="muted chico">Versión 1.0 · Tus datos quedan sólo en este celular: no se mandan a ningún lado.</div></div></div>`;
  const re = () => PANTALLAS.config(main);
  const lineas = id => $('#' + id).value.split('\n').map(x => x.trim()).filter(Boolean);
  $('#cfG1').onclick = async () => { try { const n = val('cf_n'); if (!n) throw new Error('Poné tu nombre'); await DB.setCfg('nombre', n); const u = aNum($('#cf_usd').value); await DB.setCfg('cotizacion_usd', isNaN(u) ? 0 : r2(u)); pintarMenu(); toast('Guardado'); } catch (e) { fallo(e); } };
  $('#cfCatN').onclick = () => { $('#cfCats').insertAdjacentHTML('beforeend', filaCat({ n: '', e: '📦', tope: 0 }, $$('#cfCats .catcfg').length)); $('#cfCats .catcfg:last-child input[data-k=n]').focus(); };
  $('#cfCats').onclick = e => { const q = e.target.closest('[data-q]'); if (q) q.closest('.catcfg').remove(); };
  $('#cfG2').onclick = async () => { try {
    const l = $$('#cfCats .catcfg').map(f => ({ n: $('[data-k=n]', f).value.trim().replace(/\s+/g, ' '), e: $('[data-k=e]', f).value.trim() || '📦', tope: r2(n0($('[data-k=t]', f).value)) })).filter(x => x.n);
    if (!l.length) throw new Error('Tiene que haber al menos una categoría');
    if (new Set(l.map(x => normal(x.n))).size !== l.length) throw new Error('Hay dos categorías con el mismo nombre');
    if (!l.some(x => x.n === 'Otros')) l.push({ n: 'Otros', e: '📦', tope: 0 });
    await DB.setCfg('categorias', l); toast('Guardado'); re();
  } catch (e) { fallo(e); } };
  $('#cfG3').onclick = async () => { const l = lineas('cf_ing'); await DB.setCfg('categorias_ingreso', l.length ? l : ['Otros']); toast('Guardado'); };
  main.onclick = async e => {
    const ci = e.target.closest('[data-ci]'); if (ci) { const j = await DB.copiaInterna(ci.dataset.ci); if (j) restaurarCopia(j, null); }
  };
  $('#cfCp').onclick = () => hacerCopia();
  $('#cf_ac').onchange = e => DB.setCfg('aviso_copia_dias', Math.max(1, parseInt(e.target.value) || 7));
  $('#cfRs').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const { j, archivos } = await DB.leerCopia(f); restaurarCopia(j, archivos); } catch (x) { fallo(new Error('No se pudo leer el archivo de copia')); } };
  $('#cfPin').onclick = async () => { const p = val('cf_pin'); if (!/^\d{4,8}$/.test(p)) return toast('La clave tiene que ser de 4 a 8 números', true); await DB.setCfg('pin', await sha256(p)); await DB.anotar('Clave cambiada'); toast('Clave guardada'); re(); };
  if ($('#cfPinQ')) $('#cfPinQ').onclick = async () => { if (!await confirmar('¿Quitar la clave?', 'Quitar', true)) return; await DB.setCfg('pin', ''); toast('Clave quitada'); re(); };
  $('#cfLetra').onclick = async e => { const b = e.target.closest('[data-lt]'); if (!b) return; await DB.setCfg('letra', b.dataset.lt); aplicarTema(); re(); };
  $('#cfTema').onclick = async e => { const b = e.target.closest('[data-tm]'); if (!b) return; await DB.setCfg('tema', b.dataset.tm); aplicarTema(); re(); };
  $('#cfAct').onclick = () => modal('Registro de actividad', `<table class="t">${DB.todos('actividad').slice(-300).reverse().map(a => `<tr><td class="chico muted" style="white-space:nowrap">${dmy(a.fecha)} ${a.fecha.slice(11)}</td><td><b>${esc(a.accion)}</b><div class="chico muted">${esc(a.detalle)}</div></td></tr>`).join('') || '<tr><td class="muted">Sin actividad</td></tr>'}</table>`, '', 'ancho');
  $('#cfInst').onclick = ayudaInstalar;
};

function filaCat(k, i) {
  return `<div class="catcfg fila" style="flex-wrap:nowrap;margin-bottom:8px"><input data-k="e" value="${esc(k.e)}" style="width:52px;text-align:center;padding:6px" maxlength="4">
    <input data-k="n" value="${esc(k.n)}" placeholder="Nombre" class="sp" style="min-width:0">${campoMonto('data-k="t" placeholder="Tope" style="width:110px;min-width:0"', k.tope || '')}
    <button class="ib" data-q="${i}" title="Quitar">${ico('x')}</button></div>`;
}

function ayudaInstalar() {
  modal('Cómo instalar la app', `<ol style="padding-left:20px;line-height:1.7;margin-top:0">
    <li>En el celular, abrí <b>Chrome</b> y entrá a la dirección de la app.</li>
    <li>Tocá el menú <b>⋮</b> (arriba a la derecha) y elegí <b>"Instalar aplicación"</b> o <b>"Agregar a la pantalla principal"</b>.</li>
    <li>Queda el ícono de ${esc(DB.cfg.nombre)} en la pantalla. De ahí en más se abre como cualquier app, <b>sin internet</b>.</li></ol>
    <p>Instalada, desde la app del banco o de Mercado Pago podés tocar <b>Compartir</b> en el comprobante y elegir <b>Gastos</b>: se carga solo.</p>
    <p><b>En iPhone:</b> abrí la dirección en <b>Safari</b>, tocá <b>Compartir</b> (el cuadrado con la flecha) y elegí <b>"Agregar a pantalla de inicio"</b>.</p>
    <p><b>Importante:</b> los datos quedan en el celular. No borres los datos de Chrome ni "desinstales" la app sin antes hacer una copia de seguridad.</p>`, '<button class="btn pri" data-cerrar>Entendido</button>');
}
