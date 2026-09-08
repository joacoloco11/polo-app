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

/**
 * Los chukkers que la caballada jugó afuera, del más nuevo al más viejo.
 *
 * Si la tabla todavía no existe —el código subió antes que el SQL— devuelve
 * vacío en vez de tirar abajo la pantalla. 42P01 es "esa tabla no existe".
 */
async function extrasDe(jugadorId) {
  return consultar(
    `select e.id, e.caballo_id, to_char(e.fecha, 'YYYY-MM-DD') as fecha,
            e.chukkers::float8 as chukkers, e.jinete
     from chukker_extra e
     join caballo c on c.id = e.caballo_id
     where c.jugador_id = $1
     order by e.fecha desc, e.creado_en desc`,
    [jugadorId],
  ).catch((e) => {
    if (e && e.code === '42P01') return [];
    throw e;
  });
}

async function listar(res, sesion) {
  const [caballos, lesiones, extras] = await Promise.all([
    consultar(
      `select ${COLUMNAS} from caballo
       where jugador_id = $1
       order by activo desc, nombre`,
      [sesion.id],
    ),
    lesionesDe(sesion.id),
    extrasDe(sesion.id),
  ]);
  ok(res, { caballos, lesiones, extras });
}

/**
 * Sumar chukkers jugados fuera de la práctica del club.
 *
 * No cuelga de ninguna jornada: lleva su propia fecha, porque el día puede no
 * tener práctica ninguna. El caballo tiene que ser del que lo carga.
 */
async function sumarExtra(datos, res, sesion) {
  const mio = await unaFila(
    'select id, nombre from caballo where id = $1 and jugador_id = $2',
    [datos.caballo_id, sesion.id],
  );
  if (!mio) return error(res, 404, 'Ese caballo no es tuyo.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return error(res, 400, 'Falta la fecha.');
  }

  // Medio chukker es medio, así que decimales sí; pero 0,3 no existe.
  const chukkers = Number(datos.chukkers);
  if (!Number.isFinite(chukkers) || chukkers <= 0 || chukkers > 12) {
    return error(res, 400, 'Los chukkers van de 0,5 a 12.');
  }
  if (Math.round(chukkers * 2) !== chukkers * 2) {
    return error(res, 400, 'Los chukkers van de a medio: 1, 1,5, 2…');
  }

  const jinete = String(datos.jinete || '').trim().slice(0, 60) || null;

  let extra;
  try {
    extra = await unaFila(
      `insert into chukker_extra (caballo_id, fecha, chukkers, jinete)
       values ($1, $2, $3, $4)
       returning id, caballo_id, to_char(fecha, 'YYYY-MM-DD') as fecha,
                 chukkers::float8 as chukkers, jinete`,
      [datos.caballo_id, datos.fecha, chukkers, jinete],
    );
  } catch (e) {
    // La tabla llega con el SQL, que se corre aparte del código.
    if (e && e.code === '42P01') {
      return error(res, 503, 'Falta correr db/schema.sql en Supabase: la tabla de '
        + 'chukkers de afuera todavía no existe.');
    }
    throw e;
  }
  return ok(res, { extra });
}

/** Sacar una carga de chukkers de afuera. Solo la propia. */
async function borrarExtra(req, res, sesion) {
  const id = new URL(req.url, 'http://app').searchParams.get('extra');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return error(res, 400, 'Falta qué borrar.');

  const fila = await unaFila(
    `delete from chukker_extra e
      using caballo c
      where e.id = $1 and c.id = e.caballo_id and c.jugador_id = $2
      returning e.id`,
    [id, sesion.id],
  );
  if (!fila) return error(res, 404, 'Esa carga no es tuya.');
  return ok(res, { borrado: fila.id });
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

  if (datos.que === 'extra') return sumarExtra(datos, res, sesion);

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
  if (req.method === 'DELETE') return borrarExtra(req, res, sesion);
  return error(res, 405, 'Método no permitido.');
});
