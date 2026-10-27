// ¿Hay partidos ya jugados que todavía no están cargados? Lo usa el robot en las corridas de cada hora
// del fin de semana: si no falta nada, termina enseguida sin consultar a la Liga.
// Falta algo si en los últimos 5 días hay:
//  - un partido del fixture que ya empezó hace más de 2 horas (todavía no aparece con resultado), o
//  - un partido con resultado pero sin la planilla (la Liga carga los titulares después).
import { readdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';

const DIR = new URL('../planillas/', import.meta.url);
const ahora = Date.now(), desde = ahora - 5 * 864e5; // las planillas del finde pueden llegar hasta el jueves
const hora = s => new Date(s.replace(' ', 'T') + '-03:00').getTime(); // las horas de la Liga son de Montevideo
const faltan = [];

for (const div of readdirSync(DIR).filter(d => !d.startsWith('_'))) {
  const d = new URL(`${div}/`, DIR);
  const fix = new URL('_proximos.json', d);
  if (existsSync(fix)) for (const f of JSON.parse(readFileSync(fix))) {
    const t = hora(f.fechaHora);
    if (t >= desde && t <= ahora - 2 * 3600e3) faltan.push(`${div}: ${f.local} - ${f.visitante} (${f.fechaHora}) sin resultado`);
  }
  for (const a of readdirSync(d).filter(a => /^\d+\.json$/.test(a))) {
    const p = JSON.parse(readFileSync(new URL(a, d)));
    const t = hora(p.fechaHora);
    if (t >= desde && t <= ahora && !(p.titularesL?.length && p.titularesV?.length) && p.detalle?.walk_over !== '1')
      faltan.push(`${div}: ${p.local} - ${p.visitante} (${p.fechaHora}) sin planilla`);
  }
}

console.log(faltan.length ? `Faltan ${faltan.length}:\n  ${faltan.slice(0, 30).join('\n  ')}` : 'No falta nada: no hace falta consultar a la Liga.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `seguir=${faltan.length ? 1 : 0}\n`);
