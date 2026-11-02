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

// ---- 2) contexto de preguntas típicas ----
// Para cada pregunta, el contexto que recibe la IA tiene que traer estos datos (texto o regex).
const datos = JSON.parse(readFileSync(new URL('../data/chat.json', import.meta.url)));
datos.jugadores = JSON.parse(readFileSync(new URL('../data/chat-jugadores.json', import.meta.url))).jugadores;
const B = [
  // --- tabla y posiciones ---
  ['Tabla', 'como esta la tabla de mayores a', {}, ['TABLA Mayores A – Título']],
  ['Tabla', 'cuantos puntos le saca old woodlands a urunday', {}, ['Old Woodlands 43', 'Urunday 42']],
  ['Tabla', 'quien tiene mejor diferencia de gol en la A', {}, [/dif(erencia)? ?[:+]/i]],
  ['Tabla', 'quien tiene la mejor defensa de la b de mayores', {}, ['TABLA Mayores B', /GC|en contra/]],
  ['Tabla', 'quien es el goleador del torneo en sub 20 a', {}, ['GOLEADORES DE Sub 20 A']],
  ['Tabla', 'quienes son los punteros de todas las divisionales de mayores', {}, ['Mayores B', 'Mayores G']],
  ['Tabla', 'en que puesto esta elf', {}, ['Posición: 5° de 8 en Título']],
  ['Tabla', 'si elf gana queda tercero?', {}, ['PUESTOS YA CALCULADOS']],
  ['Tabla', 'quien va ultimo en la permanencia de la a', {}, ['Permanencia']],
  // --- partidos y fixture ---
  ['Partidos', 'que partidos hay el domingo en mayores a', {}, [/PRÓXIMA FECHA|PARTIDOS QUE VIENEN/i]],
  ['Partidos', 'a que hora juega elf', {}, ['09:00']],
  ['Partidos', 'donde juega elf el domingo', {}, ['Trouville']],
  ['Partidos', 'como salieron los partidos de la fecha pasada en la a', {}, [/ÚLTIMA FECHA|RESULTADOS DE LA FECHA/i]],
  ['Partidos', 'quien hizo los goles de elf contra tape', {}, [/5-3/, /goles? de ELF|Goles:/i]],
  ['Partidos', 'cuanto salio elf old woodlands', {}, ['CARA A CARA', '0-2']],
  ['Partidos', 'que juega el elf este fin de semana en todas las categorias', {}, ['Sub 20 A', 'Reserva C', 'Pre Senior B']],
  ['Partidos', 'cuantas fechas quedan en la a', {}, [/le quedan|fecha/i]],
  ['Partidos', 'cual es el partido mas picante de la fecha', {}, [/PICANTES|partidos de la fecha/i]],
  ['Partidos', 'hubo algun walkover en la a', {}, [/W\.?O\.?/]],
  // --- bajas, once, previa ---
  ['Bajas', 'quien falta en elf el domingo', {}, ['Posibles bajas', 'Badano']],
  ['Bajas', 'vuelve alguien en nacional para el domingo', {}, [/vuelve/i]],
  ['Bajas', 'once probable de elf', {}, ['Once probable']],
  ['Bajas', 'quien es el arquero de elf', {}, ['(arquero)']],
  ['Bajas', 'quien es el capitan de elf', {}, [/capit[aá]n/i]],
  ['Bajas', 'previa elf nacional', {}, ['CARA A CARA', /sub20-a|Sub 20/]],
  ['Bajas', 'como le fue a elf de visitante', {}, [/de visitante[: ]/i]],
  ['Bajas', 'cuantos partidos lleva sin perder urunday', {}, [/racha|sin perder/i]],
  ['Bajas', 'cual fue la mayor goleada de elf', {}, [/goleada|TODOS LOS RESULTADOS/i]],
  ['Bajas', 'elf mantiene la valla invicta seguido?', {}, [/valla invicta/i]],
  ['Bajas', 'en que minuto hace los goles elf', {}, [/tramo|minuto/i]],
  // --- jugadores ---
  ['Jugadores', 'cuantos goles tiene etchegaray', {}, ['Agustin Etchegaray', 'goles']],
  ['Jugadores', 'cuantas rojas tiene facundo canepa', {}, [/roja/i]],
  ['Jugadores', 'que camiseta usa etchegaray', {}, [/camiseta/i]],
  ['Jugadores', 'cuando fue el ultimo partido que jugo alfonso badano', {}, [/[uú]ltimo partido/i]],
  ['Jugadores', 'matias dupuy juega en mayores y en sub 20?', {}, ['Mayores A', 'Sub 20 A']],
  ['Jugadores', 'cuantos minutos jugo etchegaray contra tape', {}, [/vs TAPE|TAPE/]],
  ['Jugadores', 'quien jugo mas minutos en la a', {}, [/MÁS MINUTOS|RANKING/i]],
  ['Jugadores', 'quien tiene mas rojas en mayores a', {}, [/rojas/i]],
  ['Jugadores', 'que jugador entro mas veces desde el banco en elf', {}, [/banco|ingres/i]],
  ['Jugadores', 'esta suspendido franco nuñez', {}, ['Franco Emanuel Nuñez', /Suspensi/]],
  ['Jugadores', 'quien es el 9 de elf', {}, [/camiseta 9|nro 9|#9/i]],
  // --- sanciones ---
  ['Sanciones', 'suspendidos en mayores a', {}, ['SUSPENDIDOS EN Mayores A']],
  ['Sanciones', 'cuantas fechas le dieron a bruno alday', {}, ['Bruno Alday', '1 fecha']],
  ['Sanciones', 'quien cumplio sancion este año en elf', {}, [/cumplida/i]],
  ['Sanciones', 'hay fallos del tribunal pendientes en la a', {}, [/pendiente|esperando fallo|Tribunal/i]],
  // --- rankings ---
  ['Rankings', 'ranking de minutos en sub 20 a', {}, [/MÁS MINUTOS/i]],
  ['Rankings', 'que equipo roto mas jugadores en la a', {}, [/rot|jugadores distintos/i]],
  ['Rankings', 'quien tiene mejor promedio de gol en la a', {}, [/por gol|cada/i]],
  // --- general ---
  ['General', 'cuando se actualizo la pagina', {}, [/actualiz/i]],
  ['General', 'cuanto acierta el once probable', {}, [/acierta|aciertos/i]],
  ['General', 'en que categorias juega el elf', {}, ['Mayores A', 'Sub 20 A', 'Sub 16']],
  ['General', 'que es permanencia', {}, [/Permanencia/]],
];
const B2 = [
  ['tabla de la sub 18 oro', {}, ['TABLA Sub 18 Oro']],
  ['como esta la mas 40 b', {}, ['Más 40 B']],
  ['quien va primero en pre senior', {}, ['DIVISIONALES DE PRE SENIOR', 'Pre Senior A', 'Pre Senior E']],
  ['goleadores de reserva', {}, ['GOLEADORES DE RESERVA']],
  ['que onda el owc', {}, ['EQUIPO Old Woodlands']],
  ['como viene el pinar', {}, ['EQUIPO Tenis El Pinar', 'Racha']],
  ['y en la sub 20?', { anteriores: 'como viene el elf' }, ['EQUIPO ELF (Sub 20 A)']],
  ['cuando juegan?', { anteriores: 'bajas de old boys' }, ['EQUIPO Old Boys', 'Próximo partido']],
  ['quien es el goleador?', { anteriores: 'como esta urunday' }, ['Goleadores']],
  ['bajas', { div: 'sub20-a', club: 'ELF' }, ['EQUIPO ELF (Sub 20 A)']],
  ['quien esta suspendido en el club?', { club: 'ELF', div: 'mayores-a' }, [/Sub 18 Plata|Sub 20 A/, 'Franco Emanuel Nuñez']],
  ['nacho verano juega en mayores?', {}, ['Ignacio Verano']],
  ['cuantos goles tiene juanma dupuy', {}, ['Juan Manuel Dupuy']],
  ['etchegaray', {}, ['Agustin Etchegaray', 'camiseta 9']],
  ['quien es el arquero de old christians en mayores', {}, ['EQUIPO Old Christians (Mayores A)', '(arquero)']],
  ['elf vs tape', {}, ['CARA A CARA ELF vs TAPE', "Etchegaray 12'"]],
  ['cuantos partidos gano elf de local', {}, ['De local: 10 PJ, 5G']],
  ['elf hace goles sobre el final?', {}, ["76-90+' 9"]],
  ['cuantos partidos le quedan a elf', {}, ['Partidos que le quedan en el fixture: 1']],
  ['que partidos hay esta fecha en sub 20 a', {}, ['PRÓXIMA FECHA DE Sub 20 A']],
  ['resultados del finde pasado en reserva c', {}, ['ÚLTIMA FECHA JUGADA EN Reserva C']],
  ['quien jugo mas partidos en mayores a', {}, ['Más partidos jugados']],
  ['quien esta siempre en cancha en elf', {}, ['PLANTEL DE ELF']],
  ['el elf tiene jugadores que juegan en dos categorias?', {}, [/Otras novedades|también juega/]],
  ['puede descender seminario?', {}, ['TABLA Mayores A – Permanencia', 'PUESTOS YA CALCULADOS']],
  ['tape ya descendio?', {}, ['puesto final posible: 8°']],
  ['quien sale campeon de la a', {}, ['Old Woodlands', 'puesto final posible: 1° o 2°']],
  ['a que hora juega urunday old woodlands y donde', {}, ['09:00', /URUNDAY/i]],
  ['historial de sanciones de hebraica', {}, ['Historial de sanciones']],
  ['hay jugadores esperando fallo del tribunal en la a', {}, ['SUSPENDIDOS EN Mayores A']],
  ['que equipos de mayores a tienen mas de 30 goles', {}, ['GF 38']],
  ['quien recibio menos goles en la a', {}, ['mejor defensa']],
  ['jmlm', {}, ['EQUIPO J.M.L.M']],
  ['que sabes de la pagina', {}, ['SOBRE LA PÁGINA']],
  ['cuanto acierta el once', {}, ['PRECISIÓN DEL ONCE PROBABLE']],
  ['hola', {}, [/DIVISIONAL|PRÓXIMA FECHA/]],
];
let maxLen = 0, suma = 0, n = 0;
for (const [g, q, opc, deben] of [...B, ...B2.map(([q, o, m]) => ['Más', q, o, m])]) {
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
