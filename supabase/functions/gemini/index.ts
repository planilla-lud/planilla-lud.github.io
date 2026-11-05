// Gemini con la clave del club, sin que la clave llegue nunca al navegador.
// El navegador manda acá los pedidos chicos (empezar una subida, ver el estado de un video, borrarlo y el análisis);
// los videos se suben directo a Google con la dirección de subida que devuelve el primer paso, que no lleva la clave.
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://generativelanguage.googleapis.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-pm-club, x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, x-goog-upload-header-content-type",
  "Access-Control-Expose-Headers": "x-goog-upload-url, x-goog-upload-chunk-granularity",
};
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const err = (status: number, message: string) => json({ error: { code: status, message } }, status);

// Qué se deja pasar: nada más que lo que usa la página.
function ruta(path: string, method: string) {
  if (method === "POST" && path === "/upload/v1beta/files") return "subir";
  if ((method === "GET" || method === "DELETE") && /^\/v1beta\/files\/[a-z0-9-]+$/i.test(path)) return "archivo";
  const m = path.match(/^\/v1beta\/models\/([a-z0-9.\-]+):generateContent$/i);
  if (method === "POST" && m) return "generar";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const path = u.pathname.replace(/^.*?\/gemini(?=\/)/, "");
  const tipo = ruta(path, req.method);
  if (!tipo) return err(404, "No permitido.");

  // Quién es y de qué club.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: ud, error: ue } = await admin.auth.getUser(token);
  if (ue || !ud?.user) return err(401, "Iniciá sesión de nuevo.");
  const { data: m } = await admin.from("pm_miembros").select("club, rol, clave_cambiada").eq("user_id", ud.user.id).maybeSingle();
  if (!m) return err(403, "Tu cuenta no es de ningún club.");
  const club = m.rol === "creador" ? (req.headers.get("x-pm-club") || "") : m.club;
  // Los jugadores también pueden analizar (el cuerpo técnico decide en Ajustes en qué planteles se les muestra).
  if (!["admin", "dt", "creador", "jug"].includes(m.rol) || (m.rol !== "creador" && !m.clave_cambiada)) return err(403, "Tu cuenta no puede analizar.");
  if (m.rol !== "creador") { // con el plan pausado o vencido no se analiza
    const { data: p } = await admin.from("pm_clubes").select("activo, pagado_hasta").eq("club", club).maybeSingle();
    const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // Uruguay
    if (!p?.activo || (p.pagado_hasta && p.pagado_hasta < hoy)) return err(402, "El plan del club está pausado.");
  }
  const { data: s } = await admin.from("pm_secretos").select("gemini").eq("club", club).maybeSingle();
  const clave = (s?.gemini || "").trim();
  if (!clave) return err(412, "El club todavía no cargó su clave de Gemini.");

  try {
    if (tipo === "subir") {
      const h: Record<string, string> = { "x-goog-api-key": clave, "Content-Type": "application/json" };
      for (const k of ["x-goog-upload-protocol", "x-goog-upload-command", "x-goog-upload-header-content-length", "x-goog-upload-header-content-type"]) { const v = req.headers.get(k); if (v) h[k] = v; }
      const r = await fetch(API + path, { method: "POST", headers: h, body: await req.text() });
      const out = new Headers({ ...CORS, "Content-Type": "application/json" });
      for (const k of ["x-goog-upload-url", "x-goog-upload-chunk-granularity"]) { const v = r.headers.get(k); if (v) out.set(k, v); }
      return new Response(await r.text(), { status: r.status, headers: out });
    }
    if (tipo === "archivo") {
      const r = await fetch(API + path, { method: req.method, headers: { "x-goog-api-key": clave } });
      return new Response(await r.text(), { status: r.status, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // El análisis puede tardar más de lo que el servidor espera sin respuesta: se contesta enseguida y se va mandando
    // lo que llega de Gemini (streaming), con un "sigo acá" cada 10 segundos mientras piensa.
    const cuerpo = await req.text();
    const up = path.replace(":generateContent", ":streamGenerateContent") + "?alt=sse";
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        const ping = setInterval(() => { try { ctl.enqueue(enc.encode(": sigo\n\n")); } catch {} }, 10000);
        try {
          const r = await fetch(API + up, { method: "POST", headers: { "x-goog-api-key": clave, "Content-Type": "application/json" }, body: cuerpo });
          if (!r.ok || !r.body) {
            const t = await r.text();
            ctl.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ status: r.status, body: t })}\n\n`));
          } else {
            const rd = r.body.getReader();
            for (;;) { const { value, done } = await rd.read(); if (done) break; ctl.enqueue(value); }
          }
        } catch (e) {
          ctl.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ status: 502, body: String(e) })}\n\n`));
        } finally { clearInterval(ping); ctl.close(); }
      },
    });
    return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return err(502, "No se pudo conectar con Gemini: " + String(e));
  }
});
