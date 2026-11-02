// Arma el contexto para la IA: encuentra en data/chat.json (y data/chat-jugadores.json) los equipos,
// jugadores y divisionales que menciona la pregunta y los pasa a texto. La IA solo contesta con esto, así
// no inventa. Las cuentas (puestos, rachas, promedios, rankings) ya vienen hechas o se hacen acá.

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Palabras que no sirven para identificar a nadie.
const STOP = new Set(('usa usan lleva llevan tiene tienen hizo hace hacen hubo habia era eran son fue dijo dice sabe sea sera seria estaba estan jugara jugaran va a al algo alguien algun alguno como con contra cual cuales cuando cuanto cuanta cuantos cuantas de del donde el ella ellos en es esta este esto fue ha hay juega juegan jugo la las le les lo los mas me mi mis muy no nos o para pero por porque que quien quienes se si sin sobre su sus te tiene tienen tu un una uno unos y ya yo dame decime decir sabes sabe ver va van viene vienen hoy ahora manana ayer proximo proxima partido partidos fecha fechas domingo sabado finde fin semana equipo equipos cuadro jugador jugadores bajas baja suspendido suspendidos once titular titulares goles gol goleador goleadores tabla posicion posiciones rival rivales previa lesionado lesionados falta faltan estan esta como andan anda gano perdio ganar perder empato liga lud categoria divisional serie copa puntos punto puesto puestos primero ultimo ultima racha resultado resultados minutos minuto camiseta numero capitan arquero roja rojas tarjeta tarjetas expulsado expulsion sancion sanciones cancha hora horario donde dia juego club clubes todas todos categorias local visitante visita diferencia defensa ataque promedio valla invicta goleada derrota victoria empate ranking rankings pagina actualizo actualizada datos dato vuelve vuelven volver picante picantes partidazo walkover wo tribunal fallo fallos pendiente pendientes cumplio cumplida historial temporada campana entro entra banco suplente suplentes formacion alineacion cambios cambio queda quedan quedaria termina terminaria gana pierde empata clasifica clasificamos asciende desciende descenso ascenso campeon honor').split(' '));
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
  if (indiceCache?.datos === datos && indiceCache.conJugadores === !!datos.jugadores) return indiceCache;
  const equipos = datos.equipos.map((e, i) => {
    const t = norm(e.eq).split(' ').filter(Boolean);
    // Siglas y nombres con puntos: "J.M.L.M" se escribe "jmlm", "Sa.Fe.Ma" "safema", "X - 13" "x13";
    // y las iniciales de nombres largos: "clt" (Carrasco Lawn Tennis).
    const compacto = t.join(''), corto = t.filter(x => !GENERICAS.has(x)).join('');
    const iniciales = t.length >= 3 ? t.map(x => x[0]).join('') : null;
    const apodos = Object.keys(APODOS).filter(k => APODOS[k] === e.eq);
    return { i, t, apodos, distintivos: t.filter(x => !GENERICAS.has(x) && x.length > 1), compacto, corto, iniciales };
  });
  const palabrasEquipos = new Set(equipos.flatMap(e => [...e.t, e.compacto, e.corto, ...e.apodos]));
  const frecuencia = {};
  const jugadores = (datos.jugadores || []).map(j => { const t = norm(j[0]).split(' ').filter(x => x.length > 2); for (const x of new Set(t)) frecuencia[x] = (frecuencia[x] || 0) + 1; return t; });
  const divisionales = [...new Map(datos.equipos.map(e => [e.div, e])).values()]
    .map(e => ({ id: e.div, nombre: norm(e.divNombre), cat: e.cat, letra: norm(e.divNombre).split(' ').at(-1) }));
  indiceCache = { datos, conJugadores: !!datos.jugadores, equipos, palabrasEquipos, jugadores, frecuencia, divisionales };
  return indiceCache;
}

// Palabras de la pregunta que podrían ser el nombre de un jugador (no son de parar, ni de equipo, ni de categoría).
function sueltasDe(ix, texto) {
  const q = norm(texto).replace(/\b(sub|mas|pre) ?(20|18|16|40|senior)\b/g, ' ');
  return [...new Set(q.split(' '))].flatMap(x => NOMBRES[x] ? NOMBRES[x].split(' ') : [x])
    .filter(x => x.length > 2 && !STOP.has(x) && !ix.palabrasEquipos.has(x) && !/^\d+$/.test(x));
}
// ¿Hace falta cargar el índice de jugadores (data/chat-jugadores.json) para esta pregunta?
export function necesitaJugadores(datos, texto) {
  const ix = indexar(datos);
  return PIDE.plantel.test(norm(texto)) || PIDE.rankings.test(norm(texto)) || PIDE.goles.test(norm(texto)) || sueltasDe(ix, texto).length > 0;
}

