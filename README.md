# Planilla LUD

Minutos jugados y posibles bajas de la Liga Universitaria de Deportes (Uruguay), sacados de las
planillas oficiales. Sigue Mayores (A a G), Sub 20 (A a C), Reserva (A a D), Pre Senior (A a E),
Más 40 (A a C), Sub 18 y Sub 16, con todas sus etapas: primera rueda, título y ascenso, permanencia o
copas. Sub 18 y Sub 16 no tienen divisionales (series, segunda rueda y copas): se analizan como un solo
bloque, así cada equipo conserva su historia de las series, y la web muestra una divisional por copa (Oro,
Plata, Bronce, Competencia, Confraternidad, Amistad) con sus equipos y todos sus partidos de la temporada
(`VISTAS` en `categorias.mjs`, `partirEnCopas()` en `analizar.mjs`).

Página: https://planilla-lud.github.io/

## Diseño

Tema "pizarra", el mismo de la página de presentación: vestuario de noche, pizarra táctica y tiza.
Fondo verde pizarra (siempre oscuro), texto color tiza y un solo acento amarillo marcador, usado poco
(botón principal, sección activa, Mi equipo). Los estados van en tiza de color (rojo = nivel alto,
naranja = medio) y las barras de minutos son trazos de tiza. Tipografía Big Shoulders Display (títulos y
cifras, en mayúscula), Instrument Sans (texto) e IBM Plex Mono (etiquetas chicas, como una planilla).
La portada tiene una cancha de tiza de fondo y toda la página una capa fija de grano. Aparición suave al
hacer scroll (se apaga si el teléfono pide reducir movimiento).
Todos los colores, radios, sombras y espacios son variables al principio del `<style>` de `index.html`.

En el celular hay barra de navegación abajo (Inicio, Bajas, Partidos, Tabla y Más) y la divisional se
elige desde el botón del encabezado. En la compu las secciones van en una fila arriba. `og.png` es la
imagen que aparece al compartir el link por WhatsApp.

## Qué muestra

- **Inicio:** la próxima fecha de un vistazo: cifras clave, lo más picante de todas las divisionales
  (cruces entre los cuatro de arriba, y entre los cuatro de abajo de la permanencia, la pelea por no
  descender, de todas las categorías juntas, ordenados por "picantez": suman las posiciones, 1° = 4
  hasta 4° = 1 por equipo arriba, y último = 4 hasta cuarto desde abajo = 1 en el descenso, y la divisional,
  A = 6 hasta G = 0, con 2 menos para Pre Senior, Más 40, Sub 18 y Sub 16; las copas de plata, bronce y
  demás no cuentan porque no tienen descenso), partidos con la forma de cada
  equipo y las bajas más importantes. En Inicio, Previas y Bajas los partidos van ordenados por importancia:
  primero el grupo de arriba (título / título y ascenso), después la copa de plata y la permanencia, y dentro
  de cada grupo los cruces entre los mejor ubicados. Cada partido muestra la posición de los dos equipos.
- **Bajas:** para cada partido de la próxima fecha, los jugadores de cada equipo que pueden faltar:
  expulsados, suspendidos probables, titulares habituales que no jugaron el último partido,
  lesiones probables (salió temprano y no jugó el siguiente) y titulares que salieron antes del entretiempo.
- **Partidos:** arriba, la próxima fecha con la previa de cada partido; abajo, los resultados de la temporada.
  La previa de cada partido trae el once probable de cada equipo (titulares de los
  últimos 5 partidos, el último pesa mucho más, sin suspendidos, con las dudas marcadas y un solo arquero), las bajas, cómo vienen (últimos 5),
  el cara a cara de la temporada entre esos clubes en todas las categorías, en qué minutos hacen y
  reciben goles, y los goleadores en racha. Se puede compartir por WhatsApp. También trae "Números para
  pronosticar": cómo le va al local de local y al visitante de visitante, goles a favor y en contra por
  partido, cada cuánto marcan los dos, más de 2,5 goles, valla invicta, el resultado más repetido y la
  cuenta de los promedios (lo que hace uno contra lo que recibe el otro). Sin los W.O.
- **Mi equipo:** elegís tu club una vez (queda guardado en el navegador) y la web abre directo en lo
  tuyo: próximo partido, bajas y suspendidos de todos los equipos del club, en todas las categorías.
  Arriba, "Cómo le fue" en la última semana: el resultado de cada categoría, quién hizo los goles y cómo
  quedó en la tabla, con un botón para mandarlo al grupo del club por WhatsApp.
- **Tabla:** la tabla de posiciones de cada grupo (título, permanencia o copa, y la primera rueda o las series),
  con PJ, G, E, P, goles, diferencia y puntos. Abajo de cada equipo: los últimos 5, la racha (3 o más
  iguales seguidos, o 4 o más sin perder / sin ganar), las bajas de nivel alto de la próxima fecha y el
  próximo rival con su posición. Líneas punteadas: los 4 que pelean el título, los 8 que pasan de la
  primera rueda y los 4 que pelean por no descender. Tu equipo de "Mi equipo" queda marcado. Cada previa
  trae "Qué se juegan": la tabla del grupo con los dos equipos marcados y la distancia en puntos. Tocando
  un equipo se entra a su página: plantel con partidos, titularidades, minutos, goles y los últimos 5.
