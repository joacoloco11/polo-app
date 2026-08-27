/**
 * El ranking de la temporada.
 *
 *   GET /api/ranking
 *
 * Prácticas jugadas, puntos y MVP. Lo ve todo el club: es el que se mira en el
 * grupo. La cuenta de los puntos vive en la vista `v_participacion` de la base
 * —3 el partido ganado, 1 el empatado, la mitad en las de 12—, así que sale
 * igual desde cualquier lado.
 *
 * Dos cosas se resuelven acá, del lado del servidor:
 *
 * · **La flecha** — hacia dónde viene cada uno según sus últimos tres partidos.
 *   Sale de resultados que son públicos, así que la ve todo el club.
 * · **Los invitados** — juegan y suman en el ranking, pero solo los ve un
 *   administrador. Se filtran antes de mandar la lista y no en la pantalla: si
 *   no salen de la base, no hay manera de verlos.
 */

const { consultar } = require('../db');
const { ok, error, conSesion } = require('../http');
const { comoVienenTodos, temporadaActiva, SIN_JUGAR } = require('../handicap');

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

  const temporada = await temporadaActiva();
  if (!temporada) return ok(res, { temporada: null, ranking: [] });

  const [filas, como] = await Promise.all([
    consultar(
      `select jugador_id, nombre, apodo, handicap, categoria,
              practicas::int, chukkers::int, puntos::float8 as puntos, mvps::int
       from v_participacion
       where temporada_id = $1
       order by practicas desc, puntos desc, mvps desc, apodo`,
      [temporada.id],
    ),
    comoVienenTodos(temporada.id),
  ]);

  const ranking = filas
    .filter((j) => sesion.admin || j.categoria !== 'invitado')
    .map((j) => ({ ...j, flecha: (como.get(j.jugador_id) || SIN_JUGAR).flecha }));

  ok(res, { temporada, ranking });
});