// Qué tipo de dato pide la pregunta.
const PIDE = {
  tabla: /\b(tabla|posicion|posiciones|puntero|punteros|primero|primeros|lider|campeon|campeonato|titulo|ultimo|ultimos|desciende|descenso|asciende|ascenso|clasifica|clasificamos|clasifican|permanencia|puntos|diferencia|dif de gol|mejor ataque|mejor defensa|peor defensa|mas goles|menos goles|invicto)\b/,
  goles: /\b(goleador|goleadores|goles|gol|anoto|anotaron|pichichi|marco|convirtio|hizo)\b/,
  sanciones: /\b(suspendido|suspendidos|sancion|sanciones|sancionado|sancionados|expulsado|expulsados|expulsion|expulsiones|roja|rojas|tribunal|fallo|fallos)\b/,
  historialSanciones: /\b(cumplio|cumplida|cumplidas|historial|este ano|esta temporada|pendiente|pendientes|esperando|fallo|fallos|le dieron|cuantas fechas)\b/,
  plantel: /\b(siempre en cancha|minutos|minuto|plantel|jugo mas|jugaron|titular|titulares|arquero|quienes|quien juega|mas partidos|convocados|camiseta|numero|el \d{1,2} de|banco|suplente|suplentes|entro|entra|capitan)\b/,
  rankings: /\b(ranking|rankings|mas minutos|mas rojas|mas expulsiones|mas expulsado|promedio de gol|cada cuantos|rota|rotan|rotacion|jugadores distintos|mas entra|desde el banco|mas partidos|mas jugo)\b/,
  fixture: /\b(que partidos|partidos de|partidos hay|fixture|programacion|horarios|horario|a que hora|donde juega|donde juegan|cancha|proxima fecha|esta fecha|este finde|este fin de semana|el domingo|el sabado|se juega|se juegan|quien juega)\b/,
  resultadosFecha: /\b(como salieron|como salio|resultados de la fecha|fecha pasada|ultima fecha|el finde pasado|fin de semana pasado|que paso en|resultados del)\b/,
  detallePartido: /\b(goles de|quien hizo|quien marco|quien convirtio|a que minuto|en que minuto|minuto del gol|cuanto salio|como salio|resultado de|resultado del|cambios|formacion|alineacion|quienes jugaron|planilla)\b/,
  jugadorDetalle: /\b(partido a partido|ultimo partido|ultimos partidos|cuando jugo|jugo contra|minutos contra|contra quien jugo|en que partidos|cuantos minutos jugo|fue titular)\b/,
  numeros: /\b(local|visitante|visita|promedio|valla|invicta|goleada|peor derrota|mayor|ambos|marcaron los dos|mas de 2|sin convertir|sin recibir|recibe|recibio)\b/,
  racha: /\b(racha|seguidos|seguidas|sin perder|sin ganar|lleva|viene|forma|momento|como viene|como anda|como esta|como llega|como llegan)\b/,
  tramos: /\b(tramo|tramos|en que minuto|a que altura|primer tiempo|segundo tiempo|final del partido|sobre el final|arranque|temprano)\b/,
  capitan: /\b(capitan|capitana|cinta)\b/,
  novedades: /\b(vuelve|vuelven|volver|regresa|regresan|recupera|recuperan|novedades|otra categoria|jugo en|subio|subieron|bajo a)\b/,
  picantes: /\b(picante|picantes|partidazo|partidazos|mejor partido|mejores partidos|clasico|clasicos|que partido ver|imperdible)\b/,
  aciertos: /\b(acierta|aciertos|acierto|confiable|precision|le pega|le embocan|cuanto acierta)\b/,
  actualizado: /\b(actualizo|actualizada|actualizado|actualiza|actualizacion|cuando se actualiza|datos de cuando|hasta cuando|al dia)\b/,
  todasCategorias: /\b(todas las categorias|todos los equipos del|en que categorias|que categorias|todas sus categorias|todas las divisionales|cada categoria|el club|del club|todo el club|este finde|este fin de semana|el finde)\b/,
  punterosCategoria: /\b(punteros|primeros|lideres|cada divisional|todas las divisionales|las divisionales|por divisional)\b/,
  quedan: /\b(cuantas fechas|cuantos partidos (le |les )?quedan|que le queda|que les queda|lo que queda|falta jugar|faltan jugar|quedan)\b/,
  wo: /\b(w ?o|walkover|walk over|no se presento|no se presentaron|por no presentarse)\b/,
  secciones: /\b(que tiene la pagina|que secciones|que puedo preguntar|que sabes|que podes|como funciona|de donde salen|fuente|fuentes)\b/,
};

