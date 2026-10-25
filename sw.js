// Planilla LUD sin señal: guarda la página y lo último que se vio de cada divisional, así abre aunque no
// haya internet (en la cancha). Con señal siempre va primero a buscar lo nuevo; si la señal es mala y en
// 4 segundos no llegó, muestra lo guardado y guarda lo nuevo cuando llegue.
// Solo toca lo de esta página y las letras de Google: Supabase (contador) y el servidor en vivo van directo.
const CACHE = 'planilla-lud-v1';
const BASE = ['./', 'manifest.webmanifest', 'favicon.svg', 'app/icono-192.png'];
const FUENTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (FUENTES.test(r.url)) { e.respondWith(primeroLoGuardado(r)); return; }
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  // Sin el ?v=... que cambia cada 10 minutos: una sola copia por archivo.
  e.respondWith(primeroLaRed(r, u.origin + u.pathname));
});
async function primeroLaRed(r, clave) {
  const cache = await caches.open(CACHE);
  const red = fetch(r).then(res => { if (res.ok) cache.put(clave, res.clone()); return res; });
  const guardado = await cache.match(clave);
  if (!guardado) return red;
  return Promise.race([red.catch(() => guardado), new Promise(ok => setTimeout(() => ok(guardado), 4000))]);
}
async function primeroLoGuardado(r) {
  const guardado = await caches.match(r);
  if (guardado) return guardado;
  const res = await fetch(r);
  if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
  return res;
}
