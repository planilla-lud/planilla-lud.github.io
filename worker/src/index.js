// Servidor del chat de Planilla LUD (Cloudflare Worker).
// Recibe la pregunta desde la página, busca los datos que hacen falta en data/chat.json (lo arma el robot)
// y le pide la respuesta a una IA gratis: primero Workers AI de Cloudflare (cuota diaria gratis); si se
// acabó la cuota y hay claves configuradas, Gemini o Groq (también con plan gratis). Nada de esto cobra:
// si se acaban todas las cuotas del día, el chat avisa que vuelvan mañana.
import { buscar, contexto, norm, necesitaJugadores } from './buscar.js';
import { contextoDetalle } from './detalle.js';
import { corto, TEMPORADA } from '../../scripts/comun.mjs';

const ORIGENES = ['https://planilla-lud.github.io', 'http://localhost:8774', 'http://127.0.0.1:8774'];
const MAX_PREGUNTA = 400, MAX_HISTORIAL = 6;

const cors = origen => ({
  'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin',
});
const json = (obj, status, origen) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origen) } });

// Datos de la página, guardados un rato en memoria.
let datos = null, datosHasta = 0;
// ---- resultados provisorios (cargados a mano mientras la Liga no sube el oficial) ----
// Se guardan en Cloudflare KV (binding PROV), en una sola clave "lista". Solo se cargan con ADMIN_CLAVE.
async function provisorios(env) {
  if (!env.PROV) return [];
  try { return JSON.parse(await env.PROV.get('lista') || '[]'); } catch { return []; }
}
const texto = (x, n = 60) => typeof x === 'string' && x.trim() && x.length <= n ? x.trim() : null;
async function cambiarProvisorio(env, c) {
  if (!env.PROV || !env.ADMIN_CLAVE) return [503, { error: 'Falta configurar la carga de provisorios.' }];
  if (c.clave !== env.ADMIN_CLAVE) return [403, { error: 'Clave incorrecta.' }];
  const div = texto(c.div, 40), l = texto(c.l), v = texto(c.v);
  if (!div || !/^[a-z0-9-]+$/.test(div) || !l || !v) return [400, { error: 'Faltan datos del partido.' }];
  let lista = (await provisorios(env)).filter(x => !(x.div === div && x.l === l && x.v === v));
  if (c.accion === 'poner') {
    const gl = Number(c.gl), gv = Number(c.gv);
    if (![gl, gv].every(n => Number.isInteger(n) && n >= 0 && n <= 30)) return [400, { error: 'Goles inválidos.' }];
    lista.push({ div, l, v, gl, gv, dia: texto(c.dia, 10), etapa: texto(c.etapa), cargado: new Date().toISOString() });
  }
  lista = lista.slice(-200);
  await env.PROV.put('lista', JSON.stringify(lista));
  return [200, { ok: true, lista }];
}

