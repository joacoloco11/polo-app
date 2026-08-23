/**
 * La caballada de cada uno.
 *
 *   GET  /api/caballos      los míos
 *   POST /api/caballos      { nombre }         lo sumo
 *                           { id, activo }     lo saco (o lo devuelvo)
 *                           { id, lesionado }  lo marco lesionado (o le doy el alta)
 *
 * Los caballos son de quien los monta: nadie ve los de otro. Un caballo no se
 * borra nunca —se apaga— porque su nombre está pegado a los chukkers que ya
 * jugó y borrarlo se llevaría puesta la historia.
 *
 * Lesionado y apagado son cosas distintas: el lesionado sigue en la caballada,
 * marcado, para que se vea de un vistazo por qué no está jugando.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const COLUMNAS = `id, nombre, activo, lesionado,
                  to_char(lesionado_desde, 'YYYY-MM-DD') as lesionado_desde`;

async function listar(res, sesion) {
  const caballos = await consultar(
    `select ${COLUMNAS} from caballo
     where jugador_id = $1
     order by activo desc, nombre`,
    [sesion.id],
  );
  ok(res, { caballos });
}

async function guardar(req, res, sesion) {
  const datos = cuerpo(req);

  if (datos.id) {
    // Se toca solo lo que vino: marcar una lesión no apaga el caballo, y
    // apagarlo no le borra la lesión.
    const caballo = await unaFila(
      `update caballo set
         activo    = coalesce($3, activo),
         lesionado = coalesce($4, lesionado),
         -- La fecha se pone sola al marcarlo y se limpia al darle el alta.
         lesionado_desde = case
           when $4 is null then lesionado_desde
           when $4 and not lesionado then current_date
           when not $4 then null
           else lesionado_desde
         end
       where id = $1 and jugador_id = $2
       returning ${COLUMNAS}`,
      [
        datos.id, sesion.id,
        datos.activo === undefined ? null : datos.activo !== false,
        datos.lesionado === undefined ? null : !!datos.lesionado,
      ],
    );
    if (!caballo) return error(res, 404, 'Ese caballo no es tuyo.');
    return ok(res, { caballo });
  }

  const nombre = String(datos.nombre || '').trim().slice(0, 60);
  if (nombre.length < 2) return error(res, 400, 'Poné el nombre del caballo.');

  // Si ya lo tenía apagado, lo enciende en lugar de fallar por repetido.
  const caballo = await unaFila(
    `insert into caballo (jugador_id, nombre) values ($1, $2)
     on conflict (jugador_id, nombre) do update set activo = true
     returning ${COLUMNAS}`,
    [sesion.id, nombre],
  );
  ok(res, { caballo });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res, sesion);
  if (req.method === 'POST') return guardar(req, res, sesion);
  return error(res, 405, 'Método no permitido.');
});