- **Contador (arriba en todas las pestañas):** entradas a la página (cada apertura), los 3 partidos más vistos de
  la temporada (la previa y la página del partido jugado suman juntas) y los 3 clubes favoritos (cuántos
  celulares o compus lo tienen en Mi equipo). Se guarda en Supabase: el SQL está en `supabase/contador.sql` y
  la web usa la clave pública, que solo puede llamar a esas funciones. Solo cuenta en la página publicada;
  `?nocontar` en la dirección hace que ese navegador no cuente más (para no inflar con tus propias visitas).
- **Jugadores:** ficha de cada uno, partido a partido (cuándo entró, cuándo salió, reingresos y goles).
- **Detalle de cada partido jugado:** minuto a minuto y formaciones con los minutos de cada jugador.
- **Rankings:** más minutos, goleadores, minutos por gol, los que siempre están en cancha, los que más
  entran desde el banco, expulsiones y equipos que más rotan.
- **Sanciones:** suspensiones automáticas y fallos del Tribunal (de Fallos y Penas), con cuántas fechas
  le quedarían a cada uno.

En Bajas, cada partido tiene un botón para compartir las bajas por WhatsApp (o con el menú de compartir
del celular), y otro para mandar toda la fecha.

Son pistas sacadas de las planillas, no partes médicos: un titular que no juega puede estar
lesionado, de viaje o de exámenes. Las suspensiones se confirman en Fallos y Penas de la Liga
(se publican los jueves a las 21 h).

## App en el celu

La página se instala como app ("Agregar a pantalla de inicio" en el iPhone desde Safari, o "Instalar app"
en Chrome de Android): `manifest.webmanifest` y los íconos y pantallas de arranque de `app/`. Los genera
`herramientas/portada.py` con el mismo diseño de la página.

Anda sin señal (en la cancha): `sw.js` guarda la página y lo último que se vio de cada divisional. Con
señal va primero a buscar lo nuevo; si en 4 segundos no llegó, muestra lo guardado. Sin conexión, un aviso
arriba dice de cuándo son esos datos. No toca Supabase ni el servidor en vivo, que van directo.

## Cómo funciona

- `scripts/detalle.mjs` baja la planilla de cada partido jugado a `planillas/<categoria>/<ID>.json`
  desde la API de la Liga (`resultados/api.php?action=...&id=<ID>`) y el fixture de los próximos
  partidos. Solo baja lo que falta; un partido se vuelve a bajar durante 4 días por si la Liga
  corrige la planilla. Con `REBAJAR=1` baja todo de nuevo.
- `scripts/sanciones.mjs` baja las sanciones de la temporada del buscador de Fallos y Penas
  (`ligauniversitaria.org.uy/fallosypenas/api.php`) a `planillas/_sanciones/<categoria>.json`.
  Cada sanción trae carné, serie y número de partido, así que se cruza con las planillas.
- `scripts/analizar.mjs` revisa cada planilla, calcula minutos (con reingresos) y alertas, y escribe
  `data/<categoria>.json`, que es lo que lee `index.html`. Al final llama a `scripts/picantes.mjs`, que arma
  `data/posiciones.json` (la tabla completa de cada grupo que muestra la sección Tabla, sacada de la tabla oficial de la Liga:
  `posiciones/api.php?action=cargarPosiciones`) y `data/picantes.json` (los partidos más picantes de todas
  las divisionales, para la portada). Se puede correr solo con `node scripts/picantes.mjs`.
  La tabla oficial importa: incluye los partidos que da el Tribunal, los W.O. y los formatos especiales
  (copa de plata, Reserva D). Si la Liga no responde, se calcula como el reglamento (art. 3): en la segunda
  etapa cada equipo conserva lo de la primera rueda (puntos, goles y partidos jugados).
- `scripts/categorias.mjs` define qué categorías y divisionales se siguen y qué series tiene cada una
  (códigos de `ligauniversitaria.org.uy/config/config.json` y de las páginas de estadísticas de la Liga).
  Para sumar una divisional alcanza con agregar una línea ahí: la web la muestra sola.
  `scripts/comun.mjs` tiene la temporada y los nombres cortos.
- El mismo club juega con nombres distintos según la categoría ("Elf Blanco", "Old Christians Azul"...):
  `clubDe()` en `analizar.mjs` los junta, con una lista de alias para los casos raros.
- Los datos quedan uno por divisional (`data/mayores-a.json`, `data/reserva-d.json`, ...) y
  `data/indice.json` lista las disponibles. `data/clubes.json` tiene el resumen por club para "Mi equipo".