// ---- en vivo: resultados y tabla oficial directo de la Liga ----
// La página pide /vivo?div=mayores-a y recibe lo que la Liga tiene AHORA (guardado 5 minutos), por si el
// robot todavía no pasó. Solo resultados y posiciones: las planillas las sigue bajando el robot.
let ligas = null, ligasHasta = 0;
async function cargarLigas(env) {
  if (ligas && Date.now() < ligasHasta) return ligas;
  const base = (env.DATOS_URL || 'https://planilla-lud.github.io/data/chat.json').replace(/chat\.json$/, 'ligas.json');
  const r = await fetch(base, { cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error('sin ligas.json');
  ligas = await r.json(); ligasHasta = Date.now() + 30 * 60e3;
  return ligas;
}
const LIGA = 'https://ligauniversitaria.org.uy';
async function deLaLiga(ruta, params) {
  const q = new URLSearchParams({ temporada: TEMPORADA, deporte: 'F', ...params }).toString();
  const r = await fetch(`${LIGA}/${ruta}?${q}`, { headers: { 'User-Agent': 'planilla-lud (github.com/planilla-lud/planilla-lud.github.io)' }, cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) throw new Error(`Liga ${r.status}`);
  const t = (await r.text()).trim();
  try { const j = JSON.parse(t || '[]'); return Array.isArray(j) ? j : []; } catch { return []; }
}
async function enVivo(env, div) {
  const L = (await cargarLigas(env))[div];
  if (!L) return null;
  const partidos = [], tablas = {};
  await Promise.all(Object.entries(L.series).map(async ([serie, etapa]) => {
    const base = { action: 'cargarPartidos', torneo: L.torneo, categoria: L.categoria, serie };
    const [jug, pos] = await Promise.all([
      deLaLiga('resultados/api.php', base).catch(() => []),
      deLaLiga('posiciones/api.php', { ...base, action: 'cargarPosiciones' }).catch(() => []),
    ]);
    for (const p of jug) if (p.GL !== '' && p.GL != null && /^\d+$/.test(String(p.GL)))
      partidos.push({ id: String(p.ID), serie, etapa, fecha: Number(p.Fecha), dia: String(p.Fecha_Hora).slice(0, 10), hora: String(p.Fecha_Hora).slice(11, 16),
        local: corto(p.Locatario), visitante: corto(p.Visitante), gl: Number(p.GL), gv: Number(p.GV) });
    if (pos.length) tablas[etapa] = pos.map(x => [corto(x.Institucion), +x.PJ, +x.PG, +x.PE, +x.PP, +x.GF, +x.GC, +x.Puntos]);
  }));
  return { div, consultado: new Date().toISOString(), partidos, tablas };
}

async function cargarDatos(env) {
  if (datos && Date.now() < datosHasta) return datos;
  const r = await fetch(env.DATOS_URL || 'https://planilla-lud.github.io/data/chat.json', { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`No pude leer los datos (${r.status})`);
  datos = await r.json(); datosHasta = Date.now() + 10 * 60e3;
  return datos;
}
// El índice de jugadores (data/chat-jugadores.json) se carga solo cuando la pregunta lo necesita.
let jugadoresHasta = 0;
async function cargarJugadores(env, d) {
  if (d.jugadores && Date.now() < jugadoresHasta) return;
  const url = (env.DATOS_URL || 'https://planilla-lud.github.io/data/chat.json').replace(/chat\.json$/, 'chat-jugadores.json');
  const r = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`No pude leer los jugadores (${r.status})`);
  d.jugadores = (await r.json()).jugadores; jugadoresHasta = Date.now() + 10 * 60e3;
}

// Freno simple para que nadie se coma la cuota del día: 12 preguntas por minuto por persona.
const visitas = new Map();
function frenar(ip) {
  const ahora = Date.now(), l = (visitas.get(ip) || []).filter(t => ahora - t < 60e3);
  l.push(ahora); visitas.set(ip, l);
  if (visitas.size > 5000) visitas.clear();
  return l.length > 12;
}

function instrucciones(ctx, ultimo) {
  const hoy = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Montevideo' });
  return `Sos el asistente de Planilla LUD, una página de la Liga Universitaria de Deportes (fútbol amateur de Uruguay).
Hoy es ${hoy}. Los datos tienen resultados cargados hasta el ${ultimo || 'último partido con planilla'}; lo que se jugó después todavía no está (la página se actualiza los domingos de noche y de lunes a jueves).
Cómo responder:
- En español rioplatense, como un amigo que sabe de fútbol: claro y al grano (hasta 8 líneas o una lista corta). No arranques con "Che"; usalo muy de vez en cuando. Al usuario hablale de "vos", y a los equipos en tercera persona ("ELF tiene 31", no "tenés 31").
- Hablá en primera persona ("no tengo ese dato", nunca "no lo tenés").
- Basate en los DATOS de abajo y no inventes jugadores, resultados, fechas ni números.
- Para preguntas de enfrentamientos entre dos equipos usá el CARA A CARA (tiene todos los partidos de la temporada). "Últimos resultados" son solo los 5 más recientes: no digas "el único" ni "nunca" mirando solo esos.
- Podés RAZONAR y hacer cuentas con esos datos: qué pasa en la tabla si un equipo gana (3 puntos), empata (1) o pierde; cuántos puntos le sacan a otro; quién depende de sí mismo con los partidos que quedan; comparar rachas. Mostrá la cuenta en una línea de texto común (por ejemplo "14 de 30 = 47%"), nunca con fórmulas ni LaTeX.
- Si el usuario te cuenta resultados que no están en los datos (por ejemplo, de hoy), creele y usalos para razonar, aclarando una vez que todavía no están cargados en la página.
- Si no sabés cuántos equipos clasifican, ascienden o descienden, no lo inventes: hablá de posiciones y puntos.
- Si un equipo tiene partidos "ya jugados sin resultado cargado", la tabla todavía no los incluye: avisalo y contalo como partido que puede sumar (si el usuario te dice el resultado, usalo).
- En las cuentas de campeonato considerá también los empates (1 punto), no solo ganar o perder, y si dos pueden terminar igualados en puntos decí que lo define el desempate.
- PUESTOS: nunca reordenes una tabla vos. Si la pregunta es en qué puesto queda un equipo según un resultado, usá los "PUESTOS YA CALCULADOS" del equipo (ya cuentan todos los resultados posibles de los demás) y copiá ese rango tal cual ("termina 3° o 4°"). Si no están, decí entre qué puestos puede quedar comparando puntos, sin inventar un orden.
- Si escribís una tabla o una lista de posiciones, el que tiene más puntos va siempre arriba. Nunca pongas un equipo con más puntos debajo de uno con menos.
- Si la pregunta es de toda una divisional (tabla, goleadores, suspendidos) y los datos son de otra divisional que la que pidió, decilo.
- Nunca digas que un equipo "asegura" o que "ya no lo alcanzan" sin comparar: un equipo asegura el 1° solo si sus puntos (después del resultado que se plantea) superan el "puede llegar a" de TODOS los demás, contando que a los otros les siguen quedando sus partidos. Si no se cumple, decí que todavía lo pueden alcanzar y quién.
- Las "posibles bajas" son deducciones de las planillas oficiales, no partes médicos: aclaralo solo si hablás de lesiones.
- Los NÚMEROS YA CALCULADOS (racha, local/visitante, promedios, valla invicta, goleadas, tramos, rankings, resumen de la tabla, diferencia de gol "DIF") se copian tal cual: no los recalcules ni los contradigas.
- Diferencia de gol = DIF de la tabla. Mejor ataque = más GF; mejor defensa = menos GC. Si la pregunta es "quién tiene mejor X", usá el "Resumen ya calculado" de la tabla.
- Si preguntan por un partido puntual y tenés la línea del PARTIDO con minuto a minuto, respondé con los goles, el minuto y el autor; si solo tenés el resultado en la lista de resultados, dalo y decí que la planilla no tiene el detalle.
- Si preguntan quién es "el 9" o un número de camiseta, buscalo en el PLANTEL (campo camiseta). Si nadie lo usa, decilo.
- Si preguntan por la próxima fecha de una divisional, listá TODOS los partidos de "PRÓXIMA FECHA" con día, hora y cancha; si preguntan cómo salió la fecha, usá "ÚLTIMA FECHA JUGADA".
- Si un jugador aparece en varias categorías, decilo (por ejemplo "juega en Mayores A y también en Sub 20 A").
- Si hay VARIOS jugadores con el mismo nombre o apellido y no queda claro cuál, nombralos con su club y preguntá cuál.
- Si hay "PARA TERMINAR 1°" o "PARA NO TERMINAR ÚLTIMO", eso es lo que necesita el equipo: copialo tal cual. Si dice "YA ASEGURADO", no digas que todavía depende de algo.
- "Campaña por etapa" ya tiene los totales por primera rueda, título o permanencia: usalos en vez de sumar partidos.
- Para "cuántos partidos se jugaron / quedan / cuándo termina" usá "DATOS DE <divisional>".
- Si la pregunta no es sobre la Liga Universitaria (otro deporte, otra liga, un tema cualquiera), decí en una línea que solo sabés de la Liga Universitaria y sugerí qué se puede preguntar.
- Si el usuario solo saluda o agradece, respondé corto y con onda, sin volcar datos.
- Si un club juega en varias categorías y no queda claro cuál le interesa, respondé por la que aparece primero y mencioná que hay otras.
- Si la pregunta no tiene datos para responder, decilo y sugerí la sección de la página (Bajas, Partidos, Tabla, Jugadores, Rankings, Sanciones). La página tiene SOLO esas secciones: no nombres ninguna otra.
- Sin títulos de markdown. Podés usar guiones para listas y **negrita** para algún número clave. No inventes conceptos del reglamento (promedios, descensos, clasificaciones) que no estén en los datos.
- Cupos, ascensos, descensos, pase a otra divisional o a la "de Honor", liguillas, desempates: esas reglas NO están en los datos. Respondé con el puesto y los puntos, y decí en una línea que cuántos clasifican o suben lo define el reglamento de la Liga (ligauniversitaria.org.uy). Nunca digas "la página indica" algo que no está.
- Si no tenés el dato, decilo en una línea. Es mejor "no tengo ese dato" que una respuesta inventada.

DATOS:
${ctx || '(no se encontraron datos para esta pregunta)'}`;
}

// ---- proveedores de IA ----
// Saca el texto de la respuesta de Workers AI, sea del formato de chat (Llama) o del de "Responses" (gpt-oss).
function textoDe(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  if (typeof r.output_text === 'string') return r.output_text;
  if (Array.isArray(r.output)) return r.output.filter(o => o.type === 'message').flatMap(o => o.content || []).map(c => c.text || '').join('');
  return r.choices?.[0]?.message?.content || '';
}
// Primero gpt-oss-120b (razona: hace bien las cuentas); si falla, Llama 3.3 70B. Las dos usan la cuota gratis.
async function workersAI(env, sistema, mensajes) {
  const intentos = [
    () => env.AI.run(env.MODELO || '@cf/openai/gpt-oss-120b', { instructions: sistema, input: mensajes, reasoning: { effort: 'medium' }, max_output_tokens: 2000 }),
    () => env.AI.run(env.MODELO_RESPALDO || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: sistema }, ...mensajes], max_tokens: 600, temperature: 0.3 }),
  ];
  let ultimo;
  for (const f of intentos) {
    try { const t = textoDe(await f()).trim(); if (t) return t; ultimo = new Error('respuesta vacía'); }
    catch (e) { ultimo = e; console.log('Workers AI:', e.message); }
  }
  throw ultimo;
}
async function gemini(env, sistema, mensajes) {
  const modelo = env.GEMINI_MODELO || 'gemini-flash-lite-latest';
  // La clave va en el encabezado (sirve para las viejas "AIza…" y las nuevas "AQ.…").
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
      contents: mensajes.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const j = await r.json();
  const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!t) throw new Error('Gemini no respondió');
  return t;
}
async function groq(env, sistema, mensajes) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_KEY}` },
    body: JSON.stringify({ model: env.GROQ_MODELO || 'llama-3.3-70b-versatile', max_tokens: 600, temperature: 0.3,
      messages: [{ role: 'system', content: sistema }, ...mensajes] }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}`);
  const t = ((await r.json()).choices?.[0]?.message?.content || '').trim();
  if (!t) throw new Error('Groq no respondió');
  return t;
}

