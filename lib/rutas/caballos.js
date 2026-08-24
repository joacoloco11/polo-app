/**
 * La caballada de cada uno.
 *
 *   GET  /api/caballos      los míos, con los períodos en que estuvieron lesionados
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
 *
 * **Cada lesión es un período.** Al marcarlo se abre uno; al darle el alta se
 * cierra con la fecha del día. Así el calendario puede pintar los tramos viejos
 * y no solo el actual. Las columnas `lesionado` y `lesionado_desde` del caballo
 * son el estado de hoy, que sale del período abierto.
 */

const { consultar, unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const COLUMNAS = `id, nombre, activo, lesionado,
                  to_char(lesionado_desde, 'YYYY-MM-DD') as lesionado_desde`;

/** Los períodos de lesión de una caballada, del más viejo al más nuevo. */
async function lesionesDe(jugadorId) {
  return consultar(
    `select l.caballo_id, to_char(l.desde, 'YYYY-MM-DD') as desde,
            to_char(l.hasta, 'YYYY-MM-DD') as hasta
     from lesion l
     join caballo c on c.id = l.caballo_id
     where c.jugador_id = $1
     order by l.desde`,
    [jugadorId],
  );
}

async function listar(res, sesion) {
  const [caballos, lesiones] = await Promise.all([
    consultar(
      `select ${COLUMNAS} from caballo
       where jugador_id = $1
       order by activo desc, nombre`,
      [sesion.id],
    ),
    lesionesDe(sesion.id),
  ]);
  ok(res, { caballos, lesiones });
}

/**
 * Marcar o desmarcar la lesión. Es un botón que se aprieta y se destilda: al
 * apretarlo se abre el período, al destildarlo se cierra hoy.
 */
async function cambiarLesion(caballoId, lesionado) {
  await transaccion(async (tx) => {
    const abierta = await tx.unaFila(
      `select id, desde = current_date as desde_hoy
       from lesion where caballo_id = $1 and hasta is null`,
      [caballoId],
    );

    if (lesionado && !abierta) {
      await tx.consultar(
        'insert into lesion (caballo_id, desde) values ($1, current_date)',
        [caballoId],
      );
    }
    if (!lesionado && abierta) {
      // Marcar y destildar el mismo día es un toque en falso: se borra el
      // período en vez de dejarle al calendario una marca roja que no existió.
      if (abierta.desde_hoy) {
        await tx.consultar('delete from lesion where id = $1', [abierta.id]);
      } else {
        await tx.consultar('update lesion set hasta = current_date where id = $1', [abierta.id]);
      }
    }

    await tx.consultar(
      `update caballo set
         lesionado = $2,
         lesionado_desde = case when $2 then coalesce(lesionado_desde, current_date) else null end
       where id = $1`,
      [caballoId, lesionado],
    );
  });
}

async function guardar(req, res, sesion) {
  const datos = cuerpo(req);

  if (datos.id) {
    const mio = await unaFila(
      'select id from caballo where id = $1 and jugador_id = $2',
      [datos.id, sesion.id],
    );
    if (!mio) return error(res, 404, 'Ese caballo no es tuyo.');

    if (datos.lesionado !== undefined) {
      await cambiarLesion(datos.id, !!datos.lesionado);
    }
    if (datos.activo !== undefined) {
      // Apagar un caballo no le toca la lesión, y al revés tampoco.
      await consultar('update caballo set activo = $2 where id = $1', [datos.id, datos.activo !== false]);
    }

    const caballo = await unaFila(`select ${COLUMNAS} from caballo where id = $1`, [datos.id]);
    return ok(res, { caballo, lesiones: await lesionesDe(sesion.id) });
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
