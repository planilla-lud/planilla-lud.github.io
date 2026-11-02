// Detalle bajo demanda: cuando la pregunta es por un partido puntual (formación, cambios, minuto a minuto)
// o por la temporada de un jugador partido a partido, el servidor abre los datos completos de esa
// divisional (data/<div>.json, los mismos que usa la página) en vez de cargar todo siempre.

const cache = new Map(); // div -> { datos, hasta }
async function divisional(env, div) {
  const c = cache.get(div);
  if (c && Date.now() < c.hasta) return c.datos;
  const base = (env.DATOS_URL || 'https://planilla-lud.github.io/data/chat.json').replace(/chat\.json$/, `${div}.json`);
  const r = await fetch(base, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`sin ${div}.json`);
  const datos = await r.json();
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  cache.set(div, { datos, hasta: Date.now() + 10 * 60e3 });
  return datos;
}
const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fDia = d => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${ddmm(d)}`;

// La temporada de un jugador partido a partido (minutos, titular o suplente, goles, roja).
export async function jugadorPartidos(env, div, carne, nombre) {
  const d = await divisional(env, div);
  const filas = [];
  for (const p of [...d.partidos].sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora))) {
    if (!p.planilla) continue;
    for (const [lado, eq, rival] of [['L', p.local, p.visitante], ['V', p.visitante, p.local]]) {
      const j = p[lado].find(x => x.c === carne); if (!j) continue;
      const gf = lado === 'L' ? p.gl : p.gv, gc = lado === 'L' ? p.gv : p.gl;
      filas.push(`${fDia(p.dia)} ${eq} ${gf}-${gc} ${rival} (${lado === 'L' ? 'local' : 'visitante'}, ${p.etapa}): ${j.min}'${j.t ? ' titular' : ' entró desde el banco'}${j.s?.length ? `, salió a los ${j.s[0]}'` : ''}${j.e?.length ? `, entró a los ${j.e[0]}'` : ''}${j.g.length ? `, gol${j.g.length > 1 ? 'es' : ''} a los ${j.g.join("', ")}'` : ''}${j.x ? ', EXPULSADO' : ''}${j.cap ? ', capitán' : ''}`);
    }
  }
  // Partidos del equipo en los que no jugó (para "cuántos se perdió").
  const equipo = d.jugadores[carne]?.equipo;
  const sinJugar = equipo ? d.partidos.filter(p => p.planilla && (p.local === equipo || p.visitante === equipo) && !p[p.local === equipo ? 'L' : 'V'].some(x => x.c === carne)).map(p => `${ddmm(p.dia)} vs ${p.local === equipo ? p.visitante : p.local}`) : [];
  return `TEMPORADA DE ${nombre} PARTIDO A PARTIDO (${d.nombre}):\n${filas.join('\n') || 'no figura en ninguna planilla'}${sinJugar.length ? `\nPartidos de ${equipo} con planilla en los que NO jugó: ${sinJugar.join('; ')}` : ''}`;
}

// Un partido con todo: goles con minuto, cambios y formaciones. Si no se da el día, el último entre esos dos.
export async function partidoDetalle(env, div, eqA, eqB, dia = null) {
  const d = await divisional(env, div);
  const entre = d.partidos.filter(p => p.gl != null && ((p.local === eqA && p.visitante === eqB) || (p.local === eqB && p.visitante === eqA)) && (!dia || p.dia === dia))
    .sort((a, b) => b.dia.localeCompare(a.dia));
  const p = entre[0];
  if (!p) return null;
  const nom = c => d.jugadores[c]?.nombre || c;
  const otros = entre.length > 1 ? `\n(Hubo otros partidos entre los dos esta temporada: ${entre.slice(1).map(x => `${ddmm(x.dia)} ${x.local} ${x.gl}-${x.gv} ${x.visitante}`).join('; ')}.)` : '';
  if (!p.planilla) return `PARTIDO ${p.local} ${p.gl}-${p.gv} ${p.visitante} (${fDia(p.dia)}, ${p.etapa}, fecha ${p.fecha}${p.cancha ? ', ' + p.cancha : ''}): ${p.wo ? 'ganado por W.O., no hay planilla' : 'la Liga todavía no cargó la planilla, no hay detalle de goles ni formaciones'}.` + otros;
  const ev = (p.eventos || []).map(e => e.tipo === 'cambio' ? `${e.m}' cambio en ${e.lado === 'L' ? p.local : p.visitante}: entra ${e.entraN}, sale ${e.saleN}`
    : `${e.m ?? '?'}' gol de ${e.lado === 'L' ? p.local : p.visitante}: ${e.nombre}${e.tipo === 'gol-contra' ? ' (en contra)' : ''}`);
  const form = (lado, eq) => `${eq}: titulares ${p[lado].filter(j => j.t).map(j => `${nom(j.c)}${j.cap ? ' (C)' : ''}${j.x ? ' (expulsado)' : ''}`).join(', ')}` + (p[lado].some(j => !j.t) ? `; entraron ${p[lado].filter(j => !j.t).map(j => `${nom(j.c)} (${j.min}')`).join(', ')}` : '');
  return `PARTIDO ${p.local} ${p.gl}-${p.gv} ${p.visitante} (${fDia(p.dia)}${p.hora && p.hora !== '00:00' ? ' ' + p.hora : ''}, ${p.etapa}, fecha ${p.fecha}${p.cancha ? ', cancha ' + p.cancha : ''}):\nMinuto a minuto: ${ev.join('; ') || 'sin goles ni cambios en la planilla'}.\nFormaciones. ${form('L', p.local)}. ${form('V', p.visitante)}.` + otros;
}

// Qué detalle hace falta para esta pregunta, según lo que encontró buscar().
export async function contextoDetalle(env, datos, hallado) {
  const partes = [];
  const pide = hallado.pide || {};
  try {
    if (pide.jugadorDetalle && hallado.jugadores.length) {
      const j = hallado.jugadores[0], e = datos.equipos[j[1]];
      if (j[10]) partes.push(await jugadorPartidos(env, e.div, j[10], j[0]));
    }
    if (pide.detallePartido) {
      const eqs = hallado.equipos.slice(0, 2).map(i => datos.equipos[i]);
      // Dos equipos de la misma divisional, o un equipo y "el último partido".
      const [a, b] = eqs;
      const dia = (hallado.pregunta || '').match(/\b(\d{1,2})[\/-](\d{1,2})\b/);
      const fecha = dia ? `2026-${dia[2].padStart(2, '0')}-${dia[1].padStart(2, '0')}` : null;
      if (a && b && a.div === b.div) { const t = await partidoDetalle(env, a.div, a.eq, b.eq, fecha); if (t) partes.push(t); }
      else if (a && a.resultados?.length && /\b(ultimo|ayer|el domingo|el sabado|el finde|fin de semana|pasado)\b/.test(hallado.pregunta || '')) {
        const u = a.resultados.at(-1); const t = await partidoDetalle(env, a.div, a.eq, u[1], u[0]); if (t) partes.push(t);
      }
    }
  } catch (e) { console.log('detalle:', e.message); }
  return partes.join('\n\n');
}
