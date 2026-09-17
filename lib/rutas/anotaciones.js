/**
 * Anotarse para jugar.
 *
 *   GET  /api/anotaciones     la convocatoria vigente y quiénes se anotaron
 *   POST /api/anotaciones     { accion: ... }
 *
 * La convocatoria es el día de juego antes de que exista ninguna planilla: el
 * admin publica "viernes 19, 20 hs" y el club se anota. De esa lista salen
 * después una o varias prácticas, que se arman en la solapa Armar.
 *
 * El orden de llegada lo guarda la base en `creada_en`, y es el que manda
 * cuando sobra gente: el último que se anotó es el primero que queda afuera.
 * Por eso nunca se reordena la lista del lado del servidor.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const { temporadaActiva, comoVienenTodos, hcpEfectivo } = require('../handicap');
const { ANOTACION } = require('../version');

/** Hoy en el huso del club: a las 21 de Buenos Aires en UTC ya es otro día. */
function hoyEnArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * La convocatoria que está en juego: la del día más cercano de hoy en
 * adelante. Las pasadas no se muestran —ya se jugaron— pero quedan guardadas
 * con su lista, que es lo que después permite saber quién se anotó y no jugó.
 */
async function vigente() {
  return unaFila(
    `select c.id, to_char(c.fecha, 'YYYY-MM-DD') as fecha,
            to_char(c.hora, 'HH24:MI') as hora, c.notas,
            (c.cerrada_en is not null) as cerrada
       from convocatoria c
      where c.fecha >= $1::date
      order by c.fecha
      limit 1`,
    [hoyEnArgentina()],
  );
}

/**
 * Los anotados, en orden de llegada. El handicap sale solo hacia un
 * administrador: el interno del club no es público, y en esta pantalla lo ve
 * todo el que entra.
 */
async function anotadosDe(convocatoriaId, esAdmin) {
  const filas = await consultar(
    `select a.jugador_id, a.a_mano,
            to_char(a.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as cuando,
            j.apodo, j.nombre, j.hcp_interno
       from anotacion a
       join jugador j on j.id = a.jugador_id
      where a.convocatoria_id = $1
      order by a.creada_en, j.apodo`,
    [convocatoriaId],
  );

  if (!esAdmin) {
    return filas.map((f) => ({
      jugadorId: f.jugador_id, apodo: f.apodo, cuando: f.cuando, aMano: f.a_mano,
    }));
  }

  const temporada = await temporadaActiva();
  const como = temporada ? await comoVienenTodos(temporada.id) : new Map();
  return filas.map((f) => ({
    jugadorId: f.jugador_id,
    apodo: f.apodo,
    nombre: f.nombre,
    cuando: f.cuando,
    aMano: f.a_mano,
    handicap: hcpEfectivo(f.hcp_interno, como.get(f.jugador_id)),
  }));
}

/**
 * Los anotados de un día, listos para armar: en orden de llegada y con el
 * handicap con el que se arman los equipos. Lo usa la solapa Armar, que es la
 * que después decide quiénes de esos juegan.
 *
 * Devuelve `null` si ese día no tiene convocatoria: ahí Armar sigue andando
 * como siempre, con el plantel entero.
 */
async function anotadosParaArmar(fecha) {
  const convocatoria = await unaFila(
    `select id, to_char(fecha, 'YYYY-MM-DD') as fecha, to_char(hora, 'HH24:MI') as hora,
            (cerrada_en is not null) as cerrada
       from convocatoria where fecha = $1::date`,
    [fecha],
  );
  if (!convocatoria) return null;

  const filas = await consultar(
    `select a.jugador_id, a.a_mano,
            to_char(a.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as cuando,
            j.apodo, j.nombre, j.hcp_interno
       from anotacion a
       join jugador j on j.id = a.jugador_id
      where a.convocatoria_id = $1 and j.activo
      order by a.creada_en, j.apodo`,
    [convocatoria.id],
  );

  const temporada = await temporadaActiva();
  const como = temporada ? await comoVienenTodos(temporada.id) : new Map();

  return {
    convocatoria,
    // `id` y no `jugadorId`: es lo que espera el motor de armado.
    anotados: filas.map((f) => ({
      id: f.jugador_id,
      apodo: f.apodo,
      nombre: f.nombre,
      cuando: f.cuando,
      aMano: f.a_mano,
      handicap: hcpEfectivo(f.hcp_interno, como.get(f.jugador_id)),
    })),
  };
}

async function mirar(res, sesion) {
  const convocatoria = await vigente();
  if (!convocatoria) return ok(res, { convocatoria: null, anotados: [] });

  const anotados = await anotadosDe(convocatoria.id, !!sesion.admin);
  const puesto = anotados.findIndex((a) => a.jugadorId === sesion.id);
  ok(res, {
    convocatoria,
    anotados,
    yo: {
      anotado: puesto >= 0,
      puesto: puesto >= 0 ? puesto + 1 : null,
      cuando: puesto >= 0 ? anotados[puesto].cuando : null,
    },
  });
}

