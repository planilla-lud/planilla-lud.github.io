// Posiciones de cada etapa y los partidos más picantes de la próxima fecha, para la web.
// Lee data/<divisional>.json (lo escribe analizar.mjs) y escribe:
//  - data/posiciones.json: la tabla de cada grupo que muestra la sección Tabla (filas con PJ, G, E, P,
//    goles y puntos, y la posición de cada equipo). Sale de la tabla oficial de la Liga (posiciones/api.php,
//    cargarPosiciones) cuando responde, porque incluye los partidos que el Tribunal da por ganados; si no
//    responde, se calcula con los resultados (filasCalculadas() abajo).
//  - data/picantes.json: chico, así la portada no tiene que bajar las 14 divisionales para compararlas.
//
// Picante = cruce entre dos de los cuatro primeros del grupo de arriba (título / título y ascenso), o
// entre dos de los cuatro últimos del grupo de permanencia (la pelea por no descender). La copa de plata
// no cuenta: es de las divisionales más bajas, donde no hay descenso.
// Orden: un puntaje de "picantez" que junta todas las categorías. Suman las posiciones (arriba: 1° = 4,
// 2° = 3, 3° = 2, 4° = 1; abajo, al revés: último = 4, penúltimo = 3...) y la divisional (A = 6, B = 5 ...
// G = 0, igual para Mayores, Sub 20 y Reserva; las otras categorías, 2 menos): la divisional pesa, pero un 1° vs 2° de una C puede
// ganarle a un 2° vs 4° de una A, y un último vs penúltimo de una A, a un 3° vs 4° de una B.
// Si empatan, primero la letra más alta y después la categoría (el orden de categorias.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VISTAS } from './categorias.mjs';
import { TEMPORADA, corto } from './comun.mjs';

const OUT = new URL('../data/', import.meta.url);
const API = 'https://ligauniversitaria.org.uy/posiciones/api.php';
const MAX = 30;

const LETRAS = 'ABCDEFG';
// Puntos por ubicación: arriba cuenta desde el 1°; en el descenso, desde el último.
const ubic = (pos, n, tipo) => tipo === 'descenso' ? 5 - (n - pos + 1) : 5 - pos;
// Pre Senior, Más 40, Sub 18 y Sub 16 entran, pero con 2 puntos menos: lo que más se mira es Mayores, Sub 20 y Reserva.
// Sub 18 y Sub 16 no tienen letra (un solo bloque): cuentan como una divisional del medio.
const MENOS = { presenior: 2, mas40: 2, sub18: 2, sub16: 2 };
const pesoLetra = l => LETRAS.includes(l) && l.length === 1 ? Math.max(0, 6 - LETRAS.indexOf(l)) : 3;
const picantez = p => ubic(p.pl, p.n, p.tipo) + ubic(p.pv, p.n, p.tipo) + pesoLetra(p.letra) - (MENOS[p.cat] || 0);
// ¿Es picante? Devuelve 'titulo', 'descenso' o null. n = cantidad de equipos del grupo.
export function tipoPicante(etapa, pl, pv, n) {
  if (!pl || !pv) return null;
  const peso = pesoEtapa(etapa);
  if (peso === 0 && pl <= 4 && pv <= 4) return 'titulo';
  if (peso === 2 && n >= 6 && pl > n - 4 && pv > n - 4) return 'descenso';
  return null;
}
const pesoEtapa = e => /permanencia|descenso/i.test(e || '') ? 2 : /plata|bronce|competencia|confraternidad|amistad/i.test(e || '') ? 1 : 0;