// "mayores a", "la b de mayores", "sub 20 b", "sub 18 oro", "la plata" → id de la divisional.
function divisionalDe(ix, q, cat, divPagina) {
  if (!q) return null;
  const exacta = ix.divisionales.find(d => new RegExp(`\\b${d.nombre}\\b`).test(q));
  if (exacta) return exacta.id;
  const m = q.match(/\b(?:divisional|serie|grupo|la|en la|de la|tabla|puntero de la|primero de la)\s+([a-g]|oro|plata|bronce|competencia|confraternidad|amistad)\b/);
  if (!m) return null;
  const letra = m[1];
  // "la a" sin categoría: la de la página si coincide, si no Mayores.
  const catPagina = ix.divisionales.find(d => d.id === divPagina)?.cat;
  const candidatas = ix.divisionales.filter(d => d.letra === letra);
  return (candidatas.find(d => d.cat === cat) || candidatas.find(d => !cat && d.cat === catPagina) || candidatas.find(d => !cat && d.cat === 'Mayores') || (!cat && candidatas.length === 1 ? candidatas[0] : null))?.id || null;
}

// Busca en la pregunta (y en lo que se venía hablando) equipos, jugadores, categoría y qué datos pide.
export function buscar(datos, texto, { div = null, club = null, anteriores = '' } = {}) {
  const ix = indexar(datos);
  const q = norm(texto), qPrev = norm(anteriores);
  const palabras = new Set(q.split(' ').filter(Boolean));
  const conPrev = new Set([...palabras, ...qPrev.split(' ').filter(Boolean)]);
  const cat = (CATEGORIAS.find(([re]) => re.test(q)) || CATEGORIAS.find(([re]) => re.test(qPrev)) || [])[1] || null;
  const catEnPregunta = !!CATEGORIAS.find(([re]) => re.test(q));
  const pide = Object.fromEntries(Object.entries(PIDE).map(([k, re]) => [k, re.test(q)]));

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
  // Si pregunta por todo el club (todas las categorías, el finde del club), van todos sus equipos.
  const todoElClubNombrado = pide.todasCategorias && nombres.size === 1 && !catEnPregunta;
  const porNombre = [...nombres].flatMap(n => hallados.filter(e => eq(e.i).eq === n).slice(0, todoElClubNombrado ? 10 : (cat || nombres.size > 1 ? 1 : 3)));
  let elegidos = porNombre.slice(0, todoElClubNombrado ? 10 : 4).map(e => e.i);
  const porNombreDirecto = [...elegidos];

  // Jugadores: dos palabras del nombre, o una sola si es un apellido poco común.
  const palabrasEquipo = new Set(elegidos.flatMap(i => [...norm(eq(i).eq).split(' '), norm(eq(i).eq).replace(/ /g, '')]));
  const sueltas = sueltasDe(ix, texto).filter(x => !palabrasEquipo.has(x));
  const jug = [];
  if (sueltas.length) ix.jugadores.forEach((t, k) => {
    const coinciden = sueltas.filter(x => t.includes(x)), n = coinciden.length;
    // Dos palabras del nombre, o una sola que sea rara (un apellido que tienen 4 personas o menos).
    if (n >= 2 || (n === 1 && (ix.frecuencia[coinciden[0]] || 0) <= 4)) jug.push([n, k, t.length]);
  });
  jug.sort((a, b) => b[0] - a[0] || a[2] - b[2]); // el nombre más justo primero
  let jugadores = jug.map(([, k]) => datos.jugadores[k]);
  // Si la pregunta nombra un equipo, quedan los jugadores de ese club (hay muchos "Juan Manuel Rodríguez").
  const clubes = new Set(porNombreDirecto.map(i => eq(i).eq));
  if (clubes.size) { const f = jugadores.filter(j => clubes.has(eq(j[1]).eq)); if (f.length) jugadores = f; }
  // Si la pregunta dice la categoría, primero los de esa categoría.
  if (cat) jugadores.sort((a, b) => (eq(a[1]).cat === cat ? 0 : 1) - (eq(b[1]).cat === cat ? 0 : 1));
  jugadores = jugadores.slice(0, 6);
  for (const j of jugadores.slice(0, 3)) if (!elegidos.includes(j[1]) && elegidos.length < 5) elegidos.push(j[1]);

  // Si pregunta por el rival o la previa, va también el rival del próximo partido.
  if (/\b(rival|contra|enfrenta|previa|partido|juega|juegan|llega|llegan)\b/.test(q)) for (const i of porNombreDirecto) {
    const e = eq(i); if (!e.rival) continue;
    const r = datos.equipos.findIndex(o => o.div === e.div && o.eq === e.rival);
    if (r >= 0 && !elegidos.includes(r) && elegidos.length < 6) elegidos.push(r);
  }
  // Nada concreto: el equipo del usuario en la divisional que está mirando, o el de Mayores.
  const divPedida = divisionalDe(ix, q, cat, div) || (!elegidos.length ? divisionalDe(ix, qPrev, cat, div) : null);
  if (!elegidos.length && club && !divPedida && !pide.punterosCategoria) {
    const c = norm(club);
    const delClub = datos.equipos.map((e, i) => [e, i]).filter(([e]) => norm(e.eq).startsWith(c) || c.startsWith(norm(e.eq)));
    const uno = delClub.find(([e]) => e.div === div) || delClub.find(([e]) => (cat ? e.cat === cat : e.cat === 'Mayores')) || delClub[0];
    if (pide.todasCategorias && delClub.length) elegidos.push(...delClub.slice(0, 10).map(([, i]) => i));
    else if (uno) elegidos.push(uno[1]);
  }
  const todoElClub = todoElClubNombrado || (pide.todasCategorias && elegidos.length > 1 && new Set(elegidos.map(i => eq(i).eq)).size === 1);
  const campana = /\b(resultados|campana|temporada|todos los partidos|racha|historial|enfrentamientos|veces|goleada|derrota)\b/.test(q) || pide.numeros || pide.detallePartido;
  // Categoría sin letra ("los punteros de mayores", "tablas de sub 20"): resumen de todas sus divisionales.
  const catPedida = catEnPregunta && !divPedida && !elegidos.length ? cat : null;
  return { equipos: elegidos, jugadores, cat, div, campana, divPedida, catPedida, pide, todoElClub, pregunta: q };
}

