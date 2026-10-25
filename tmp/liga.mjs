import { writeFileSync } from 'node:fs';
const B = 'https://ligauniversitaria.org.uy';
const get = async u => { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); return await r.text(); } catch (e) { return 'ERR ' + e.message; } };
const out = [];
for (const serie of ['20AT', '20APD', '20A']) {
  const q = `temporada=113&deporte=F&torneo=20&categoria=20&serie=${serie}`;
  for (const base of ['resultados', 'partidos']) {
    const t = await get(`${B}/${base}/api.php?action=cargarPartidos&${q}`);
    let j; try { j = JSON.parse(t); } catch { out.push(`${base} ${serie}: ${t.slice(0, 200)}`); continue; }
    const r = (Array.isArray(j) ? j : []).filter(p => /2026-10-2[3-5]/.test(p.Fecha_Hora || p.Fecha || ''));
    out.push(`== ${base} ${serie}: ${r.length}`);
    for (const p of r) out.push(JSON.stringify(p));
  }
}
const t = await get(`${B}/posiciones/api.php?action=cargarPosiciones&temporada=113&deporte=F&torneo=20&categoria=20&serie=20AT`);
out.push('== posiciones 20AT: ' + t.slice(0, 1500));
writeFileSync('tmp/liga.txt', out.join('\n'));