// Saca el "Che," del arranque (lo pone casi siempre) y títulos de markdown.
function pulir(t) {
  t = t.replace(/^\s*che[,!.]?\s+/i, '').replace(/^#+\s*/gm, '')
    // Fórmulas en LaTeX ("\frac{14}{30}\times 100") a texto común.
    .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, '').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\times/g, '×').replace(/\\approx/g, '≈').replace(/\\cdot/g, '·').replace(/\\%/g, '%').replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- control de la respuesta ----
// La IA gratis a veces desordena una tabla o nombra secciones que la página no tiene. Antes de mandar la
// respuesta se revisa: si falla, se le pide que la rehaga una vez; si vuelve a fallar, el orden se arregla acá.
const SECCIONES = ['bajas', 'partidos', 'tabla', 'tablas', 'jugadores', 'rankings', 'ranking', 'sanciones', 'mi equipo', 'clubes'];
// Una línea de lista con puntos: "1. Old Woodlands – 43 pts", "- 3° ELF 37 pts (34 + 3)", "**ELF – 37 pts**".
// Solo cuentan las líneas con número de puesto ("1.", "3°"): así "- si gana: 37 pts / - si empata: 35 pts" no se toca.
const LINEA_PTS = /^(\s*)(?:[-•*]\s*)?(\d{1,2})\s*[.)°º]\s*()(.*?\D)(\d{1,3})\s*(?:pts|puntos)\b(.*)$/i;
function listasConPuntos(texto) {
  const lineas = texto.split('\n'), bloques = [];
  let actual = null;
  lineas.forEach((l, k) => {
    const m = l.replace(/\*\*/g, '').match(LINEA_PTS);
    if (m) { (actual ??= []).push({ k, num: m[2] || m[3], pts: Number(m[5]), m }); }
    else if (l.trim() === '' && actual) { /* una línea vacía no corta la lista */ }
    else { if (actual?.length > 1) bloques.push(actual); actual = null; }
  });
  if (actual?.length > 1) bloques.push(actual);
  return { lineas, bloques };
}
export function revisar(texto) {
  const problemas = [];
  const { bloques } = listasConPuntos(texto);
  for (const b of bloques) for (let i = 1; i < b.length; i++) if (b[i].pts > b[i - 1].pts) {
    problemas.push('en la lista de posiciones pusiste un equipo con más puntos debajo de uno con menos; el orden tiene que ir de más a menos puntos y el puesto de cada equipo tiene que salir de ese orden (o de los PUESTOS YA CALCULADOS)');
    break;
  }
  const mala = seccionInventada(texto);
  if (mala) problemas.push(`nombraste la sección "${mala}", que no existe: la página solo tiene Bajas, Partidos, Tabla, Jugadores, Rankings y Sanciones`);
  return problemas;
}
const RE_SECCION = /secci[oó]n(?:es)?\s+(?:de\s+)?\**["“']?([A-ZÁÉÍÓÚ][\wÁÉÍÓÚáéíóúñ]*(?:\s*\/\s*[\wÁÉÍÓÚáéíóúñ]+|\s+[A-ZÁÉÍÓÚ][\wÁÉÍÓÚáéíóúñ]*)*)/g;
function seccionInventada(texto) {
  for (const m of texto.matchAll(RE_SECCION)) {
    const n = norm(m[1]);
    if (!SECCIONES.some(s => n === s || n.startsWith(s + ' '))) return m[1].trim();
  }
  return null;
}
// Saca las oraciones que mandan a una sección que no existe.
function quitarSecciones(texto) {
  return texto.split('\n').map(l => l.split(/(?<=[.!?])\s+/).filter(o => !seccionInventada(o)).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Último recurso: ordena de más a menos puntos cada lista desordenada y corrige la numeración.
export function ordenarListas(texto) {
  const { lineas, bloques } = listasConPuntos(texto);
  for (const b of bloques) {
    if (b.every((x, i) => !i || x.pts <= b[i - 1].pts)) continue;
    const orig = b.map(x => lineas[x.k]);
    const orden = b.map((x, i) => ({ ...x, linea: orig[i] })).sort((x, y) => y.pts - x.pts);
    const numerada = b.every(x => x.num);
    orden.forEach((x, i) => {
      lineas[b[i].k] = numerada ? x.linea.replace(/^(\s*(?:[-•*]\s*)?(?:\*\*)?)\d{1,2}(\s*[.)°º])/, `$1${i + 1}$2`) : x.linea;
    });
  }
  return lineas.join('\n');
}

export async function responder(env, cuerpo) {
  const historial = (Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : []).slice(-MAX_HISTORIAL)
    .filter(m => m && typeof m.texto === 'string' && m.texto.trim())
    .map(m => ({ role: m.rol === 'bot' ? 'assistant' : 'user', content: m.texto.slice(0, MAX_PREGUNTA * 2) }));
  const ultima = historial.at(-1);
  if (!ultima || ultima.role !== 'user') return { error: 'Falta la pregunta.' };
  if (ultima.content.length > MAX_PREGUNTA) ultima.content = ultima.content.slice(0, MAX_PREGUNTA);
  const d = await cargarDatos(env);
  const anteriores = historial.slice(0, -1).filter(m => m.role === 'user').map(m => m.content).join(' ');
  if (necesitaJugadores(d, ultima.content + ' ' + anteriores)) { try { await cargarJugadores(env, d); } catch (e) { console.log(e.message); } }
  const hallado = buscar(d, ultima.content, { div: cuerpo.div || null, club: cuerpo.club || null, anteriores });
  const detalle = await contextoDetalle(env, d, hallado);
  const ctx = [contexto(d, hallado, await provisorios(env)), detalle].filter(Boolean).join('\n\n');
  const sistema = instrucciones(ctx, d.ultimoResultado ? d.ultimoResultado.split('-').reverse().join('/') : null);
  const proveedores = [['cloudflare', workersAI], env.GEMINI_KEY && ['gemini', gemini], env.GROQ_KEY && ['groq', groq]].filter(Boolean);
  for (const [nombre, fn] of proveedores) {
    let texto;
    try { texto = pulir(await fn(env, sistema, historial)); }
    catch (e) { console.log(`${nombre} falló: ${e.message}`); continue; }
    const problemas = revisar(texto);
    if (!problemas.length) return { texto, fuente: nombre };
    console.log(`${nombre}: respuesta con problemas (${problemas.join(' | ')}), se pide de nuevo`);
    try {
      const otra = pulir(await fn(env, sistema, [...historial, { role: 'assistant', content: texto },
        { role: 'user', content: `Revisá tu respuesta anterior: ${problemas.join('; ')}. Escribila de nuevo bien, sin mencionar que la corregiste.` }]));
      if (!revisar(otra).length) return { texto: otra, fuente: nombre };
      texto = otra;
    } catch (e) { console.log(`${nombre} falló al corregir: ${e.message}`); }
    return { texto: quitarSecciones(ordenarListas(texto)), fuente: nombre };
  }
  return { texto: 'Por hoy se me acabaron las respuestas gratis 😅 Probá de nuevo mañana, o mirá la sección Bajas y Partidos de la página.', fuente: null };
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origen) });
    if (url.pathname === '/' && req.method === 'GET') return json({ ok: true, servicio: 'chat de Planilla LUD' }, 200, origen);
    if (url.pathname === '/vivo' && req.method === 'GET') {
      const div = url.searchParams.get('div') || '';
      if (!/^[a-z0-9-]{3,40}$/.test(div)) return json({ error: 'divisional inválida' }, 400, origen);
      // Guardado 5 minutos en Cloudflare: muchos visitantes, una sola consulta a la Liga.
      const clave = new Request(`https://cache.planilla-lud/vivo/${div}`);
      const guardado = await caches.default.match(clave);
      if (guardado) { const r = new Response(guardado.body, guardado); for (const [k, v] of Object.entries(cors(origen))) r.headers.set(k, v); return r; }
      try {
        const v = await enVivo(env, div);
        if (!v) return json({ error: 'divisional desconocida' }, 404, origen);
        const r = json(v, 200, origen); r.headers.set('Cache-Control', 'public, max-age=300');
        await caches.default.put(clave, r.clone());
        return r;
      } catch (e) { return json({ error: 'La Liga no respondió', detalle: e.message }, 502, origen); }
    }
    if (url.pathname === '/provisorios' && req.method === 'GET') return json({ lista: await provisorios(env) }, 200, origen);
    if (url.pathname === '/provisorios' && req.method === 'POST') {
      if (origen && !ORIGENES.includes(origen)) return json({ error: 'Origen no permitido' }, 403, origen);
      if (frenar('prov:' + (req.headers.get('CF-Connecting-IP') || 'x'))) return json({ error: 'Demasiados intentos, esperá un minuto.' }, 429, origen);
      let c; try { c = await req.json(); } catch { return json({ error: 'Pedido inválido' }, 400, origen); }
      const [st, r] = await cambiarProvisorio(env, c);
      return json(r, st, origen);
    }
    if (url.pathname !== '/chat' || req.method !== 'POST') return json({ error: 'No encontrado' }, 404, origen);
    if (origen && !ORIGENES.includes(origen)) return json({ error: 'Origen no permitido' }, 403, origen);
    if (frenar(req.headers.get('CF-Connecting-IP') || 'x')) return json({ texto: 'Pará un poquito, son muchas preguntas seguidas 😄 Probá en un minuto.' }, 429, origen);
    let cuerpo;
    try { cuerpo = await req.json(); } catch { return json({ error: 'Pedido inválido' }, 400, origen); }
    try { return json(await responder(env, cuerpo), 200, origen); }
    catch (e) { console.log('error', e.message); return json({ texto: 'Uy, algo falló de mi lado. Probá de nuevo en un rato.' }, 500, origen); }
  },
};