- Variables útiles al correr a mano: `SOLO=mayores-b,reserva-a` (solo esas divisionales),
  `REBAJAR=1` (bajar todo de nuevo), `MAX_MIN=60` (cortar la bajada a los 60 minutos y seguir en la próxima).
- GitHub Actions (`.github/workflows/actualizar.yml`) corre todo solo el domingo a las 18:35, de lunes
  a jueves a las 20:35 y el jueves a las 22:35, después de que salen los fallos (hora de Montevideo). Además,
  sábados y domingos se fija cada una hora, de 14:05 a 03:05, si hay partidos jugados sin cargar
  (`scripts/faltan.mjs`): si hay, baja solo esos; si no, termina enseguida. De lunes a viernes hace lo mismo
  cada 2 horas, de 8:05 a 0:05, porque la Liga sube las planillas del finde a cualquier hora de la semana. Así lo del sábado (Reserva,
  Sub 20...) entra el mismo sábado de noche, apenas la Liga lo publica. También se puede correr a mano:
  Actions > "Actualizar planillas y bajas" > Run workflow.

## Cuánto acierta

`medirAciertos()` en `analizar.mjs` rearma cada partido de la temporada (desde el 4.º de cada equipo) con lo
que se sabía antes: las planillas anteriores y las sanciones publicadas hasta ese día, con las fechas que
llevaba cumplidas. Calcula el once probable y las alertas, y los compara con la planilla real. Escribe
`data/aciertos.json`: titulares acertados por partido (total, por categoría, divisional y equipo), arquero,
y para cada tipo de alerta cuántos marcados no fueron titulares o no jugaron, contra la referencia de los
titulares sin alerta. La referencia del once es repetir el del partido anterior.

Con esa medición se ajustaron los pesos del once (`[1, .5, .3, .2, .1]` para los últimos 5 partidos; antes
`[1, .8, .65, .5, .4]` empataba con repetir el once anterior) y se vio que una suspensión de otra categoría
que no dice "todas las categorías" la cumple 3 de cada 4 veces: es duda, no baja segura. Para probar otros
pesos sin tocar el código: `AJUSTE='{"W":[1,.6,.4,.3,.2]}' node scripts/analizar.mjs`.

Los arqueros fallan más de lo que parece (alrededor de 3 de cada 4): casi siempre porque el equipo rota
arqueros, no porque se identifique mal.

## Arqueros

La planilla no trae posiciones. El arquero se deduce (`arqueros()` en `analizar.mjs`): arranca con la 1 o
la 12 en al menos 6 de cada 10 partidos que es titular (y 2 como mínimo), casi nunca sale reemplazado antes
del 80' y no hace goles. Se identifica en unos 190 de los 230 equipos; en el resto nadie usa la 1 o la 12
de forma fija y la web lo aclara. El once probable lleva siempre un solo arquero (el más reciente).

## Lo que hay que saber de las planillas de la Liga

- En la LUD hay reingreso: un jugador puede salir y volver. Los minutos lo tienen en cuenta.
- No hay acumulación de amarillas y la Liga no carga los amonestados.
- Los expulsados vienen sin minuto, así que sus minutos pueden quedar de más.
- El campo `EnContra` no indica gol en contra. Un gol en contra viene con el carné de un jugador rival.
- A veces la planilla hace salir a alguien que ya había salido: se toma como salida de quien había
  entrado por él. Lo que no tiene arreglo obvio se descarta del cálculo y queda anotado.

## Cómo se cuentan las fechas de suspensión

La Liga publica cuántas fechas le dieron a cada uno (`F:2` = 2 fechas). Las cumplidas se cuentan con los
partidos que jugó su equipo, en la divisional de la expulsión, después de ese partido. Es aproximado: si
la Liga cuenta partidos de otra categoría, puede variar.

Dos reglas para no dejar suspensiones colgadas:
- Si el jugador volvió a jugar (en cualquier categoría, al menos 3 días después de la expulsión), la
  suspensión se da por cumplida, aunque la cuenta diga otra cosa.
- Si lo expulsaron, no tiene suspensión automática y pasaron más de 3 semanas sin fallo del Tribunal,
  deja de figurar como "esperando fallo" y pasa al historial como "sin fallo".

## Temporada nueva

Cambiar `TEMPORADA` e `INICIO_TEMPORADA` en `scripts/comun.mjs` (y los códigos de serie en `categorias.mjs` si cambian).

## Chat ("Preguntale")

Un chat con IA gratis para preguntar por cualquier equipo o jugador. `scripts/chat.mjs` arma `data/chat.json`
(resumen de cada equipo e índice de jugadores) después de cada análisis. `worker/` es el servidor en Cloudflare:
busca en ese resumen lo que menciona la pregunta (`worker/src/buscar.js`) y se lo pasa a la IA, que solo contesta
con eso. Usa Workers AI (cuota diaria gratis de Cloudflare) y, si se acaba, Gemini o Groq cuando hay claves.
`.github/workflows/chat.yml` lo publica con los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` y
escribe su dirección en `chat-config.json`; la página muestra el botón solo si ese archivo existe.

