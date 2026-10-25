// Arma el contexto para la IA: encuentra en data/chat.json los equipos y jugadores que menciona la
// pregunta y los pasa a texto. La IA solo contesta con esto, así no inventa.

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Palabras que no sirven para identificar a nadie.
const STOP = new Set(('a al algo alguien algun alguno como con contra cual cuales cuando cuanto cuantos de del donde el ella ellos en es esta este esto fue ha hay juega juegan jugo la las le les lo los mas me mi mis muy no nos o para pero por porque que quien quienes se si sin sobre su sus te tiene tienen tu un una uno unos y ya yo dame decime decir sabes sabe ver va van viene vienen hoy ahora proximo proxima partido partidos fecha domingo sabado finde fin semana equipo equipos cuadro jugador jugadores bajas baja suspendido suspendidos once titular titulares goles goleador goleadores tabla posicion rival previa lesionado lesionados falta faltan estan esta como andan anda gano perdio ganar perder liga lud categoria divisional serie copa').split(' '));
// Palabras de los nombres de equipos que no alcanzan solas para identificar un equipo.
const GENERICAS = new Set('club colegio escuela universitario universitaria univ u fc f c de del la el los las old san santa deportivo dep atletico social y sub carrasco tenis jrs juventud union centro nueva nuestra senora blanco blanca azul verde negro naranja rojo amarillo'.split(' '));
// Cómo se le dice a cada categoría.
const CATEGORIAS = [
  [/\b(mayor|mayores|primera)\b/, 'Mayores'], [/\b(rese|reserva|reservas)\b/, 'Reserva'], [/\b(sub ?20|la 20)\b/, 'Sub 20'],
  [/\b(pre ?senior|presenior|la pre)\b/, 'Pre Senior'], [/\b(mas ?40|\+ ?40|la 40)\b/, 'Más 40'], [/\b(sub ?18|la 18)\b/, 'Sub 18'], [/\b(sub ?16|la 16)\b/, 'Sub 16'],
];

// Apodos que se usan en la Liga.
const APODOS = { sel: 'Santa Elena', occ: 'Old Christians', owc: 'Old Woodlands', obc: 'Old Boys', clt: 'Carrasco Lawn Tennis', cpc: 'Carrasco Polo', tep: 'Tenis El Pinar',
  pinar: 'Tenis El Pinar', hebraica: 'Hebraica y Macabi', macabi: 'Hebraica y Macabi', nacional: 'Nacional U.', ivy: 'Old Ivy', obs: 'Old Brendans' };

// Apodos de nombres: "Juanma Rodríguez" es Juan Manuel Rodríguez en la planilla.
const NOMBRES = { juanma: 'juan manuel', juampi: 'juan pablo', juanpi: 'juan pablo', juanfra: 'juan francisco', juanse: 'juan sebastian', juanchi: 'juan',
  nacho: 'ignacio', fede: 'federico', santi: 'santiago', nico: 'nicolas', rodri: 'rodrigo', facu: 'facundo', tomi: 'tomas', agus: 'agustin',
  joaco: 'joaquin', gonza: 'gonzalo', maxi: 'maximiliano', mati: 'matias', seba: 'sebastian', fran: 'francisco', pancho: 'francisco',
  pepe: 'jose', lucho: 'luis', manu: 'manuel', guille: 'guillermo', alejo: 'alejandro', ale: 'alejandro', gaby: 'gabriel', rafa: 'rafael',
  pato: 'patricio', fefo: 'federico', beto: 'alberto', santino: 'santino', bauti: 'bautista', benja: 'benjamin', valen: 'valentin', martu: 'martin', tincho: 'martin' };

let indiceCache = null;
function indexar(datos) {
  if (indiceCache?.datos === datos) return indiceCache;
  const equipos = datos.equipos.map((e, i) => {
    const t = norm(e.eq).split(' ').filter(Boolean);
    // Siglas y nombres con puntos: "J.M.L.M" se escribe "jmlm", "Sa.Fe.Ma" "safema", "X - 13" "x13";
    // y las iniciales de nombres largos: "clt" (Carrasco Lawn Tennis).
    const compacto = t.join(''), corto = t.filter(x => !GENERICAS.has(x)).join('');
    const iniciales = t.length >= 3 ? t.map(x => x[0]).join('') : null;
    const apodos = Object.keys(APODOS).filter(k => APODOS[k] === e.eq);
    return { i, t, apodos, distintivos: t.filter(x => !GENERICAS.has(x) && x.length > 1), compacto, corto, iniciales };
  });
  const frecuencia = {};
  const jugadores = datos.jugadores.map(j => { const t = norm(j[0]).split(' ').filter(x => x.length > 2); for (const x of new Set(t)) frecuencia[x] = (frecuencia[x] || 0) + 1; return t; });
  indiceCache = { datos, equipos, jugadores, frecuencia };
  return indiceCache;
}

