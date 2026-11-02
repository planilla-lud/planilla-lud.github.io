// Pruebas del chat sin IA: node worker/probar.mjs
// 1) El control de respuestas detecta y arregla tablas desordenadas y secciones inventadas.
// 2) Para preguntas típicas, el contexto que recibe la IA trae los datos que hacen falta.
// Usa data/chat.json y data/chat-jugadores.json locales (correr antes node scripts/chat.mjs).
// 3) El detalle bajo demanda (partido puntual, jugador partido a partido) se arma bien con los datos locales.
import { readFileSync } from 'node:fs';
import { buscar, contexto } from './src/buscar.js';
import { revisar, ordenarListas } from './src/index.js';

let fallas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallas++; };

// ---- 1) control de respuestas ----
const mala = `- Si ELF le gana a Nacional U. en el último de Mayores A, pasa a **37 pts** (34 + 3).
- Con ese total la tabla quedaría más o menos así (solo los primeros puestos):

1. Old Woodlands – 43 pts
2. Urunday – 42 pts
3. Nacional U. – 36 pts (pierde)
4. Tenis El Pinar – 34 pts
5. **ELF – 37 pts**

- Por lo tanto ELF terminaría **5.º**.

Si querés confirmar cuántos equipos suben, mirá la sección **Clasificación / Promociones** de la página.`;
const p = revisar(mala);
ok(p.some(x => x.includes('más puntos debajo')), 'detecta la tabla desordenada de la captura');
ok(p.some(x => x.includes('Clasificación')), 'detecta la sección inventada');
const arreglada = ordenarListas(mala);
ok(/3\. \*\*ELF – 37 pts\*\*/.test(arreglada) && /4\. Nacional U\. – 36/.test(arreglada) && /5\. Tenis El Pinar/.test(arreglada), 'reordena la lista y la renumera');
ok(!revisar('1. Old Woodlands 43 pts\n2. Urunday 42 pts\n3. ELF 37 pts\n4. Nacional U. 36 pts').length, 'una tabla bien ordenada pasa');
ok(!revisar('Mirá la sección **Bajas** de la página, o la sección de Rankings.').length, 'las secciones reales pasan');
ok(!revisar('ELF tiene 34 pts y Nacional U. 36 pts.').length, 'una oración con puntos no cuenta como lista');
ok(!revisar('- Si pierde: 34 pts\n- Si empata: 35 pts\n- Si gana: 37 pts').length, 'los escenarios sin número de puesto no se tocan');

// ---- 2) contexto de preguntas típicas ----
// Para cada pregunta, el contexto que recibe la IA tiene que traer estos datos (texto o regex).
const datos = JSON.parse(readFileSync(new URL('../data/chat.json', import.meta.url)));
datos.jugadores = JSON.parse(readFileSync(new URL('../data/chat-jugadores.json', import.meta.url))).jugadores;
const { PREGUNTAS } = await import('./preguntas.mjs');
let maxLen = 0, suma = 0, n = 0;
for (const [g, q, opc, deben] of PREGUNTAS) {
  const c = contexto(datos, buscar(datos, q, opc), []);
  maxLen = Math.max(maxLen, c.length); suma += c.length; n++;
  const faltan = deben.filter(t => typeof t === 'string' ? !c.includes(t) : !t.test(c));
  ok(!faltan.length, `[${g}] "${q}"${faltan.length ? ` → falta: ${faltan.map(String).join(' | ')}` : ''} (${Math.round(c.length / 1000)}k)`);
}
console.log(`Contexto promedio ${Math.round(suma / n / 1000)}k caracteres, máximo ${Math.round(maxLen / 1000)}k.`);
ok(maxLen < 40000, 'ningún contexto pasa de 40k caracteres');

// ---- 3) detalle bajo demanda (partido puntual, jugador partido a partido), con los datos locales ----
{
  const { contextoDetalle } = await import('./src/detalle.js');
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async url => new Response(readFileSync(new URL('../data/' + String(url).split('/data/')[1], import.meta.url)), { status: 200 });
  const env = {};
  const casos = [
    ['cuantos minutos jugo etchegaray contra tape', ['TEMPORADA DE Agustin Etchegaray PARTIDO A PARTIDO', 'TAPE']],
    ['quien hizo los goles de elf vs tape', ['PARTIDO ELF 5-3 TAPE', 'Minuto a minuto', 'Formaciones']],
    ['cuando fue el ultimo partido que jugo alfonso badano', ['TEMPORADA DE Alfonso Badano']],
  ];
  for (const [q, deben] of casos) {
    const c = await contextoDetalle(env, datos, buscar(datos, q, {}));
    const faltan = deben.filter(t => !c.includes(t));
    ok(!faltan.length, `detalle "${q}"${faltan.length ? ` → falta: ${faltan.join(' | ')}` : ''}`);
  }
  globalThis.fetch = fetchReal;
}
console.log(fallas ? `\n${fallas} pruebas fallaron` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