const lista = (t, l) => l?.length ? `${t}: ${l.join('; ')}` : null;
export function textoEquipo(e, pide = {}) {
  const todo = !pide || !Object.values(pide).some(Boolean);
  return [`EQUIPO ${e.eq} (${e.divNombre})`, e.prox && `Próximo partido: ${e.prox}`, e.ultimo && `Último partido jugado: ${e.ultimo}`, e.pos && `Posición: ${e.pos}`, `Campaña en la temporada: ${e.campana}`,
    e.racha && `Racha: ${e.racha}`,
    lista('Últimos resultados', e.ultimos), lista('Posibles bajas para el próximo partido', e.bajas) || 'Posibles bajas: ninguna detectada',
    (pide.novedades || todo) && (lista('Otras novedades (jugadores que vuelven o que jugaron en otra categoría)', e.novedades) || 'Otras novedades: ninguna'),
    lista('Suspendidos', e.suspendidos) || 'Suspendidos: ninguno',
    (pide.sanciones || pide.historialSanciones) && (lista('Historial de sanciones de la temporada (más recientes primero)', e.sanciones) || 'Historial de sanciones: ninguna'),
    lista('Once probable', e.once), lista('Goleadores', e.goleadores),
    (pide.capitan || pide.plantel) && e.capitan && `Capitán habitual: ${e.capitan}`,
    (pide.numeros || pide.racha || pide.tabla || todo) && e.numeros && `Números de la temporada (sin W.O.): ${e.numeros}`,
    pide.tramos && e.tramos && `Goles por tramo de 15 minutos: ${e.tramos}`,
    lista('Cara a cara con el próximo rival en OTRAS categorías esta temporada', e.caraOtras),
    lista('Ya jugados pero SIN RESULTADO CARGADO todavía (no están en la tabla)', e.sinCargar),
    e.quedanTotal != null && `Partidos que le quedan en el fixture: ${e.quedanTotal}${e.quedan?.length ? ` (${e.quedan.join('; ')})` : ''}`,
    e.escenario && `Cuentas del próximo partido (ya hechas): ${e.escenario}`].filter(Boolean).join('\n');
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
  const filas = t.map((x, i) => { const dif = x.gf - x.gc; return `${i + 1}° ${x.eq} ${x.pts} pts (${x.pj} PJ, ${x.g}G ${x.e}E ${x.p}P, GF ${x.gf} GC ${x.gc}, DIF ${dif > 0 ? '+' : ''}${dif})${x.prov ? ' [incluye resultado provisorio]' : ''}; le quedan ${x.q}${x.sc > 0 ? ` (${x.sc} ya jugado sin resultado cargado)` : ''}, puede llegar a ${max[i]}; ${max[i] >= punta ? 'todavía puede terminar 1°' : 'ya no puede terminar 1°'}`; });
  filas.push(t[0].pts > Math.max(...max.slice(1)) ? `${t[0].eq} ya tiene asegurado el 1° puesto.` : 'Nadie tiene asegurado el 1° puesto todavía.');
  return `(Con resultados PROVISORIOS cargados a mano: ${vale.map(p => `${p.l} ${p.gl}-${p.gv} ${p.v}`).join('; ')}. Todavía no son oficiales.)\n` + filas.join('\n');
}
// Extremos de una tabla (mejor ataque, mejor defensa, mejor diferencia), ya calculados.
function extremosTabla(datos, k) {
  const raw = datos.tablasRaw?.[k]; if (!raw?.length) return null;
  const por = (f, desc = true) => [...raw].sort((a, b) => desc ? f(b) - f(a) : f(a) - f(b))[0];
  const dif = r => r[5] - r[6];
  const a = por(r => r[5]), d = por(r => r[6], false), m = por(dif), p = por(dif, false), pd = por(r => r[6]);
  return `Resumen ya calculado: mejor ataque ${a[0]} (${a[5]} GF); mejor defensa ${d[0]} (${d[6]} GC); peor defensa ${pd[0]} (${pd[6]} GC); mejor diferencia ${m[0]} (${dif(m) > 0 ? '+' : ''}${dif(m)}); peor diferencia ${p[0]} (${dif(p)}).`;
}
const peso = k => /t[ií]tulo/i.test(k) ? 0 : /primera rueda/i.test(k) ? 2 : 1;
const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// Lista de resultados de un equipo, con autores de goles si se piden.
function resultadosTexto(e, conGoles) {
  return e.resultados.map(([d, r, gf, gc, et, loc, wo, gF, gC, f]) => `${ddmm(d)} ${gf > gc ? 'G' : gf === gc ? 'E' : 'P'} ${gf}-${gc} vs ${r} (${loc ? 'local' : 'visitante'}, ${et}${f ? ` fecha ${f}` : ''}${wo ? ', W.O.' : ''})`
    + (conGoles && (gF || gC) ? ` [goles de ${e.eq}: ${gF || 'ninguno'}${gC ? `; goles en contra a los ${gC}` : ''}]` : '')).join('; ');
}
// Rankings de una divisional (los mismos que la sección Rankings de la página).
function rankingsTexto(datos, dv, nombre) {
  if (!datos.jugadores) return null;
  const ids = new Map(datos.equipos.map((e, i) => [i, e]).filter(([, e]) => e.div === dv));
  const L = datos.jugadores.filter(j => ids.has(j[1]));
  if (!L.length) return null;
  const eqDe = j => ids.get(j[1]).eq;
  const top = (arr, f, n = 8) => arr.map((j, k) => `${k + 1}. ${j[0]} (${eqDe(j)}) ${f(j)}`).slice(0, n).join('; ');
  const porMin = [...L].sort((a, b) => b[4] - a[4]);
  const rojas = L.filter(j => j[6] > 0).sort((a, b) => b[6] - a[6]);
  const banco = [...L].sort((a, b) => b[7] - a[7]);
  const cada = L.filter(j => j[4] >= 450 && j[5] >= 2).map(j => [j, j[4] / j[5]]).sort((a, b) => a[1] - b[1]);
  const pct = L.map(j => [j, j[4] / (ids.get(j[1]).minTot || 1)]).sort((a, b) => b[1] - a[1]);
  const partidos = [...L].sort((a, b) => b[2] - a[2] || b[3] - a[3]);
  const rot = datos.divisionales?.[dv]?.rotacion || [];
  return [`RANKINGS DE ${nombre} (toda la temporada, con las planillas cargadas):`,
    `Más minutos: ${top(porMin, j => `${j[4]}' en ${j[2]} PJ`)}`,
    `Más partidos jugados: ${top(partidos, j => `${j[2]} PJ (${j[3]} de titular)`)}`,
    `Más expulsiones (rojas): ${rojas.length ? top(rojas, j => `${j[6]} roja${j[6] > 1 ? 's' : ''}`) : 'nadie fue expulsado'}`,
    `Gol cada menos minutos (mínimo 450' y 2 goles): ${cada.length ? cada.slice(0, 8).map(([j, r], k) => `${k + 1}. ${j[0]} (${eqDe(j)}) un gol cada ${Math.round(r)}' (${j[5]} goles)`).join('; ') : 'nadie llega al mínimo'}`,
    `Siempre en cancha (porcentaje de los minutos de su equipo): ${pct.slice(0, 8).map(([j, p], k) => `${k + 1}. ${j[0]} (${eqDe(j)}) ${Math.round(p * 100)}%`).join('; ')}`,
    `Los que más entran desde el banco: ${top(banco.filter(j => j[7] > 0), j => `${j[7]} veces`)}`,
    rot.length ? `Equipos que más rotan (jugadores distintos usados, y cuántos fueron titulares): ${rot.map(([e, u, t], k) => `${k + 1}. ${e} ${u} jugadores (${t} titulares)`).join('; ')}` : null].filter(Boolean).join('\n');
}
function jugadorTexto(datos, j) {
  const [n, i, pj, tit, min, gol, rojas, ingresos, cam, ultimo] = j;
  const e = datos.equipos[i], gf = (e.resultados || []).reduce((s, r) => s + r[2], 0);
  return `${n}: juega en ${e.eq} (${e.divNombre})${cam ? `, camiseta ${cam}` : ''}; ${pj} partidos (${tit} de titular, ${ingresos} entrando desde el banco), ${min} minutos, ${gol} goles`
    + (gf && gol ? ` de los ${gf} de su equipo (${Math.round(gol / gf * 100)}%)` : '') + `, ${rojas} roja${rojas === 1 ? '' : 's'}${ultimo ? `; último partido: ${ultimo}` : ''}`
    + (e.bajas.some(b => b.startsWith(n + ' ')) ? `; FIGURA EN LAS POSIBLES BAJAS: ${e.bajas.find(b => b.startsWith(n + ' '))}` : '')
    + (e.suspendidos.some(s => s.startsWith(n + ':')) ? `; SUSPENDIDO: ${e.suspendidos.find(s => s.startsWith(n + ':'))}` : '')
    + (e.once.some(o => o.startsWith(n)) ? `; está en el once probable${e.once.find(o => o.startsWith(n)).includes('(duda)') ? ' (en duda)' : ''}` : '');
}