// Tabla calculada de una etapa, como el reglamento (art. 3). La primera fase (primera rueda o series) y
// las copas cuentan solo sus partidos (las copas arrancan de cero: así lo muestra la tabla oficial); en
// título, ascenso y permanencia cada equipo conserva lo de la primera rueda, así que cuenta toda la
// temporada. Puntos, diferencia de gol, goles a favor y, si siguen empatados, lo que hicieron entre ellos.
// Filas: [equipo, PJ, G, E, P, GF, GC, Pts], ordenadas. Es la misma cuenta que filasCalculadas() en index.html.
const primeraFase = et => /^(primera rueda|serie \d+)$/i.test(et || '');
const soloSusPartidos = et => primeraFase(et) || /^copa/i.test(et || '');
export function filasCalculadas(d, etapa, equipos) {
  const jugados = d.partidos.filter(p => p.gl != null && p.gv != null && (!soloSusPartidos(etapa) || p.etapa === etapa));
  const tabla = (solo) => {
    const t = {};
    const suma = (eq, gf, gc) => { const x = t[eq] ||= { pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 }; x.pj++; x[gf > gc ? 'g' : gf === gc ? 'e' : 'p']++; x.gf += gf; x.gc += gc; x.pts += gf > gc ? 3 : gf === gc ? 1 : 0; };
    for (const p of jugados) if (!solo || (solo.has(p.local) && solo.has(p.visitante))) { suma(p.local, p.gl, p.gv); suma(p.visitante, p.gv, p.gl); }
    return t;
  };
  const total = tabla();
  const cero = { pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 };
  const cmp = t => (a, b) => { const x = t[a] || cero, y = t[b] || cero; return y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf; };
  const orden = [...equipos].sort(cmp(total));
  for (let i = 0; i < orden.length;) {
    let j = i + 1;
    while (j < orden.length && cmp(total)(orden[i], orden[j]) === 0) j++;
    if (j - i > 1) { const run = orden.slice(i, j); orden.splice(i, j - i, ...run.sort(cmp(tabla(new Set(run))))); }
    i = j;
  }
  return orden.map(eq => { const x = total[eq] || cero; return [eq, x.pj, x.g, x.e, x.p, x.gf, x.gc, x.pts]; });
}
const aPos = filas => Object.fromEntries(filas.map((f, i) => [f[0], i + 1]));
function posiciones(d) {
  return Object.fromEntries(Object.entries(grupos(d)).map(([et, g]) => [et, aPos(filasCalculadas(d, et, g))]));
}
// Grupos que muestra la sección Tabla: los de la fecha que viene y los jugados en los últimos 10 días (si no
// hay fecha programada) y, en las divisionales de verdad (no las copas de Sub 18 y Sub 16), la primera fase.
// Misma regla que etapasTabla() en index.html.
export function etapasTabla(d, letra) {
  const g = grupos(d);
  // En las divisionales con letra, además de las de la fecha que viene, las que se jugaron en los últimos
  // 10 días: si un grupo (título, por ejemplo) no tiene partido programado todavía o se jugó entre semana,
  // su tabla no desaparece. Sin fecha programada, en Sub 18 y Sub 16 quedan las del último día jugado.
  const ult = d.partidos.map(p => p.dia).sort().at(-1);
  const desde = !ult ? '' : letra?.length === 1 ? new Date(Date.parse(ult) - 10 * 864e5).toISOString().slice(0, 10) : ult;
  let actuales = [...new Set(Object.values(d.previas || {}).map(f => f.etapa))];
  if (!actuales.length || letra?.length === 1)
    actuales = [...new Set([...actuales, ...d.partidos.filter(p => p.dia >= desde).map(p => p.etapa)])];
  actuales.sort((a, b) => primeraFase(a) - primeraFase(b) || pesoEtapa(a) - pesoEtapa(b));
  const primeras = letra?.length === 1 ? Object.keys(g).filter(primeraFase).sort() : actuales.filter(primeraFase);
  return [...actuales.filter(et => !primeraFase(et)), ...primeras].filter(et => g[et]);
}
// Equipos de cada etapa: los que jugaron en ella o tienen partido programado ("Fecha Libre" no es un equipo:
// es el que descansa esa fecha).
const libre = eq => /^fecha libre$/i.test(eq);
function grupos(d) {
  const g = {};
  for (const p of d.partidos) for (const eq of [p.local, p.visitante]) if (!libre(eq)) (g[p.etapa] ||= new Set()).add(eq);
  for (const f of Object.values(d.previas || {})) for (const eq of [f.l, f.v]) if (!libre(eq)) (g[f.etapa] ||= new Set()).add(eq);
  return g;
}

