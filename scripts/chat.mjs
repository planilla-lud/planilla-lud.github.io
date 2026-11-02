// Resumen compacto de toda la Liga para el chat (data/chat.json y data/chat-jugadores.json). Lo lee el
// servidor del chat (worker/) para contestar preguntas: por cada equipo, su próximo partido, posición, forma,
// racha, bajas, suspendidos, once probable, goleadores, números de la temporada y todos sus resultados con los
// goles; por divisional, la próxima fecha y la última jugada; y un índice de jugadores. Las cuentas van hechas
// acá porque la IA gratis las hace mal. Corre después de analizar.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { corto } from './comun.mjs';
import { VISTAS } from './categorias.mjs';

const DATA = new URL('../data/', import.meta.url);
const leer = f => JSON.parse(readFileSync(new URL(f, DATA)));
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fDia = d => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ddmm2 = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const puestos = (a, b) => a === b ? `${a}°` : b === a + 1 ? `${a}° o ${b}°` : `entre ${a}° y ${b}°`;

// Escenarios de una tabla: recorre TODAS las combinaciones de resultados de los partidos que quedan
// (3 resultados por partido) y anota en qué puesto puede terminar cada equipo. Así el chat no tiene que
// reordenar la tabla a mano (la IA gratis lo hace mal). Con más de 11 partidos pendientes no se calcula.
// filas: [{eq, pts}] de la tabla; pendientes: [[local, visitante, fechaHora]] con nombres cortos.
function escenarios(filas, pendientes) {
  const n = pendientes.length;
  if (!n || n > 11) return null;
  const idx = new Map(filas.map((x, i) => [x.eq, i]));
  const par = pendientes.map(([l, v]) => [idx.get(l), idx.get(v)]);
  const base = filas.map(x => x.pts);
  // El próximo partido de cada equipo: el primero por fecha.
  const orden = pendientes.map((_, k) => k).sort((a, b) => pendientes[a][2] < pendientes[b][2] ? -1 : 1);
  const prox = filas.map((_, i) => orden.find(k => par[k][0] === i || par[k][1] === i));
  const res = filas.map(() => ({ fin: [99, 0], fin1: false, si: {}, combos: { primero: [], noUltimo: [] } }));
  const pts = new Array(filas.length), out = new Array(n), N = filas.length;
  for (let c = 0; c < 3 ** n; c++) {
    let r = c;
    for (let k = 0; k < n; k++) { out[k] = r % 3; r = (r - out[k]) / 3; }
    for (let i = 0; i < pts.length; i++) pts[i] = base[i];
    for (let k = 0; k < n; k++) { const [a, b] = par[k]; if (out[k] === 0) pts[a] += 3; else if (out[k] === 1) { pts[a]++; pts[b]++; } else pts[b] += 3; }
    for (let i = 0; i < pts.length; i++) {
      let arriba = 0; const igual = [];
      for (let j = 0; j < pts.length; j++) if (j !== i) { if (pts[j] > pts[i]) arriba++; else if (pts[j] === pts[i]) igual.push(j); }
      const mejor = arriba + 1, peor = arriba + 1 + igual.length, R = res[i];
      R.fin[0] = Math.min(R.fin[0], mejor); R.fin[1] = Math.max(R.fin[1], peor);
      const k = prox[i];
      if (k == null) continue;
      const o = out[k], local = par[k][0] === i;
      const clave = o === 1 ? 'E' : (o === 0) === local ? 'G' : 'P';
      const s = (R.si[clave] ??= { ptsMin: 99, ptsMax: 0, mejor: 99, peor: 0, igual: new Set(), solo1: true });
      s.ptsMin = Math.min(s.ptsMin, pts[i]); s.ptsMax = Math.max(s.ptsMax, pts[i]);
      s.mejor = Math.min(s.mejor, mejor); s.peor = Math.max(s.peor, peor);
      for (const j of igual) s.igual.add(filas[j].eq);
      // Combinaciones que lo dejan 1° (solo o igualado) y las que lo salvan de terminar último (solo).
      if (mejor === 1) R.combos.primero.push([...out]);
      if (peor < N) R.combos.noUltimo.push([...out]);
    }
  }
  // "Qué necesita": para cada objetivo, según su propio resultado, qué tiene que pasar en los otros partidos.
  const nombreOut = (k, o) => { const [a, b] = par[k]; return o === 0 ? `gane ${filas[a].eq}` : o === 1 ? `empaten ${filas[a].eq} y ${filas[b].eq}` : `gane ${filas[b].eq}`; };
  const necesita = (i, lista) => {
    const k = prox[i]; if (k == null) return null;
    const local = par[k][0] === i;
    const propio = o => o === 1 ? 'E' : (o === 0) === local ? 'G' : 'P';
    const salida = [];
    for (const r of ['G', 'E', 'P']) {
      const total = 3 ** (n - 1), buenas = lista.filter(c => propio(c[k]) === r);
      if (!buenas.length) { salida.push([r, 'no le alcanza']); continue; }
      if (buenas.length === total) { salida.push([r, 'lo logra pase lo que pase en los demás partidos']); continue; }
      // En cada otro partido, qué resultados aparecen en las combinaciones buenas. Si las buenas son
      // exactamente el producto de esos conjuntos, la condición es un "y" simple entre partidos.
      const otros = [...Array(n).keys()].filter(j => j !== k);
      const permitidos = otros.map(j => [j, [0, 1, 2].filter(o => buenas.some(c => c[j] === o))]);
      const producto = permitidos.reduce((s, [, p]) => s * p.length, 1);
      const condiciones = permitidos.filter(([, p]) => p.length < 3).map(([j, p]) => p.length === 1 ? nombreOut(j, p[0]) : `no ${nombreOut(j, [0, 1, 2].find(o => !p.includes(o)))}`);
      salida.push([r, buenas.length === producto ? `necesita que ${condiciones.join(' y que ')}` : `depende de una combinación de otros resultados (${condiciones.length ? 'como mínimo que ' + condiciones.join(' y que ') + '; ' : ''}ver los puestos posibles)`]);
    }
    const txt = { G: 'si gana', E: 'si empata', P: 'si pierde' };
    return salida.map(([r, t]) => `${txt[r]}: ${t}`).join('; ');
  };
  return filas.map((x, i) => ({ eq: x.eq, fin: res[i].fin, si: res[i].si, rival: prox[i] == null ? null : filas[par[prox[i]][0] === i ? par[prox[i]][1] : par[prox[i]][0]].eq,
    paraPrimero: res[i].fin[0] === 1 && res[i].fin[1] !== 1 ? necesita(i, res[i].combos.primero) : null,
    paraNoUltimo: res[i].fin[1] === N && res[i].fin[0] !== N ? necesita(i, res[i].combos.noUltimo) : null }));
}
// Texto de los escenarios de un equipo, para el chat.
function textoEscenario(x, etapa) {
  if (!x.rival) return null;
  const nombre = { G: 'si gana', E: 'si empata', P: 'si pierde' };
  const partes = ['G', 'E', 'P'].filter(k => x.si[k]).map(k => {
    const s = x.si[k], p = s.ptsMin === s.ptsMax ? `${s.ptsMin} pts` : `entre ${s.ptsMin} y ${s.ptsMax} pts`;
    const empates = [...s.igual];
    return `${nombre[k]} (${p}) termina ${puestos(s.mejor, s.peor)}`
      + (empates.length ? ` (puede quedar igualado en puntos con ${empates.join(', ')}: ahí lo define el desempate)` : '');
  });
  return `Contra ${x.rival} en ${etapa}, PUESTOS YA CALCULADOS contando todos los resultados posibles de los demás partidos que quedan: ${partes.join('; ')}. Puesto final posible en ${etapa}: ${puestos(x.fin[0], x.fin[1])}${x.fin[0] === x.fin[1] ? ` (YA ASEGURADO: termina ${x.fin[0]}° pase lo que pase)` : ''}.`
    + (x.paraPrimero ? ` PARA TERMINAR 1° (solo o igualado en puntos): ${x.paraPrimero}.` : '')
    + (x.paraNoUltimo ? ` PARA NO TERMINAR ÚLTIMO: ${x.paraNoUltimo}.` : '');
}

