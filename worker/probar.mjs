// Pruebas del chat sin IA: node worker/probar.mjs
// 1) El control de respuestas detecta y arregla tablas desordenadas y secciones inventadas.
// 2) Para preguntas típicas, el contexto que recibe la IA trae los datos que hacen falta.
// Usa data/chat.json local (correr antes node scripts/chat.mjs).
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

// ---- 2) contexto de preguntas típicas ----
const datos = JSON.parse(readFileSync(new URL('../data/chat.json', import.meta.url)));
const casos = [
  // [pregunta, opciones, textos que tienen que estar en el contexto]
  ['si ELF le gana a nacional en la ultima en que puesto queda? clasificamos a la de honor?', {}, ['PUESTOS YA CALCULADOS', 'si gana (37 pts) termina 3° o 4°', 'TABLA Mayores A – Título']],
  ['como queda la tabla si elf empata?', {}, ['si empata (35 pts)']],
  ['quien falta en el ELF el domingo?', {}, ['EQUIPO ELF (Mayores A)', 'Posibles bajas']],
  ['bajas de elf en la sub 20', {}, ['EQUIPO ELF (Sub 20 A)']],
  ['como esta la tabla de la b de mayores', {}, ['TABLA Mayores B']],
  ['quien va primero en la A?', {}, ['TABLA Mayores A']],
  ['goleadores de la reserva c', {}, ['GOLEADORES DE Reserva C']],
  ['quien es el goleador de la sub 20 a', {}, ['GOLEADORES DE Sub 20 A', '1. ']],
  ['suspendidos en la sub 18 plata', {}, ['SUSPENDIDOS EN Sub 18 Plata']],
  ['quien jugo mas minutos en old boys', {}, ['PLANTEL DE Old Boys']],
  ['cuantos goles hizo etchegaray', {}, ['Agustin Etchegaray']],
  ['old woodlands vs urunday quien gano mas', {}, ['CARA A CARA']],
  ['puede salir campeon urunday?', {}, ['TABLA Mayores A – Título', 'puede llegar a']],
  ['contra quien juega carrasco polo', {}, ['EQUIPO Carrasco Polo', 'Próximo partido']],
  ['once probable de tenis el pinar', {}, ['Once probable']],
  ['como viene elf en la pre senior', {}, ['EQUIPO ELF (Pre Senior B)']],
  ['tabla', { div: 'reserva-c' }, ['TABLA Reserva C']],
  ['quien desciende en la a?', {}, ['TABLA Mayores A – Permanencia']],
];
for (const [q, opc, deben] of casos) {
  const h = buscar(datos, q, opc);
  const c = contexto(datos, h, []);
  const faltan = deben.filter(t => !c.includes(t));
  ok(!faltan.length, `"${q}"${faltan.length ? ` → falta: ${faltan.join(' | ')}` : ''} (${Math.round(c.length / 1000)}k caracteres)`);
}
console.log(fallas ? `\n${fallas} pruebas fallaron` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