// Busca en la pregunta (y en lo que se venía hablando) equipos, jugadores y categoría.
export function buscar(datos, texto, { div = null, club = null, anteriores = '' } = {}) {
  const ix = indexar(datos);
  const q = norm(texto), qPrev = norm(anteriores);
  const palabras = new Set(q.split(' ').filter(Boolean));
  const conPrev = new Set([...palabras, ...qPrev.split(' ').filter(Boolean)]);
  const cat = (CATEGORIAS.find(([re]) => re.test(q)) || CATEGORIAS.find(([re]) => re.test(qPrev)) || [])[1] || null;

  // Equipos: alcanza con una palabra distintiva del nombre ("boys", "elf", "woodlands"); si el nombre no
  // tiene ninguna, tienen que estar todas.
  const coincide = (e, set) => e.apodos.some(a => set.has(a)) || (e.t.length > 1 && ((e.compacto.length >= 3 && set.has(e.compacto)) || (e.corto.length >= 3 && e.corto !== e.compacto && set.has(e.corto)))) || (e.iniciales && !STOP.has(e.iniciales) && set.has(e.iniciales)) || (e.distintivos.length ? e.distintivos.some(x => set.has(x)) && (e.distintivos.length < 3 || e.distintivos.filter(x => set.has(x)).length >= 2) : e.t.every(x => set.has(x)));
  let hallados = ix.equipos.filter(e => coincide(e, palabras));
  if (!hallados.length && qPrev) hallados = ix.equipos.filter(e => coincide(e, new Set(qPrev.split(' '))));
  // "Elf" encaja con "Elf" y con "Elf Blanco": si la pregunta no dice "blanco", queda el nombre exacto.
  // Y si dice "elf blanco", queda solo Elf Blanco.
  const completo = e => e.t.every(x => conPrev.has(x)) || conPrev.has(e.compacto);
  const contiene = (o, e) => o !== e && o.t.length > e.t.length && e.t.every(x => o.t.includes(x));
  hallados = hallados.filter(e => !hallados.some(o => contiene(o, e) && completo(o)) && (completo(e) || !hallados.some(o => contiene(e, o))));
  // Mismo club en varias categorías: la que dice la pregunta, si no la de la página, si no Mayores primero.
  const eq = i => datos.equipos[i];
  if (cat) { const f = hallados.filter(e => eq(e.i).cat === cat); if (f.length) hallados = f; }
  const pref = e => (eq(e.i).div === div ? 0 : 1) + (eq(e.i).cat === 'Mayores' ? 0 : 0.5);
  hallados.sort((a, b) => pref(a) - pref(b));
  const nombres = new Set(hallados.map(e => eq(e.i).eq));
  const porNombre = [...nombres].flatMap(n => hallados.filter(e => eq(e.i).eq === n).slice(0, cat || nombres.size > 1 ? 1 : 3));
  let elegidos = porNombre.slice(0, 4).map(e => e.i);
  const porNombreDirecto = [...elegidos];

  // Jugadores: dos palabras del nombre, o una sola si es un apellido poco común.
  const palabrasEquipo = new Set(elegidos.flatMap(i => [...norm(eq(i).eq).split(' '), norm(eq(i).eq).replace(/ /g, '')]));
  const sueltas = [...palabras].flatMap(x => NOMBRES[x] ? NOMBRES[x].split(' ') : [x]).filter(x => x.length > 2 && !STOP.has(x) && !palabrasEquipo.has(x));
  const jug = [];
  if (sueltas.length) ix.jugadores.forEach((t, k) => {
    const n = sueltas.filter(x => t.includes(x)).length;
    if (n >= 2 || (n === 1 && sueltas.length === 1 && (ix.frecuencia[sueltas[0]] || 0) <= 4)) jug.push([n, k, t.length]);
  });
  jug.sort((a, b) => b[0] - a[0] || a[2] - b[2]); // el nombre más justo primero
  let jugadores = jug.map(([, k]) => datos.jugadores[k]);
  // Si la pregunta nombra un equipo, quedan los jugadores de ese club (hay muchos "Juan Manuel Rodríguez").
  const clubes = new Set(porNombreDirecto.map(i => eq(i).eq));
  if (clubes.size) { const f = jugadores.filter(j => clubes.has(eq(j[1]).eq)); if (f.length) jugadores = f; }
  jugadores = jugadores.slice(0, 6);
  for (const j of jugadores.slice(0, 3)) if (!elegidos.includes(j[1]) && elegidos.length < 5) elegidos.push(j[1]);

  // Si pregunta por el rival o la previa, va también el rival del próximo partido.
  if (/\b(rival|contra|enfrenta|previa|partido|juega|juegan)\b/.test(q)) for (const i of porNombreDirecto) {
    const e = eq(i); if (!e.rival) continue;
    const r = datos.equipos.findIndex(o => o.div === e.div && o.eq === e.rival);
    if (r >= 0 && !elegidos.includes(r) && elegidos.length < 6) elegidos.push(r);
  }
  // Nada concreto: el equipo del usuario en la divisional que está mirando, o el de Mayores.
  if (!elegidos.length && club) {
    const c = norm(club);
    const delClub = datos.equipos.map((e, i) => [e, i]).filter(([e]) => norm(e.eq).startsWith(c) || c.startsWith(norm(e.eq)));
    const uno = delClub.find(([e]) => e.div === div) || delClub.find(([e]) => (cat ? e.cat === cat : e.cat === 'Mayores')) || delClub[0];
    if (uno) elegidos.push(uno[1]);
  }
  const campana = /\b(resultados|campana|temporada|todos los partidos|racha|historial|enfrentamientos|veces)\b/.test(q);
  return { equipos: elegidos, jugadores, cat, div, campana };
}