export function contexto(datos, hallado, prov = []) {
  const pide = hallado.pide || {};
  const partes = hallado.equipos.map(i => {
    const e = datos.equipos[i], pv = provisoriosDe(datos, e, prov);
    return textoEquipo(e, pide) + (pv.length ? `\nResultado PROVISORIO (cargado a mano porque la Liga todavía no lo subió): ${pv.map(p => `${p.l} ${p.gl}-${p.gv} ${p.v}`).join('; ')}` : '');
  });
  const mencionados = hallado.equipos.slice(0, hallado.todoElClub ? 10 : 4).map(i => datos.equipos[i]);
  // Todo el club: en qué categorías juega (y resumen corto de cada equipo).
  if (hallado.todoElClub && mencionados.length) partes.unshift(`CLUB ${mencionados[0].eq}: juega en ${mencionados.map(e => e.divNombre).join(', ')}.`);
  // Cara a cara: todos los partidos de la temporada entre los equipos mencionados de la misma divisional.
  for (let a = 0; a < mencionados.length; a++) for (let b = a + 1; b < mencionados.length; b++) {
    const x = mencionados[a], y = mencionados[b];
    if (x.div !== y.div || !x.resultados) continue;
    const entre = x.resultados.filter(r => r[1] === y.eq);
    partes.push(`CARA A CARA ${x.eq} vs ${y.eq} en ${x.divNombre} (todos los de la temporada, goles de ${x.eq} primero): `
      + (entre.length ? entre.map(([d, , gf, gc, et, loc, wo, gF, gC]) => `${ddmm(d)} ${et}: ${x.eq} ${gf}-${gc} ${y.eq} (${x.eq} de ${loc ? 'local' : 'visitante'}${wo ? ', W.O.' : ''})${gF || gC ? ` [goles de ${x.eq}: ${gF || 'ninguno'}; goles de ${y.eq} a los ${gC || '—'}]` : ''}`).join('; ')
        + `. En total: ${entre.length} partidos, ${x.eq} hizo ${entre.reduce((s, r) => s + r[2], 0)} goles y recibió ${entre.reduce((s, r) => s + r[3], 0)}.`
        : 'no se enfrentaron todavía esta temporada.'));
  }
  // Si pregunta por la campaña, los resultados o los goles, va la lista completa del primer equipo.
  if (hallado.campana && mencionados[0]?.resultados && !hallado.todoElClub) {
    const e = mencionados[0];
    partes.push(`TODOS LOS RESULTADOS DE ${e.eq} (${e.divNombre}), del más viejo al más nuevo: ` + resultadosTexto(e, pide.detallePartido || pide.goles));
  }
  // La tabla del grupo de cada equipo (una vez por grupo), para poder razonar con los puntos.
  const vistas = new Set();
  const ponerTabla = (k, nombre) => {
    if (!k || vistas.has(k) || !datos.tablas?.[k]) return;
    vistas.add(k);
    partes.push(`TABLA ${nombre} – ${k.split('|')[1]} (oficial de la Liga, puntos de toda la temporada; DIF = diferencia de gol; "puede llegar a" = puntos si gana todo lo que le queda):\n${tablaTexto(datos, k, prov)}${pide.tabla ? '\n' + (extremosTabla(datos, k) || '') : ''}`);
  };
  for (const i of hallado.equipos.slice(0, hallado.todoElClub ? 1 : 3)) ponerTabla(datos.equipos[i].tabla, datos.equipos[i].divNombre);
  // Plantel del primer equipo (minutos, titularidades, goles), si la pregunta es sobre sus jugadores.
  if ((pide.plantel || pide.goles || pide.rankings) && mencionados[0] && datos.jugadores) {
    const i0 = hallado.equipos[0];
    const plantel = datos.jugadores.filter(j => j[1] === i0).sort((a, b) => b[4] - a[4]).slice(0, 30);
    if (plantel.length) partes.push(`PLANTEL DE ${mencionados[0].eq} (${mencionados[0].divNombre}), ordenado por minutos [PJ (titular), minutos, goles, rojas, veces que entró del banco, camiseta]: `
      + plantel.map(([n, , pj, tit, min, gol, rojas, ing, cam]) => `${n}: ${pj} PJ (${tit} tit.), ${min}', ${gol} goles, ${rojas} rojas, ${ing} del banco${cam ? `, camiseta ${cam}` : ''}`).join('; '));
  }
  // Toda una divisional: fixture, resultados de la fecha, tablas, goleadores, suspendidos, rankings.
  const divs = hallado.divPedida ? [hallado.divPedida] : (!hallado.equipos.length && !hallado.catPedida ? [hallado.div || 'mayores-a'] : (mencionados[0] && (pide.fixture || pide.resultadosFecha || pide.rankings || pide.picantes) ? [mencionados[0].div] : []));
  for (const dv of divs) {
    const delDiv = datos.equipos.map((e, i) => [e, i]).filter(([e]) => e.div === dv);
    if (!delDiv.length) continue;
    const nombre = delDiv[0][0].divNombre, D = datos.divisionales?.[dv];
    const sinPedido = !pide.goles && !pide.sanciones && !pide.plantel && !pide.fixture && !pide.resultadosFecha && !pide.rankings;
    if (pide.fixture || sinPedido) partes.push(`PRÓXIMA FECHA DE ${nombre} (todos los partidos programados): ${D?.proxPartidos?.length ? D.proxPartidos.join('; ') : 'no hay partidos programados en el fixture'}.`);
    if (pide.resultadosFecha || sinPedido) partes.push(`ÚLTIMA FECHA JUGADA EN ${nombre} (resultados): ${D?.ultPartidos?.length ? D.ultPartidos.join('; ') : 'sin resultados cargados'}.`);
    if (pide.wo || (D?.wos?.length && pide.resultadosFecha)) partes.push(`Partidos por W.O. en ${nombre}: ${D?.wos?.length ? D.wos.join('; ') : 'ninguno en la temporada'}.`);
    if (pide.tabla || sinPedido || pide.resultadosFecha || pide.goles || pide.wo) {
      const ks = [...new Set(delDiv.map(([e]) => e.tabla).filter(Boolean))].filter(k => !vistas.has(k) && datos.tablas?.[k]).sort((a, b) => peso(a) - peso(b));
      for (const k of ks) ponerTabla(k, nombre);
      if (sinPedido) partes.push(`EQUIPOS DE ${nombre}:\n` + delDiv.map(([e]) => `${e.eq}: ${e.pos || 'sin posición'}; ${e.campana}${e.racha ? '; ' + e.racha : ''}${e.prox ? '; próximo ' + e.prox : ''}; ${e.bajas.length} posibles bajas, ${e.suspendidos.length} suspendidos`).join('\n'));
    }
    if (pide.goles && datos.jugadores) {
      const ids = new Set(delDiv.map(([, i]) => i));
      const top = datos.jugadores.filter(j => ids.has(j[1]) && j[5] > 0).sort((a, b) => b[5] - a[5] || a[4] - b[4]).slice(0, 15);
      partes.push(`GOLEADORES DE ${nombre} (toda la temporada, con planilla cargada): ` + top.map(([n, i, pj, , , gol], k) => `${k + 1}. ${n} (${datos.equipos[i].eq}) ${gol} goles en ${pj} PJ`).join('; '));
    }
    if (pide.sanciones) {
      const s = delDiv.flatMap(([e]) => e.suspendidos.map(x => `${e.eq} – ${x}`));
      partes.push(`SUSPENDIDOS EN ${nombre}: ` + (s.length ? s.join('\n') : 'ninguno con sanción vigente.'));
      if (pide.historialSanciones) partes.push(`HISTORIAL DE SANCIONES EN ${nombre} (más recientes primero, por equipo):\n` + delDiv.flatMap(([e]) => e.sanciones.slice(0, 4).map(x => `${e.eq} – ${x}`)).join('\n'));
    }
    if (pide.rankings) { const r = rankingsTexto(datos, dv, nombre); if (r) partes.push(r); }
  }
  // Categoría sin letra: punteros y resumen de cada divisional.
  if (hallado.catPedida) {
    const porDiv = new Map();
    for (const e of datos.equipos) if (e.cat === hallado.catPedida && !porDiv.has(e.div)) porDiv.set(e.div, e);
    const lineas = [...porDiv.values()].map(e => {
      const ks = [...new Set(datos.equipos.filter(x => x.div === e.div).map(x => x.tabla).filter(Boolean))].sort((a, b) => peso(a) - peso(b));
      return `${e.divNombre}: ` + ks.map(k => { const raw = datos.tablasRaw?.[k] || []; return `${k.split('|')[1]}: ${raw.slice(0, 3).map((r, i) => `${i + 1}° ${r[0]} ${r[7]} pts`).join(', ')}${raw.length > 3 ? `, ... último ${raw.at(-1)[0]} ${raw.at(-1)[7]} pts` : ''}`; }).join(' | ');
    });
    partes.push(`DIVISIONALES DE ${hallado.catPedida.toUpperCase()} (los 3 primeros y el último de cada grupo):\n${lineas.join('\n')}`);
    if (pide.goles && datos.jugadores) {
      const ids = new Map(datos.equipos.map((e, i) => [i, e]).filter(([, e]) => e.cat === hallado.catPedida));
      const top = datos.jugadores.filter(j => ids.has(j[1]) && j[5] > 0).sort((a, b) => b[5] - a[5]).slice(0, 12);
      partes.push(`GOLEADORES DE ${hallado.catPedida.toUpperCase()} (todas las divisionales): ` + top.map(([n, i, pj, , , gol], k) => `${k + 1}. ${n} (${ids.get(i).eq}, ${ids.get(i).divNombre}) ${gol} goles en ${pj} PJ`).join('; '));
    }
  }
  if (hallado.jugadores.length) {
    // El mismo jugador en otras categorías del club (mismo nombre, mismo club).
    const otras = j => (datos.jugadores || []).filter(o => o !== j && o[0] === j[0] && datos.equipos[o[1]].eq === datos.equipos[j[1]].eq && !hallado.jugadores.includes(o));
    partes.push('JUGADORES MENCIONADOS:\n' + hallado.jugadores.map(j => jugadorTexto(datos, j) + otras(j).map(o => `\n  (también juega en ${datos.equipos[o[1]].divNombre}: ${o[2]} PJ, ${o[4]}', ${o[5]} goles)`).join('')).join('\n'));
  } else if (hallado.pide?.plantel === false && datos.jugadores && /\b[a-z]{4,}\b/.test(hallado.pregunta || '') && !hallado.equipos.length && !hallado.divPedida && !hallado.catPedida) {
    partes.push('(No encontré ningún jugador ni equipo con ese nombre en las planillas de esta temporada.)');
  }
  if (pide.picantes && datos.picantes?.length) partes.push(`PARTIDOS PICANTES DE LA FECHA (elegidos por la página según lo que se juegan, con el puesto de cada uno): ${datos.picantes.join('; ')}.`);
  if (pide.aciertos && datos.aciertos) partes.push(`PRECISIÓN DEL ONCE PROBABLE: ${datos.aciertos}`);
  if (pide.actualizado || pide.secciones) partes.push(`SOBRE LA PÁGINA: los datos se actualizaron el ${new Date(datos.actualizado).toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'full', timeStyle: 'short' })}; el último resultado cargado es del ${datos.ultimoResultado ? ddmm(datos.ultimoResultado) : '—'}. El robot pasa los domingos de noche y de lunes a jueves; los fallos del Tribunal salen los jueves. Secciones: Bajas, Partidos, Tabla, Jugadores, Rankings, Sanciones, y "Mi equipo". Fuentes: planillas oficiales y Fallos y Penas de la Liga (ligauniversitaria.org.uy). Las bajas son deducciones de las planillas, no partes médicos.`);
  if (!partes.length) {
    const delDiv = datos.equipos.filter(e => e.div === hallado.div || (!hallado.div && e.div === 'mayores-a'));
    if (delDiv.length) partes.push(`DIVISIONAL ${delDiv[0].divNombre}:\n` + delDiv.map(e => `${e.eq}: ${e.pos || 'sin posición'}; ${e.campana}${e.prox ? '; próximo ' + e.prox : ''}; ${e.bajas.length} posibles bajas, ${e.suspendidos.length} suspendidos`).join('\n'));
  }
  return partes.join('\n\n');
}