/* ---------------------------------------------------------------- acciones */

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const esHora = (v) => /^\d{2}:\d{2}$/.test(String(v || ''));

async function abrir(res, datos, sesion) {
  if (!esFecha(datos.fecha)) return error(res, 400, 'Poné la fecha del día de juego.');
  if (!esHora(datos.hora)) return error(res, 400, 'Poné la hora.');
  if (datos.fecha < hoyEnArgentina()) {
    return error(res, 400, 'Esa fecha ya pasó.');
  }

  const temporada = await temporadaActiva();
  if (!temporada) {
    return error(res, 409, 'No hay temporada activa. Corré db/seed-temporada.sql en Supabase.');
  }

  const ya = await unaFila('select id from convocatoria where fecha = $1::date', [datos.fecha]);
  if (ya) return error(res, 409, 'Ya hay una convocatoria abierta para ese día.');

  const notas = String(datos.notas || '').trim().slice(0, 400);
  await consultar(
    `insert into convocatoria (temporada_id, fecha, hora, notas, creada_por)
     values ($1, $2::date, $3::time, nullif($4, ''), $5)`,
    [temporada.id, datos.fecha, datos.hora, notas, sesion.id],
  );
  return mirar(res, sesion);
}

/**
 * Anotar a alguien. Cada uno se anota solo; un administrador puede sumar a
 * cualquiera —el que no llegó a anotarse, un invitado— y eso queda marcado
 * con `a_mano` para que en la lista se vea que no se anotó por su cuenta.
 */
async function anotar(res, convocatoria, quien, sesion) {
  if (convocatoria.cerrada) {
    return error(res, 409, 'La lista ya está cerrada.');
  }
  const jugador = await unaFila('select id, activo from jugador where id = $1', [quien]);
  if (!jugador || !jugador.activo) return error(res, 404, 'Ese jugador no está en el plantel.');

  await consultar(
    `insert into anotacion (convocatoria_id, jugador_id, a_mano)
     values ($1, $2, $3)
     on conflict (convocatoria_id, jugador_id) do nothing`,
    [convocatoria.id, quien, quien !== sesion.id],
  );
  return mirar(res, sesion);
}

async function sacar(res, convocatoria, quien, sesion) {
  await consultar(
    'delete from anotacion where convocatoria_id = $1 and jugador_id = $2',
    [convocatoria.id, quien],
  );
  return mirar(res, sesion);
}

module.exports = conSesion(async (req, res, sesion) => {
  // Apagada en esta copia: la pantalla ni la muestra, pero la dirección existe
  // igual y tiene que decir que no, no abrir una lista por la puerta de atrás.
  if (!ANOTACION) {
    return error(res, 404, 'La solapa Anotación no está prendida en esta app.');
  }
  if (req.method === 'GET') return mirar(res, sesion);
  if (req.method !== 'POST') return error(res, 405, 'Método no permitido.');

  const datos = cuerpo(req);
  const accion = String(datos.accion || '');

  if (accion === 'abrir') {
    if (!sesion.admin) return error(res, 403, 'Abrir la convocatoria es solo para administradores.');
    return abrir(res, datos, sesion);
  }

  const convocatoria = await vigente();
  if (!convocatoria) return error(res, 409, 'No hay ninguna convocatoria abierta.');

  // Quién se anota o se baja. Sin `jugadorId` es uno mismo; con otro id hace
  // falta ser administrador, que es lo que permite sumar al que no se anotó.
  const quien = datos.jugadorId ? String(datos.jugadorId) : sesion.id;
  if (quien !== sesion.id && !sesion.admin) {
    return error(res, 403, 'Solo un administrador puede anotar a otro.');
  }

  if (accion === 'juego') return anotar(res, convocatoria, quien, sesion);
  if (accion === 'me-bajo') return sacar(res, convocatoria, quien, sesion);

  if (accion === 'cerrar' || accion === 'reabrir') {
    if (!sesion.admin) return error(res, 403, 'Esto es solo para administradores.');
    await consultar(
      'update convocatoria set cerrada_en = $2 where id = $1',
      [convocatoria.id, accion === 'cerrar' ? new Date().toISOString() : null],
    );
    return mirar(res, sesion);
  }

  if (accion === 'borrar') {
    if (!sesion.admin) return error(res, 403, 'Esto es solo para administradores.');
    // Se lleva las anotaciones con ella (on delete cascade). Las prácticas que
    // hayan salido de esta convocatoria no se tocan: quedan con el vínculo en
    // null, que es lo que dice el `on delete set null`.
    await consultar('delete from convocatoria where id = $1', [convocatoria.id]);
    return mirar(res, sesion);
  }

  return error(res, 400, 'No entiendo qué querés hacer.');
});

// Para la solapa Armar, que necesita la misma lista pero del lado del servidor.
module.exports.anotadosParaArmar = anotadosParaArmar;