const lista = (t, l) => l?.length ? `${t}: ${l.join('; ')}` : null;
export function textoEquipo(e) {
  return [`EQUIPO ${e.eq} (${e.divNombre})`, e.prox && `Próximo partido: ${e.prox}`, e.pos && `Posición: ${e.pos}`, `Campaña en la temporada: ${e.campana}`,
    lista('Últimos resultados', e.ultimos), lista('Posibles bajas para el próximo partido', e.bajas) || 'Posibles bajas: ninguna detectada',
    lista('Suspendidos', e.suspendidos) || 'Suspendidos: ninguno', lista('Once probable', e.once), lista('Goleadores', e.goleadores),
    lista('Ya jugados pero SIN RESULTADO CARGADO todavía (no están en la tabla)', e.sinCargar), lista('Partidos que le quedan', e.quedan), e.escenario && `Cuentas del próximo partido (ya hechas): ${e.escenario}`].filter(Boolean).join('\n');
}

// Contexto final para la IA. Si no se encontró nada, una tabla corta de la divisional que mira.
// Resultados provisorios que todavía valen: los del equipo que siguen "sin resultado cargado" en la Liga.
function provisoriosDe(datos, e, prov) {
  return (prov || []).filter(p => p.div === e.div && (p.l === e.eq || p.v === e.eq)
    && (e.sinCargar || []).some(s => s.endsWith('vs ' + (p.l === e.eq ? p.v : p.l))));
}
// Tabla en texto, sumando los provisorios que correspondan (si hay).
function tablaTexto(datos, k, prov) {
  const raw = datos.tablasRaw?.[k];
  const [div, etapa] = k.split('|');
  const vale = (prov || []).filter(p => p.div === div && (!p.etapa || p.etapa === etapa)
    && raw?.some(r => r[0] === p.l && r[9] > 0) && raw?.some(r => r[0] === p.v && r[9] > 0));
  if (!raw || !vale.length) return datos.tablas[k].join('\n');
  const t = raw.map(r => ({ eq: r[0], pj: r[1], g: r[2], e: r[3], p: r[4], gf: r[5], gc: r[6], pts: r[7], q: r[8], sc: r[9], prov: 0 }));
  for (const p of vale) for (const [eq, gf, gc] of [[p.l, p.gl, p.gv], [p.v, p.gv, p.gl]]) {
    const x = t.find(y => y.eq === eq); if (!x) continue;
    x.pj++; x.gf += gf; x.gc += gc; x.q--; x.sc--; x.prov++;
    if (gf > gc) { x.g++; x.pts += 3; } else if (gf === gc) { x.e++; x.pts++; } else x.p++;
  }
  t.sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  const max = t.map(x => x.pts + 3 * x.q), punta = t[0].pts;
  const filas = t.map((x, i) => `${i + 1}° ${x.eq} ${x.pts} pts (${x.pj} PJ, ${x.g}G ${x.e}E ${x.p}P, ${x.gf}-${x.gc})${x.prov ? ' [incluye resultado provisorio]' : ''}; le quedan ${x.q}${x.sc > 0 ? ` (${x.sc} ya jugado sin resultado cargado)` : ''}, puede llegar a ${max[i]}; ${max[i] >= punta ? 'todavía puede terminar 1°' : 'ya no puede terminar 1°'}`);
  filas.push(t[0].pts > Math.max(...max.slice(1)) ? `${t[0].eq} ya tiene asegurado el 1° puesto.` : 'Nadie tiene asegurado el 1° puesto todavía.');
  return `(Con resultados PROVISORIOS cargados a mano: ${vale.map(p => `${p.l} ${p.gl}-${p.gv} ${p.v}`).join('; ')}. Todavía no son oficiales.)\n` + filas.join('\n');
}

