// Cosas compartidas: temporada actual y nombres cortos de los equipos.
export const TEMPORADA = 113; // temporada 2026 en el sistema de la Liga Universitaria
export const INICIO_TEMPORADA = '2026-01-01'; // las sanciones se leen desde esta fecha

// Nombres como los muestra la Liga -> como los mostramos acá.
export const NOMBRES = {
  'E.L.F.': 'ELF',
  'TAPE': 'TAPE',
  'OLD BOYS CLUB': 'Old Boys',
  'OLD WOODLANDS CLUB': 'Old Woodlands',
  'CARRASCO POLO CLUB': 'Carrasco Polo',
  'TENIS EL PINAR': 'Tenis El Pinar',
  'URUNDAY UNIVERSITARIO': 'Urunday',
  'NACIONAL UNIVERSITARIO': 'Nacional U.',
  'SANTA ELENA LAGOMAR': 'Santa Elena',
  'HEBRAICA UNIVERSITARIO': 'Hebraica y Macabi',
  'CARRASCO LAWN TENNIS': 'Carrasco Lawn Tennis',
  'OLD IVY': 'Old Ivy',
  'JUAN XXIII': 'Juan XXIII',
  'CLUB SEMINARIO': 'Seminario',
  'PLAYA HONDA UNIVERSITARIO': 'Playa Honda',
  'OLD CHRISTIANS CLUB': 'Old Christians',
  'OLD BRENDANS CLUB': 'Old Brendans',
  'NAUTICO CARRASCO Y PUNTA GORDA': 'Náutico',
  'SAN PABLO UNIVERSITARIO': 'San Pablo',
  'MATURANA UNIVERSITARIO': 'Maturana',
};

// Los números romanos van en mayúscula (Juan XXIII Blanco, no Juan Xxiii Blanco).
const romanos = s => s.replace(/\b(?=[ivxl]{2,}\b)x{0,3}(ix|iv|v?i{0,3})\b/gi, m => m.toUpperCase());
const titleCase = s => romanos(s.toLowerCase().replace(/(^|[\s(.-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()));
// La Liga manda la Ñ como Ð en algunos nombres (NUÐEZ): se corrige antes de todo.
export const enie = s => s.replace(/Ð/g, 'Ñ').replace(/ð/g, 'ñ');
export const corto = n => NOMBRES[enie(n.trim())] || titleCase(enie(n.trim()));
