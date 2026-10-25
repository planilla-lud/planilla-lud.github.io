// Resumen compacto de toda la Liga para el chat (data/chat.json). Lo lee el servidor del chat (worker/)
// para contestar preguntas: por cada equipo, su próximo partido, posición, forma, bajas, suspendidos,
// once probable y goleadores; y un índice de jugadores. Corre después de analizar.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { corto } from './comun.mjs';
import { VISTAS } from './categorias.mjs';

const DATA = new URL('../data/', import.meta.url);
const leer = f => JSON.parse(readFileSync(new URL(f, DATA)));
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fDia = d => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

const indice = leer('indice.json');
const posiciones = existsSync(new URL('posiciones.json', DATA)) ? leer('posiciones.json').divisionales || {} : {};
const equipos = [], jugadores = [], tablas = {};
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
  const fixture = existsSync(dirFix) ? JSON.parse(readFileSync(dirFix)).filter(f => f.fechaHora.slice(0, 10) >= hoy) : [];
  // Tablas de las etapas que se están jugando, con los partidos que le quedan a cada uno y el máximo de
  // puntos al que puede llegar (las cuentas van hechas: la IA gratis suma mal).
  const series = VISTAS.find(v => v.id === dv.id)?.series || {};
  const quedanEn = (eq, et) => fixture.filter(f => series[f.serie] === et && (corto(f.local) === eq || corto(f.visitante) === eq)).length;
  const puntos = {}; // "etapa|equipo" -> puntos oficiales
  for (const [et, t] of Object.entries(posiciones[dv.id] || {})) {
    if (!t?.pos) continue;
    // La tabla oficial de la Liga (con lo que resuelve el Tribunal); si no está, la calculada con los resultados.
    const filas = t.filas?.length ? t.filas.map(([eq, pj, g, e, p2, gf, gc, ps]) => ({ eq, pj, g, e, p: p2, gf, gc, pts: ps }))
      : Object.entries(t.pos).sort((a, b) => a[1] - b[1]).map(([eq]) => ({ eq, ...(pts[eq] || { pts: 0, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 }) }));
    const max = filas.map(x => x.pts + 3 * quedanEn(x.eq, et)), punta = filas[0]?.pts ?? 0;
    tablas[`${dv.id}|${et}`] = filas.map((x, i) => { const q = quedanEn(x.eq, et); puntos[`${et}|${x.eq}`] = x.pts;
      return `${i + 1}° ${x.eq} ${x.pts} pts (${x.pj} PJ, ${x.g}G ${x.e}E ${x.p}P, ${x.gf}-${x.gc}); le quedan ${q}, puede llegar a ${max[i]}; ${max[i] >= punta ? 'todavía puede terminar 1°' : 'ya no puede terminar 1°'}`; });
    // ¿Alguien ya tiene asegurado el primer puesto?
    if (filas.length > 1) tablas[`${dv.id}|${et}`].push(filas[0].pts > Math.max(...max.slice(1))
      ? `${filas[0].eq} ya tiene asegurado el 1° puesto.` : `Nadie tiene asegurado el 1° puesto todavía.`);
  }
  // Estadísticas de cada jugador del equipo en esta divisional.
  const st = {};
  for (const p of d.partidos) if (p.planilla) for (const [lado, eq] of [['L', p.local], ['V', p.visitante]]) {
    if (!mios.has(eq)) continue;
    for (const j of p[lado]) {
      const x = (st[j.c] ??= { eq, pj: 0, tit: 0, min: 0, gol: 0 });
      x.eq = eq; x.pj++; x.tit += j.t; x.min += j.min; x.gol += j.g.length;
    }
  }
  for (const eq of d.equipos) {
    const b = d.bajas[eq] || {};
    const jugados = d.partidos.filter(p => (p.local === eq || p.visitante === eq) && p.gl != null && p.gv != null)
      .map(p => { const loc = p.local === eq; const gf = loc ? p.gl : p.gv, gc = loc ? p.gv : p.gl;
        return { r: gf > gc ? 'G' : gf === gc ? 'E' : 'P', gf, gc, rival: loc ? p.visitante : p.local, dia: p.dia, etapa: p.etapa }; });
    const g = jugados.filter(x => x.r === 'G').length, e = jugados.filter(x => x.r === 'E').length;
    const pr = b.proximo;
    const etapa = pr?.etapa || b.ultimo?.etapa;
    const tabla = posiciones[dv.id]?.[etapa]?.pos;
    const goleadores = Object.entries(st).filter(([, x]) => x.eq === eq && x.gol > 0).sort((a, b2) => b2[1].gol - a[1].gol).slice(0, 4)
      .map(([c, x]) => `${nom(c)} ${x.gol}`);
    const susp = (d.sanciones || []).filter(s => s.equipo === eq && (s.estado === 'vigente' || s.estado === 'a-confirmar'))
      .map(s => `${nom(s.c)}: ${s.resumen}`);
    equipos.push({
      eq, div: dv.id, divNombre: dv.nombre, cat: cat.nombre,
      prox: pr ? `vs ${pr.rival}, ${fDia(pr.dia)}${pr.hora && pr.hora !== '00:00' ? ' ' + pr.hora : ''}, ${pr.local ? 'de local' : 'de visitante'}${pr.etapa ? ', ' + pr.etapa : ''}${pr.cancha && !/fijar/i.test(pr.cancha) ? ', cancha ' + pr.cancha : ''}${pr.dia <= hoy ? ' (es de hoy o ya pasó: si se jugó, el resultado todavía no está cargado)' : ''}` : null,
      rival: pr?.rival || null,
      pos: tabla && tabla[eq] ? `${tabla[eq]}° de ${Object.keys(tabla).length} en ${etapa}` : null,
      campana: `${jugados.length} PJ, ${g}G ${e}E ${jugados.length - g - e}P, goles ${jugados.reduce((s, x) => s + x.gf, 0)}-${jugados.reduce((s, x) => s + x.gc, 0)}`,
      ultimos: jugados.slice(-5).reverse().map(x => `${x.r} ${x.gf}-${x.gc} vs ${x.rival} (${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)})`),
      // Todos los resultados de la temporada (para el cara a cara y preguntas de campaña): [día, rival, gf, gc, etapa].
      resultados: jugados.map(x => [x.dia, x.rival, x.gf, x.gc, x.etapa]),
      bajas: (b.alertas || []).filter(a => a.nivel !== 'baja').map(a => `${a.nombre} (${a.nivel}): ${a.texto}`),
      suspendidos: susp,
      once: (b.probable?.once || []).map(x => `${nom(x.c)}${x.arq ? ' (arquero)' : ''}${x.duda ? ' (duda)' : ''}`),
      goleadores,
      quedan: fixture.filter(f => corto(f.local) === eq || corto(f.visitante) === eq).slice(0, 6)
        .map(f => `${fDia(f.fechaHora.slice(0, 10))} vs ${corto(f.local) === eq ? corto(f.visitante) : corto(f.local)} (${corto(f.local) === eq ? 'local' : 'visitante'})`),
      tabla: etapa && tablas[`${dv.id}|${etapa}`] ? `${dv.id}|${etapa}` : null,
      escenario: pr && puntos[`${pr.etapa}|${eq}`] != null && puntos[`${pr.etapa}|${pr.rival}`] != null ? (() => {
        const a = puntos[`${pr.etapa}|${eq}`], b2 = puntos[`${pr.etapa}|${pr.rival}`];
        return `Contra ${pr.rival}: si gana queda ${a + 3} y ${pr.rival} ${b2}; si empatan ${a + 1} y ${b2 + 1}; si pierde ${a} y ${pr.rival} ${b2 + 3}`;
      })() : null,
    });
    const i = equipos.length - 1;
    for (const [c, x] of Object.entries(st)) if (x.eq === eq) jugadores.push([nom(c), i, x.pj, x.tit, x.min, x.gol]);
  }
}

const salida = { actualizado: new Date().toISOString(), ultimoResultado, equipos, jugadores, tablas };
writeFileSync(new URL('chat.json', DATA), JSON.stringify(salida));
console.log(`Chat: ${equipos.length} equipos, ${jugadores.length} jugadores, ${Math.round(JSON.stringify(salida).length / 1024)} KB.`);