export function contexto(datos, hallado, prov = []) {
  const partes = hallado.equipos.map(i => {
    const e = datos.equipos[i], pv = provisoriosDe(datos, e, prov);
    return textoEquipo(e) + (pv.length ? `\nResultado PROVISORIO (cargado a mano porque la Liga todavía no lo subió): ${pv.map(p => `${p.l} ${p.gl}-${p.gv} ${p.v}`).join('; ')}` : '');
  });
  // Cara a cara: todos los partidos de la temporada entre los equipos mencionados de la misma divisional.
  const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const mencionados = hallado.equipos.slice(0, 4).map(i => datos.equipos[i]);
  for (let a = 0; a < mencionados.length; a++) for (let b = a + 1; b < mencionados.length; b++) {
    const x = mencionados[a], y = mencionados[b];
    if (x.div !== y.div || !x.resultados) continue;
    const entre = x.resultados.filter(r => r[1] === y.eq);
    partes.push(`CARA A CARA ${x.eq} vs ${y.eq} en ${x.divNombre} (todos los de la temporada, goles de ${x.eq} primero): `
      + (entre.length ? entre.map(([d, , gf, gc, et]) => `${ddmm(d)} ${et}: ${x.eq} ${gf}-${gc} ${y.eq}`).join('; ')
        + `. En total: ${entre.length} partidos, ${x.eq} hizo ${entre.reduce((s, r) => s + r[2], 0)} goles y recibió ${entre.reduce((s, r) => s + r[3], 0)}.`
        : 'no se enfrentaron todavía esta temporada.'));
  }
  // Si pregunta por la campaña o los resultados, va la lista completa del primer equipo.
  if (hallado.campana && mencionados[0]?.resultados) {
    const e = mencionados[0];
    partes.push(`TODOS LOS RESULTADOS DE ${e.eq} (${e.divNombre}): ` + e.resultados.map(([d, r, gf, gc]) => `${ddmm(d)} ${gf > gc ? 'G' : gf === gc ? 'E' : 'P'} ${gf}-${gc} vs ${r}`).join('; '));
  }
  // La tabla del grupo de cada equipo (una vez por grupo), para poder razonar con los puntos.
  const vistas = new Set();
  for (const i of hallado.equipos.slice(0, 3)) {
    const k = datos.equipos[i].tabla;
    if (!k || vistas.has(k) || !datos.tablas?.[k]) continue;
    vistas.add(k);
    partes.push(`TABLA ${datos.equipos[i].divNombre} – ${k.split('|')[1]} (oficial de la Liga, puntos de toda la temporada; "puede llegar a" = puntos si gana todo lo que le queda):\n${tablaTexto(datos, k, prov)}`);
  }
  if (hallado.jugadores.length) partes.push('JUGADORES MENCIONADOS:\n' + hallado.jugadores.map(([n, i, pj, tit, min, gol]) =>
    { const e = datos.equipos[i], gf = (e.resultados || []).reduce((s, r) => s + r[2], 0);
      return `${n}: juega en ${e.eq} (${e.divNombre}), ${pj} partidos (${tit} de titular), ${min} minutos, ${gol} goles`
        + (gf ? ` de los ${gf} que hizo su equipo en la temporada (${Math.round(gol / gf * 100)}%)` : ''); }).join('\n'));
  if (!partes.length) {
    const delDiv = datos.equipos.filter(e => e.div === hallado.div || (!hallado.div && e.div === 'mayores-a'));
    if (delDiv.length) partes.push(`DIVISIONAL ${delDiv[0].divNombre}:\n` + delDiv.map(e => `${e.eq}: ${e.pos || 'sin posición'}; ${e.campana}${e.prox ? '; próximo ' + e.prox : ''}; ${e.bajas.length} posibles bajas, ${e.suspendidos.length} suspendidos`).join('\n'));
  }
  return partes.join('\n\n');
}