const indice = leer('indice.json');
const posiciones = existsSync(new URL('posiciones.json', DATA)) ? leer('posiciones.json').divisionales || {} : {};
const equipos = [], jugadores = [], tablas = {}, tablasRaw = {}, divisionales = {};
let ultimoResultado = '';
const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // fecha de Montevideo

for (const cat of indice.categorias) for (const dv of cat.divisionales) {
  if (dv.oculta || !existsSync(new URL(`${dv.id}.json`, DATA))) continue;
  const d = leer(`${dv.id}.json`);
  const mios = new Set(d.equipos);
  const nom = c => d.jugadores[c]?.nombre || c;
  // Puntos de toda la temporada en esta divisional (en la segunda etapa se conserva lo de la primera rueda).
  const pts = {};
  for (const p of d.partidos) if (p.gl != null && p.gv != null) for (const [eq, gf, gc] of [[p.local, p.gl, p.gv], [p.visitante, p.gv, p.gl]]) {
    const x = (pts[eq] ??= { pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 });
    x.pj++; x.gf += gf; x.gc += gc; if (gf > gc) { x.g++; x.pts += 3; } else if (gf === gc) { x.e++; x.pts++; } else x.p++;
    if (p.dia > ultimoResultado && p.dia <= hoy) ultimoResultado = p.dia; // hay fechas mal cargadas a futuro
  }
  // Partidos que le quedan a cada equipo (fixture de la Liga).
  const dirFix = new URL(`../planillas/${dv.bloque || (dv.copa ? dv.id.split('-')[0] : dv.id)}/_proximos.json`, import.meta.url);
  // Lo que figura en el fixture: lo de hoy en adelante, y lo que ya se jugó pero la Liga todavía no cargó
  // (de los últimos 10 días): eso también puede sumar puntos, así que cuenta como pendiente.
  const hace10 = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const fixtureTodo = existsSync(dirFix) ? JSON.parse(readFileSync(dirFix)).filter(f => f.fechaHora.slice(0, 10) >= hace10) : [];
  const fixture = fixtureTodo.filter(f => f.fechaHora.slice(0, 10) >= hoy);
  const sinCargar = fixtureTodo.filter(f => f.fechaHora.slice(0, 10) < hoy);
  // Tablas de las etapas que se están jugando, con los partidos que le quedan a cada uno y el máximo de
  // puntos al que puede llegar (las cuentas van hechas: la IA gratis suma mal).
  const series = VISTAS.find(v => v.id === dv.id)?.series || {};
  const quedanEn = (eq, et) => fixtureTodo.filter(f => series[f.serie] === et && (corto(f.local) === eq || corto(f.visitante) === eq)).length;
  const puntos = {}; // "etapa|equipo" -> puntos oficiales
  const esc = {}; // "etapa|equipo" -> escenarios calculados
  for (const [et, t] of Object.entries(posiciones[dv.id] || {})) {
    if (!t?.pos) continue;
    // La tabla oficial de la Liga (con lo que resuelve el Tribunal); si no está, la calculada con los resultados.
    const filas = t.filas?.length ? t.filas.map(([eq, pj, g, e, p2, gf, gc, ps]) => ({ eq, pj, g, e, p: p2, gf, gc, pts: ps }))
      : Object.entries(t.pos).sort((a, b) => a[1] - b[1]).map(([eq]) => ({ eq, ...(pts[eq] || { pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 }) }));
    const max = filas.map(x => x.pts + 3 * quedanEn(x.eq, et)), punta = filas[0]?.pts ?? 0;
    const enTabla = new Set(filas.map(x => x.eq));
    const pendientes = fixtureTodo.filter(f => series[f.serie] === et).map(f => [corto(f.local), corto(f.visitante), f.fechaHora])
      .filter(([l, v]) => enTabla.has(l) && enTabla.has(v));
    const escs = escenarios(filas, pendientes);
    if (escs) for (const x of escs) esc[`${et}|${x.eq}`] = x;
    // La misma tabla en números, para que el chat le pueda sumar los resultados provisorios.
    tablasRaw[`${dv.id}|${et}`] = filas.map(x => [x.eq, x.pj, x.g, x.e, x.p, x.gf, x.gc, x.pts, quedanEn(x.eq, et),
      sinCargar.filter(f => series[f.serie] === et && (corto(f.local) === x.eq || corto(f.visitante) === x.eq)).length]);
    tablas[`${dv.id}|${et}`] = filas.map((x, i) => { const q = quedanEn(x.eq, et); puntos[`${et}|${x.eq}`] = x.pts;
      const sc = sinCargar.filter(f => series[f.serie] === et && (corto(f.local) === x.eq || corto(f.visitante) === x.eq)).length;
      const e2 = esc[`${et}|${x.eq}`];
      const dif = x.gf - x.gc;
      return `${i + 1}° ${x.eq} ${x.pts} pts (${x.pj} PJ, ${x.g}G ${x.e}E ${x.p}P, GF ${x.gf} GC ${x.gc}, DIF ${dif > 0 ? '+' : ''}${dif}); le quedan ${q}${sc ? ` (${sc} ya jugado sin resultado cargado)` : ''}, puede llegar a ${max[i]}; ${max[i] >= punta ? 'todavía puede terminar 1°' : 'ya no puede terminar 1°'}${e2 && q ? `; puesto final posible: ${puestos(e2.fin[0], e2.fin[1])}` : ''}`; });
    // ¿Alguien ya tiene asegurado el primer puesto?
    if (filas.length > 1) tablas[`${dv.id}|${et}`].push(filas[0].pts > Math.max(...max.slice(1))
      ? `${filas[0].eq} ya tiene asegurado el 1° puesto.` : `Nadie tiene asegurado el 1° puesto todavía.`);
  }
  // Estadísticas de cada jugador del equipo en esta divisional (lo mismo que la sección Rankings).
  const st = {}, capitanes = {}, minEquipo = {};
  const partidosOrden = [...d.partidos].sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  for (const p of partidosOrden) if (p.planilla) for (const [lado, eq] of [['L', p.local], ['V', p.visitante]]) {
    if (!mios.has(eq)) continue;
    minEquipo[eq] = (minEquipo[eq] || 0) + (p.fin || 90);
    const rival = lado === 'L' ? p.visitante : p.local;
    for (const j of p[lado]) {
      const x = (st[j.c] ??= { eq, pj: 0, tit: 0, min: 0, gol: 0, rojas: 0, ingresos: 0, golBanco: 0, cam: null, ultimo: null });
      x.eq = eq; x.pj++; x.tit += j.t; x.min += j.min; x.gol += j.g.length; x.rojas += j.x;
      if (!j.t) { x.ingresos++; x.golBanco += j.g.length; }
      if (j.cam) x.cam = j.cam;
      x.ultimo = `${fDia(p.dia)} vs ${rival} (${j.min}'${j.t ? ', titular' : ', entró'}${j.g.length ? ', ' + j.g.length + ' gol' + (j.g.length > 1 ? 'es' : '') : ''}${j.x ? ', expulsado' : ''})`;
      if (j.cap) { const k = eq + '|' + j.c; capitanes[k] = (capitanes[k] || 0) + 1; }
    }
  }
  // Goles de un partido con autor y minuto, desde el lado de un equipo: a favor con nombre, en contra solo el minuto.
  const golesDe = (p, lado) => {
    const ev = (p.eventos || []).filter(e => e.tipo === 'gol' || e.tipo === 'gol-contra');
    const f = ev.filter(e => e.lado === lado).map(e => `${e.nombre}${e.tipo === 'gol-contra' ? ' (en contra)' : ''} ${e.m ?? '?'}'`);
    const c = ev.filter(e => e.lado !== lado).map(e => `${e.m ?? '?'}'`);
    return [f.join(', '), c.join(', ')];
  };
  const TRAMOS = [[0, 15], [16, 30], [31, 45], [46, 60], [61, 75], [76, 200]];
  const nomTramo = ([a, b]) => b > 90 ? '76-90+' : `${a}-${b}`;
  // Previa de la página del próximo partido (cara a cara en todas las categorías).
  const previaDe = eq => Object.values(d.previas || {}).find(f => f.l === eq || f.v === eq);
  const nomDiv = id => indice.categorias.flatMap(c => c.divisionales).find(x => x.id === id)?.nombre || id;

  for (const eq of d.equipos) {
    const b = d.bajas[eq] || {};
    const jugados = partidosOrden.filter(p => (p.local === eq || p.visitante === eq) && p.gl != null && p.gv != null)
      .map(p => { const loc = p.local === eq; const gf = loc ? p.gl : p.gv, gc = loc ? p.gv : p.gl; const [gF, gC] = p.planilla ? golesDe(p, loc ? 'L' : 'V') : ['', ''];
        return { r: gf > gc ? 'G' : gf === gc ? 'E' : 'P', gf, gc, rival: loc ? p.visitante : p.local, dia: p.dia, etapa: p.etapa, loc, wo: !!p.wo, planilla: !!p.planilla, gF, gC, fecha: p.fecha }; });
    const g = jugados.filter(x => x.r === 'G').length, e = jugados.filter(x => x.r === 'E').length;
    const pr = b.proximo;
    const etapa = pr?.etapa || b.ultimo?.etapa;
    const tabla = posiciones[dv.id]?.[etapa]?.pos;
    const goleadores = Object.entries(st).filter(([, x]) => x.eq === eq && x.gol > 0).sort((a, b2) => b2[1].gol - a[1].gol).slice(0, 6)
      .map(([c, x]) => `${nom(c)} ${x.gol}`);
    const sancionesEq = (d.sanciones || []).filter(s => s.equipo === eq);
    const susp = sancionesEq.filter(s => s.estado === 'vigente' || s.estado === 'a-confirmar').map(s => `${nom(s.c)}: ${s.resumen}`);
    const ESTADO = { vigente: 'vigente', 'a-confirmar': 'a confirmar', pendiente: 'esperando fallo del Tribunal', cumplida: 'cumplida', 'sin-suspension': 'sin suspensión', 'sin-fallo': 'sin fallo' };
    const sancionesTodas = sancionesEq.sort((a, b2) => b2.fecha.localeCompare(a.fecha)).slice(0, 12).map(s => `${nom(s.c)} [${ESTADO[s.estado] || s.estado}]: ${s.resumen}`);
    // Racha actual: cuántos seguidos sin perder / sin ganar / ganando / perdiendo, con el detalle.
    const racha = (() => {
      const rs = jugados.map(x => x.r); if (!rs.length) return null;
      const seguidos = pred => { let n = 0; for (let i = rs.length - 1; i >= 0 && pred(rs[i]); i--) n++; return n; };
      const cuenta = n => { const t = rs.slice(-n); return `${t.filter(r => r === 'G').length}G ${t.filter(r => r === 'E').length}E ${t.filter(r => r === 'P').length}P`; };
      const ult = rs.at(-1), igual = seguidos(r => r === ult), sinPerder = seguidos(r => r !== 'P'), sinGanar = seguidos(r => r !== 'G');
      const partes = [];
      if (igual >= 2) partes.push(`${igual} ${ult === 'G' ? 'victorias' : ult === 'E' ? 'empates' : 'derrotas'} seguid${ult === 'E' ? 'o' : 'a'}s`);
      else partes.push(`viene de ${ult === 'G' ? 'ganar' : ult === 'E' ? 'empatar' : 'perder'}`);
      if (sinPerder >= 2 && ult !== 'P') partes.push(`${sinPerder} partidos sin perder (${cuenta(sinPerder)})`);
      if (sinGanar >= 2 && ult !== 'G') partes.push(`${sinGanar} partidos sin ganar (${cuenta(sinGanar)})`);
      return partes.join('; ');
    })();
    // Local / visitante, promedios, valla invicta, goleadas (como "Números para pronosticar" de la previa).
    const numeros = (() => {
      const j = jugados.filter(x => !x.wo); if (!j.length) return null;
      const rec = arr => `${arr.filter(x => x.r === 'G').length}G ${arr.filter(x => x.r === 'E').length}E ${arr.filter(x => x.r === 'P').length}P, goles ${arr.reduce((s, x) => s + x.gf, 0)}-${arr.reduce((s, x) => s + x.gc, 0)}`;
      const loc = j.filter(x => x.loc), vis = j.filter(x => !x.loc);
      const pct = f => Math.round(j.filter(f).length / j.length * 100);
      const mejor = [...j].sort((a, b2) => (b2.gf - b2.gc) - (a.gf - a.gc) || b2.gf - a.gf)[0], peor = [...j].sort((a, b2) => (a.gf - a.gc) - (b2.gf - b2.gc) || b2.gc - a.gc)[0];
      const txt = x => `${x.gf}-${x.gc} vs ${x.rival} (${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}, ${x.loc ? 'local' : 'visitante'})`;
      const invictaSeg = (() => { let n = 0; for (let i = j.length - 1; i >= 0 && j[i].gc === 0; i--) n++; return n; })();
      const cuenta = {}; for (const x of j) cuenta[`${x.gf}-${x.gc}`] = (cuenta[`${x.gf}-${x.gc}`] || 0) + 1;
      const rep = Object.entries(cuenta).sort((a, b2) => b2[1] - a[1])[0];
      const invicto = !j.some(x => x.r === 'P') ? ' INVICTO en la temporada.' : !j.some(x => x.r === 'G') ? ' Todavía no ganó ningún partido.' : '';
      return `De local: ${loc.length} PJ, ${rec(loc)}. De visitante: ${vis.length} PJ, ${rec(vis)}.${invicto} Promedio por partido: ${(j.reduce((s, x) => s + x.gf, 0) / j.length).toFixed(1)} goles a favor y ${(j.reduce((s, x) => s + x.gc, 0) / j.length).toFixed(1)} en contra. Resultado más repetido: ${rep[0]} (${rep[1]} veces). `
        + `Valla invicta en ${j.filter(x => x.gc === 0).length} de ${j.length} partidos (${pct(x => x.gc === 0)}%)${invictaSeg >= 2 ? `, lleva ${invictaSeg} seguidos sin recibir goles` : ''}. Marcaron los dos equipos en el ${pct(x => x.gf > 0 && x.gc > 0)}%; más de 2,5 goles en el ${pct(x => x.gf + x.gc > 2.5)}%. `
        + `Sin convertir en ${j.filter(x => x.gf === 0).length} partidos. Mayor goleada: ${mejor.gf > mejor.gc ? txt(mejor) : 'ninguna victoria'}. Peor derrota: ${peor.gf < peor.gc ? txt(peor) : 'ninguna derrota'}.`;
    })();
    // Goles por tramo de 15 minutos (la sección de la página "en qué minuto hace y recibe goles").
    const tramos = (() => {
      const f = TRAMOS.map(() => 0), c = TRAMOS.map(() => 0); let hay = false;
      for (const p of d.partidos) {
        if (!p.planilla || (p.local !== eq && p.visitante !== eq)) continue;
        const yo = p.local === eq ? 'L' : 'V';
        for (const ev of p.eventos || []) if (ev.tipo !== 'cambio' && ev.m != null) { const i = TRAMOS.findIndex(([a, b2]) => ev.m >= a && ev.m <= b2); if (i < 0) continue; hay = true; if (ev.lado === yo) f[i]++; else c[i]++; }
      }
      return hay ? `A favor: ${TRAMOS.map((t, i) => `${nomTramo(t)}' ${f[i]}`).join(', ')}. En contra: ${TRAMOS.map((t, i) => `${nomTramo(t)}' ${c[i]}`).join(', ')}.` : null;
    })();
    const capitan = Object.entries(capitanes).filter(([k]) => k.startsWith(eq + '|')).sort((a, b2) => b2[1] - a[1])[0];
    // Campaña por etapa (primera rueda, título, permanencia...), para no hacer sumar a la IA.
    const porEtapa = [...new Set(jugados.map(x => x.etapa))].map(et => { const j = jugados.filter(x => x.etapa === et); return `${et}: ${j.length} PJ, ${j.filter(x => x.r === 'G').length}G ${j.filter(x => x.r === 'E').length}E ${j.filter(x => x.r === 'P').length}P, goles ${j.reduce((s, x) => s + x.gf, 0)}-${j.reduce((s, x) => s + x.gc, 0)}`; });
    const usados = Object.values(st).filter(x => x.eq === eq);
    // Jugadores del equipo que también jugaron en otra categoría del club esta temporada.
    const dobles = (d.cruces?.[eq] || []).filter(x => x.otras?.length).sort((a, b2) => (b2.otras[0]?.min || 0) - (a.otras[0]?.min || 0)).slice(0, 10)
      .map(x => `${nom(x.c)} (acá ${x.aqui.pj} PJ, ${x.aqui.min}'; ${x.otras.map(o => `${nomDiv(o.div)} ${o.pj} PJ, ${o.min}'`).join(' y ')})`);
    const ultJ = jugados.at(-1);
    const previa = previaDe(eq);
    const caraOtras = previa ? (previa.caraACara || []).filter(x => x.div !== dv.id).slice(0, 8)
      .map(x => `${nomDiv(x.div)} ${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}: ${x.local} ${x.gl}-${x.gv} ${x.visitante}`) : [];
    const pendientesEq = fixture.filter(f => corto(f.local) === eq || corto(f.visitante) === eq);
    equipos.push({
      eq, div: dv.id, divNombre: dv.nombre, cat: cat.nombre,
      prox: pr ? `vs ${pr.rival}, ${fDia(pr.dia)}${pr.hora && pr.hora !== '00:00' ? ' ' + pr.hora : ''}, ${pr.local ? 'de local' : 'de visitante'}${pr.etapa ? ', ' + pr.etapa : ''}${pr.cancha && !/fijar/i.test(pr.cancha) ? ', cancha ' + pr.cancha : ', cancha a fijar'}${pr.dia <= hoy ? ' (es de hoy o ya pasó: si se jugó, el resultado todavía no está cargado)' : ''}` : null,
      rival: pr?.rival || null,
      ultimo: ultJ ? `${fDia(ultJ.dia)} ${ultJ.loc ? 'de local' : 'de visitante'} vs ${ultJ.rival}: ${ultJ.r === 'G' ? 'ganó' : ultJ.r === 'E' ? 'empató' : 'perdió'} ${ultJ.gf}-${ultJ.gc} (${ultJ.etapa}, fecha ${ultJ.fecha}${ultJ.wo ? ', W.O.' : ''}${ultJ.planilla ? (ultJ.gF ? `; goles: ${ultJ.gF}` : '') : '; la Liga todavía no cargó la planilla, no hay detalle de goles'})` : null,
      pos: tabla && tabla[eq] ? `${tabla[eq]}° de ${Object.keys(tabla).length} en ${etapa}` : null,
      campana: `${jugados.length} PJ, ${g}G ${e}E ${jugados.length - g - e}P, goles ${jugados.reduce((s, x) => s + x.gf, 0)}-${jugados.reduce((s, x) => s + x.gc, 0)}`,
      ultimos: jugados.slice(-5).reverse().map(x => `${x.r} ${x.gf}-${x.gc} vs ${x.rival} (${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}${x.loc ? ', local' : ', visitante'})`),
      // Todos los resultados de la temporada: [día, rival, gf, gc, etapa, local(1/0), wo(1/0), goles a favor con autor y minuto, minutos de los goles en contra, nro de fecha].
      resultados: jugados.map(x => [x.dia, x.rival, x.gf, x.gc, x.etapa, x.loc ? 1 : 0, x.wo ? 1 : 0, x.gF, x.gC, x.fecha]),
      racha, numeros, tramos, porEtapa,
      usados: usados.length ? `${usados.length} jugadores distintos en la temporada (${usados.filter(x => x.tit > 0).length} fueron titulares alguna vez)` : null,
      dobles,
      capitan: capitan ? `${nom(capitan[0].split('|')[1])} (llevó la cinta en ${capitan[1]} partidos)` : null,
      bajas: (b.alertas || []).filter(a => a.nivel !== 'baja').map(a => `${a.nombre} (${a.nivel}): ${a.texto}`),
      novedades: (b.alertas || []).filter(a => a.nivel === 'baja').map(a => `${a.nombre}: ${a.texto}`),
      suspendidos: susp,
      sanciones: sancionesTodas,
      once: (b.probable?.once || []).map(x => `${nom(x.c)}${x.arq ? ' (arquero)' : ''}${x.duda ? ' (duda)' : ''}`),
      goleadores,
      caraOtras,
      sinCargar: sinCargar.filter(f => corto(f.local) === eq || corto(f.visitante) === eq)
        .map(f => `${fDia(f.fechaHora.slice(0, 10))} vs ${corto(f.local) === eq ? corto(f.visitante) : corto(f.local)}`),
      quedanTotal: pendientesEq.length,
      quedan: pendientesEq.slice(0, 6)
        .map(f => `${fDia(f.fechaHora.slice(0, 10))}${f.fechaHora.slice(11, 16) !== '00:00' ? ' ' + f.fechaHora.slice(11, 16) : ''} vs ${corto(f.local) === eq ? corto(f.visitante) : corto(f.local)} (${corto(f.local) === eq ? 'local' : 'visitante'}${f.cancha && !/fijar/i.test(f.cancha) ? ', ' + f.cancha : ''})`),
      tabla: etapa && tablas[`${dv.id}|${etapa}`] ? `${dv.id}|${etapa}` : null,
      minTot: minEquipo[eq] || 0,
      escenario: pr && puntos[`${pr.etapa}|${eq}`] != null && puntos[`${pr.etapa}|${pr.rival}`] != null ? (() => {
        const a = puntos[`${pr.etapa}|${eq}`], b2 = puntos[`${pr.etapa}|${pr.rival}`];
        const base = `Contra ${pr.rival}: si gana queda ${a + 3} y ${pr.rival} ${b2}; si empatan ${a + 1} y ${b2 + 1}; si pierde ${a} y ${pr.rival} ${b2 + 3}`;
        const e2 = esc[`${pr.etapa}|${eq}`];
        return e2 && e2.rival === pr.rival ? `${base}.\n${textoEscenario(e2, pr.etapa)}` : base;
      })() : null,
    });
    const i = equipos.length - 1;
    // [nombre, equipo, PJ, titular, minutos, goles, rojas, ingresos desde el banco, camiseta, último partido, carné]
    for (const [c, x] of Object.entries(st)) if (x.eq === eq) jugadores.push([nom(c), i, x.pj, x.tit, x.min, x.gol, x.rojas, x.ingresos, x.cam || d.jugadores[c]?.camiseta || '', x.ultimo, c]);
  }
  // Fixture de la divisional: la próxima fecha (todos los partidos) y la última jugada, con resultados.
  const proxDias = [...new Set(fixture.map(f => f.fechaHora.slice(0, 10)))].sort();
  // "Próxima fecha": los partidos de los próximos 8 días desde el primero que viene.
  const hastaDia = proxDias.length ? new Date(new Date(proxDias[0]).getTime() + 8 * 864e5).toISOString().slice(0, 10) : null;
  const proxPartidos = fixture.filter(f => f.fechaHora.slice(0, 10) <= hastaDia).sort((a, b2) => a.fechaHora.localeCompare(b2.fechaHora))
    .map(f => `${fDia(f.fechaHora.slice(0, 10))}${f.fechaHora.slice(11, 16) !== '00:00' ? ' ' + f.fechaHora.slice(11, 16) : ' (hora a confirmar)'}: ${corto(f.local)} vs ${corto(f.visitante)}${series[f.serie] ? ` [${series[f.serie]}]` : ''}${f.cancha && !/fijar/i.test(f.cancha) ? `, cancha ${f.cancha}` : ''}`);
  const conResultado = partidosOrden.filter(p => p.gl != null && p.gv != null && p.dia <= hoy);
  const ultDia = conResultado.at(-1)?.dia;
  // "Última fecha": los partidos de los 7 días que terminan en el último día con resultado.
  const desdeDia = ultDia ? new Date(new Date(ultDia).getTime() - 6 * 864e5).toISOString().slice(0, 10) : null;
  const ultPartidos = ultDia ? conResultado.filter(p => p.dia >= desdeDia).map(p => { const [gl] = p.planilla ? golesDe(p, 'L') : ['']; const [gv] = p.planilla ? golesDe(p, 'V') : [''];
    return `${fDia(p.dia)}: ${p.local} ${p.gl}-${p.gv} ${p.visitante}${p.wo ? ' (W.O.)' : ''} [${p.etapa}, fecha ${p.fecha}]${gl || gv ? ` — goles: ${[gl && `${p.local}: ${gl}`, gv && `${p.visitante}: ${gv}`].filter(Boolean).join('; ')}` : p.planilla ? '' : ' (sin planilla cargada)'}`; }) : [];
  const wos = partidosOrden.filter(p => p.wo).map(p => `${fDia(p.dia)}: ${p.local} ${p.gl}-${p.gv} ${p.visitante} (W.O.)`);
  const rotacion = d.equipos.map(eq2 => { const js = Object.values(st).filter(x => x.eq === eq2); return [eq2, js.length, js.filter(x => x.tit > 0).length]; }).sort((a, b2) => b2[1] - a[1]);
  const txtP = p => `${fDia(p.dia)} ${p.local} ${p.gl}-${p.gv} ${p.visitante} (${p.etapa})`;
  const jugadosDiv = conResultado.filter(p => !p.wo);
  const goleadas = [...jugadosDiv].sort((a, b2) => Math.abs(b2.gl - b2.gv) - Math.abs(a.gl - a.gv) || (b2.gl + b2.gv) - (a.gl + a.gv)).slice(0, 3).map(txtP);
  const masGoles = [...jugadosDiv].sort((a, b2) => (b2.gl + b2.gv) - (a.gl + a.gv)).slice(0, 3).map(p => `${txtP(p)}: ${p.gl + p.gv} goles`);
  const expulsadosUlt = ultDia ? conResultado.filter(p => p.dia >= desdeDia && p.planilla).flatMap(p => [['L', p.local], ['V', p.visitante]].flatMap(([l, e2]) => p[l].filter(j => j.x).map(j => `${nom(j.c)} (${e2}, vs ${l === 'L' ? p.visitante : p.local})`))) : [];
  const finFixture = fixture.length ? fixture.map(f => f.fechaHora.slice(0, 10)).sort().at(-1) : null;
  // Arqueros (deducidos por el robot) menos vencidos: goles en contra por partido en los que jugaron completo.
  const arqueros = [];
  for (const eq2 of d.equipos) for (const c of d.bajas[eq2]?.probable?.arqueros || []) {
    let pj = 0, gc = 0, invictas = 0;
    for (const p of d.partidos) { if (!p.planilla) continue; const l = p.local === eq2 ? 'L' : p.visitante === eq2 ? 'V' : null; if (!l) continue; const j = p[l].find(x => x.c === c); if (!j || !j.t || j.min < (p.fin || 90) - 5) continue; pj++; const g = l === 'L' ? p.gv : p.gl; gc += g; if (!g) invictas++; }
    if (pj >= 5) arqueros.push([nom(c), eq2, pj, gc, invictas]);
  }
  arqueros.sort((a, b2) => a[3] / a[2] - b2[3] / b2[2]);
  // Más goles de un jugador en un partido.
  let maxGol = [];
  for (const p of d.partidos) if (p.planilla) for (const [l, e2, r] of [['L', p.local, p.visitante], ['V', p.visitante, p.local]]) { if (!mios.has(e2)) continue; for (const j of p[l]) if (j.g.length >= 2) maxGol.push([j.g.length, `${nom(j.c)} (${e2}) ${j.g.length} goles vs ${r} (${ddmm2(p.dia)})`]); }
  maxGol.sort((a, b2) => b2[0] - a[0]);
  maxGol = maxGol.filter(x => x[0] === maxGol[0]?.[0]).slice(0, 6).map(x => x[1]);
  const golesTot = jugadosDiv.reduce((s, p) => s + p.gl + p.gv, 0);
  divisionales[dv.id] = { nombre: dv.nombre, cat: cat.nombre, proxPartidos, ultPartidos, wos, rotacion, goleadas, masGoles, expulsadosUlt, finFixture,
    arqueros: arqueros.slice(0, 8).map(([n, e2, pj, gc, inv], k) => `${k + 1}. ${n} (${e2}) ${(gc / pj).toFixed(2)} goles en contra por partido (${gc} en ${pj} PJ completos, ${inv} vallas invictas)`),
    maxGol, promGoles: jugadosDiv.length ? (golesTot / jugadosDiv.length).toFixed(2) : null,
    partidos: d.partidos.length, jugados: conResultado.length, conPlanilla: d.partidos.filter(p => p.planilla).length, pendientes: fixture.length, equipos: d.equipos.length, actualizado: d.actualizado };
}

// Partidos picantes de la fecha y precisión del once probable (secciones de la portada).
const picantes = existsSync(new URL('picantes.json', DATA)) ? leer('picantes.json').partidos.slice(0, 12).map(p => `${p.divNombre} ${fDia(p.dia)}${p.hora && p.hora !== '00:00' ? ' ' + p.hora : ''}: ${p.l} (${p.pl}°) vs ${p.v} (${p.pv}°), ${p.etapa}`) : [];
const aciertosRaw = existsSync(new URL('aciertos.json', DATA)) ? leer('aciertos.json') : null;
const aciertos = aciertosRaw?.total ? `El once probable de la página acertó en promedio ${aciertosRaw.total.promedio} de 11 titulares en ${aciertosRaw.total.partidos} partidos (el ${aciertosRaw.total.nueveOMas}% de las veces acertó 9 o más; al arquero lo acierta el ${aciertosRaw.total.arquero}%). Por categoría: ${Object.entries(aciertosRaw.categorias || {}).map(([k, v]) => `${k} ${v.promedio} de 11`).join(', ')}.` : null;

// Los jugadores van en un archivo aparte (chat-jugadores.json): el servidor lo carga solo cuando la pregunta
// es sobre jugadores, planteles o rankings, así el resumen principal se lee rápido.
// Resumen de la Liga: cuántos equipos y clubes hay, y qué clubes tienen más equipos.
const clubesRaw = existsSync(new URL('clubes.json', DATA)) ? leer('clubes.json').clubes : {};
const clubesLista = Object.values(clubesRaw).map(c => [c.nombre, c.equipos?.length || 0]).sort((a, b) => b[1] - a[1]);
const resumenLiga = { equipos: equipos.length, divisionales: Object.keys(divisionales).length, clubes: clubesLista.length,
  categorias: indice.categorias.map(c => `${c.nombre} (${c.divisionales.filter(x => !x.oculta).length} divisionales)`),
  clubesConMas: clubesLista.slice(0, 8).map(([n, k]) => `${n} ${k} equipos`) };
const salida = { actualizado: new Date().toISOString(), ultimoResultado, equipos, tablas, tablasRaw, divisionales, picantes, aciertos, resumenLiga };
writeFileSync(new URL('chat-jugadores.json', DATA), JSON.stringify({ actualizado: salida.actualizado, jugadores }));
// Códigos de la Liga de cada divisional, para que el servidor consulte resultados y tablas en vivo (/vivo).
writeFileSync(new URL('ligas.json', DATA), JSON.stringify(Object.fromEntries(VISTAS.map(v => [v.id,
  { torneo: v.torneo, categoria: v.categoria, series: v.copa ? { [v.copa]: v.series[v.copa] } : v.series }]))));
writeFileSync(new URL('chat.json', DATA), JSON.stringify(salida));
console.log(`Chat: ${equipos.length} equipos (${Math.round(JSON.stringify(salida).length / 1024)} KB), ${jugadores.length} jugadores (${Math.round(JSON.stringify(jugadores).length / 1024)} KB).`);
