/**
 * El ranking de la temporada.
 *
 *   GET /api/ranking
 *
 * Prácticas jugadas, puntos y MVP. Lo ve todo el club: es el que se mira en el
 * grupo. La cuenta de los puntos vive en la vista `v_participacion` de la base
 * —3 el partido ganado, 1 el empatado, la mitad en las de 12—, así que sale
 * igual desde cualquier lado.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion } = require('../http');

module.exports = conSesion(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

  const temporada = await unaFila('select id, nombre from temporada where activa limit 1');
  if (!temporada) return ok(res, { temporada: null, ranking: [] });

  const ranking = await consultar(
    `select jugador_id, nombre, apodo, handicap, categoria,
            practicas::int, chukkers::int, puntos::float8 as puntos, mvps::int
     from v_participacion
     where temporada_id = $1
     order by practicas desc, puntos desc, mvps desc, apodo`,
    [temporada.id],
  );

  ok(res, { temporada, ranking });
});
