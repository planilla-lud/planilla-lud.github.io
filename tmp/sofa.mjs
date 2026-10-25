import { writeFileSync } from 'node:fs';
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', Accept: 'application/json', Referer: 'https://www.sofascore.com/', Origin: 'https://www.sofascore.com' };
const out = [];
const get = async u => { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(20000) }); const t = await r.text(); out.push(`${r.status} ${u}\n${t.slice(0, 1500)}\n`); try { return JSON.parse(t); } catch { return null; } } catch (e) { out.push(`ERR ${u} ${e.message}`); return null; } };
for (const base of ['https://api.sofascore.com/api/v1', 'https://www.sofascore.com/api/v1']) {
  const s = await get(`${base}/search/unique-tournaments?q=${encodeURIComponent('Liga Universitaria')}&page=0`);
  const seasons = await get(`${base}/unique-tournament/31827/seasons`);
  if (seasons?.seasons?.[0]) await get(`${base}/unique-tournament/31827/season/${seasons.seasons[0].id}/events/last/0`);
  if (s) break;
}
writeFileSync('tmp/sofa.txt', out.join('\n'));
