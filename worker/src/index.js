// Servidor del chat de Planilla LUD (Cloudflare Worker).
// Recibe la pregunta desde la página, busca los datos que hacen falta en data/chat.json (lo arma el robot)
// y le pide la respuesta a una IA gratis: primero Workers AI de Cloudflare (cuota diaria gratis); si se
// acabó la cuota y hay claves configuradas, Gemini o Groq (también con plan gratis). Nada de esto cobra:
// si se acaban todas las cuotas del día, el chat avisa que vuelvan mañana.
import { buscar, contexto } from './buscar.js';

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

async function cargarDatos(env) {
  if (datos && Date.now() < datosHasta) return datos;
  const r = await fetch(env.DATOS_URL || 'https://planilla-lud.github.io/data/chat.json', { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`No pude leer los datos (${r.status})`);
  datos = await r.json(); datosHasta = Date.now() + 10 * 60e3;
  return datos;
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
- Nunca digas que un equipo "asegura" o que "ya no lo alcanzan" sin comparar: un equipo asegura el 1° solo si sus puntos (después del resultado que se plantea) superan el "puede llegar a" de TODOS los demás, contando que a los otros les siguen quedando sus partidos. Si no se cumple, decí que todavía lo pueden alcanzar y quién.
- Las "posibles bajas" son deducciones de las planillas oficiales, no partes médicos: aclaralo solo si hablás de lesiones.
- Si un club juega en varias categorías y no queda claro cuál le interesa, respondé por la que aparece primero y mencioná que hay otras.
- Si la pregunta no tiene datos para responder, decilo y sugerí la sección de la página (Bajas, Partidos, Tabla, Jugadores, Rankings, Sanciones).
- Sin títulos de markdown. Podés usar guiones para listas y **negrita** para algún número clave. No inventes conceptos del reglamento (promedios, descensos, clasificaciones) que no estén en los datos.

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

export async function responder(env, cuerpo) {
  const historial = (Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : []).slice(-MAX_HISTORIAL)
    .filter(m => m && typeof m.texto === 'string' && m.texto.trim())
    .map(m => ({ role: m.rol === 'bot' ? 'assistant' : 'user', content: m.texto.slice(0, MAX_PREGUNTA * 2) }));
  const ultima = historial.at(-1);
  if (!ultima || ultima.role !== 'user') return { error: 'Falta la pregunta.' };
  if (ultima.content.length > MAX_PREGUNTA) ultima.content = ultima.content.slice(0, MAX_PREGUNTA);
  const d = await cargarDatos(env);
  const anteriores = historial.slice(0, -1).filter(m => m.role === 'user').map(m => m.content).join(' ');
  const hallado = buscar(d, ultima.content, { div: cuerpo.div || null, club: cuerpo.club || null, anteriores });
  const sistema = instrucciones(contexto(d, hallado, await provisorios(env)), d.ultimoResultado ? d.ultimoResultado.split('-').reverse().join('/') : null);
  const proveedores = [['cloudflare', workersAI], env.GEMINI_KEY && ['gemini', gemini], env.GROQ_KEY && ['groq', groq]].filter(Boolean);
  for (const [nombre, fn] of proveedores) {
    try { return { texto: pulir(await fn(env, sistema, historial)), fuente: nombre }; }
    catch (e) { console.log(`${nombre} falló: ${e.message}`); }
  }
  return { texto: 'Por hoy se me acabaron las respuestas gratis 😅 Probá de nuevo mañana, o mirá la sección Bajas y Partidos de la página.', fuente: null };
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origen) });
    if (url.pathname === '/' && req.method === 'GET') return json({ ok: true, servicio: 'chat de Planilla LUD' }, 200, origen);
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