// Tabla oficial de una serie, con los nombres como los usa la web: filas [equipo, PJ, G, E, P, GF, GC, Pts].
// null si la Liga no responde o si algún equipo no coincide con los del grupo (en ese caso vale más la
// cuenta propia). Si la Liga falla tres veces seguidas, se deja de preguntar en esta corrida: cuando se
// cae, cada pedido puede tardar 25 segundos y son unos cien.
let fallasSeguidas = 0;
async function oficial(div, serie, equipos) {
  if (fallasSeguidas >= 3) return null;
  try {
    const q = new URLSearchParams({ action: 'cargarPosiciones', temporada: TEMPORADA, deporte: 'F', torneo: div.torneo, categoria: div.categoria, serie });
    const r = await fetch(`${API}?${q}`, { headers: { 'User-Agent': 'planilla-lud (github.com/planilla-lud/planilla-lud.github.io)' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(r.status);
    const t = await r.json();
    fallasSeguidas = 0;
    const filas = t.map(x => [corto(x.Institucion), +x.PJ, +x.PG, +x.PE, +x.PP, +x.GF, +x.GC, +x.Puntos]);
    if (!filas.length || !filas.every(f => equipos.has(f[0]))) return null;
    // La Liga lista solo a los que ya jugaron en la etapa (pasa al arrancar las copas): el resto, abajo con cero.
    for (const eq of equipos) if (!filas.some(f => f[0] === eq)) filas.push([eq, 0, 0, 0, 0, 0, 0, 0]);
    return filas;
  } catch { fallasSeguidas++; return null; }
}

// Si nada cambió, se conserva la fecha (y no hay commit). compacto: sin sangría (posiciones.json tiene
// miles de filas cortas).
function guardar(nombre, salida, compacto) {
  const archivo = new URL(nombre, OUT);
  try {
    const viejo = JSON.parse(readFileSync(archivo));
    if (JSON.stringify({ ...viejo, actualizado: null }) === JSON.stringify({ ...salida, actualizado: null })) salida.actualizado = viejo.actualizado;
  } catch {}
  writeFileSync(archivo, (compacto ? JSON.stringify(salida) : JSON.stringify(salida, null, 1)) + '\n');
}

export async function armarPicantes() {
  const partidos = [], tablas = {};
  let oficiales = 0, calculadas = 0;
  for (const [orden, div] of VISTAS.entries()) { // las copas de Sub 18 y Sub 16, cada una por separado
    const archivo = new URL(`${div.id}.json`, OUT);
    if (!existsSync(archivo)) continue;
    const d = JSON.parse(readFileSync(archivo));
    const pos = posiciones(d), g = grupos(d);
    // Las etapas de la sección Tabla (incluye las que tienen partidos por jugar), de a varias a la vez.
    const etapas = etapasTabla(d, div.letra);
    const filas = await Promise.all(etapas.map(async etapa => {
      const serie = Object.keys(div.series).find(s => div.series[s] === etapa);
      return (serie && await oficial(div, serie, g[etapa])) || null;
    }));
    tablas[div.id] = {};
    etapas.forEach((etapa, i) => {
      const f = filas[i] || filasCalculadas(d, etapa, g[etapa]);
      if (filas[i]) oficiales++; else calculadas++;
      pos[etapa] = aPos(f);
      tablas[div.id][etapa] = { fuente: filas[i] ? 'oficial' : 'calculada', pos: pos[etapa], filas: f };
    });
    const altas = eq => (d.bajas?.[eq]?.alertas || []).filter(a => a.nivel === 'alta').length;
    for (const [k, f] of Object.entries(d.previas || {})) {
      const pl = pos[f.etapa]?.[f.l], pv = pos[f.etapa]?.[f.v], n = Object.keys(pos[f.etapa] || {}).length;
      const tipo = tipoPicante(f.etapa, pl, pv, n);
      if (!tipo) continue;
      // Para mostrar: en los grupos de abajo, la posición en la tabla general (el 1° de la permanencia es el 9°).
      const arriba = Object.keys(pos).find(et => /t[ií]tulo/i.test(et));
      const base = pesoEtapa(f.etapa) && arriba ? Object.keys(pos[arriba]).length : 0;
      partidos.push({ div: div.id, divNombre: div.nombre, letra: div.letra, cat: div.categoriaId, orden, k, l: f.l, v: f.v, dia: f.dia, hora: f.hora, etapa: f.etapa, pl, pv, n, base, tipo, altasL: altas(f.l), altasV: altas(f.v) });
    }
  }
  partidos.sort((a, b) => picantez(b) - picantez(a) || a.letra.localeCompare(b.letra) || a.orden - b.orden || (a.dia + a.hora).localeCompare(b.dia + b.hora));
  guardar('posiciones.json', { actualizado: new Date().toISOString(), divisionales: tablas }, true);
  const salida = { actualizado: new Date().toISOString(), partidos: partidos.slice(0, MAX).map(({ orden, letra, cat, ...p }) => p) };
  guardar('picantes.json', salida);
  console.log(`Posiciones: ${oficiales} tablas oficiales, ${calculadas} calculadas. Picantes: ${salida.partidos.length} partidos (${salida.partidos.filter(p => p.tipo === 'descenso').length} por el descenso) en ${new Set(salida.partidos.map(p => p.div)).size} divisionales.`);
  return salida;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await armarPicantes();
