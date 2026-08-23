/** Quién está entrando. Lo primero que consulta la app al abrirse. */

const { unaFila } = require('../db');
const { ok, error, conSesion } = require('../http');

module.exports = conSesion(async (req, res, sesion) => {
  const jugador = await unaFila(
    'select id, nombre, apodo, es_admin, activo from jugador where id = $1',
    [sesion.id],
  );
  if (!jugador || !jugador.activo) return error(res, 401, 'Entrá de nuevo.');

  const temporada = await unaFila(
    'select id, nombre from temporada where activa limit 1',
  );

  ok(res, {
    jugador: {
      id: jugador.id, nombre: jugador.nombre, apodo: jugador.apodo, admin: !!jugador.es_admin,
    },
    temporada,
  });
});
