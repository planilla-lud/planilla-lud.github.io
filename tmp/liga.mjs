import { writeFileSync } from 'node:fs';
const B = 'https://ligauniversitaria.org.uy/resultados/api.php';
const out = [];
for (const id of '103277 103276 103250'.split(' ')) for (const action of ['Titulares Locatario', 'Titulares Visitante', 'GolesLocatario']) {
  try { const r = await fetch(B + '?action=' + encodeURIComponent(action) + '&id=' + id); const t = await r.text(); out.push(id + ' ' + action + ': HTTP ' + r.status + ' ' + t.slice(0, 160)); }
  catch (e) { out.push(id + ' ' + action + ': ERR ' + e.message); }
}
writeFileSync('tmp/liga.txt', out.join('\n'));
