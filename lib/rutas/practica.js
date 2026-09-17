/**
 * Una práctica con su planilla.
 *
 *   GET    /api/practica?id=…    la lee cualquiera del club
 *   PUT    /api/practica?id=…    la corrige un administrador
 *   DELETE /api/practica?id=…    la borra un administrador
 *
 * La planilla es pública puertas adentro. El handicap interno no viaja: se usa
 * para armar, no para mostrar.
 *
 * `PUT` con `guardar: false` no escribe nada: devuelve cómo quedaría la
 * planilla y el balance de lo que se conserva y lo que se pierde. Es lo que la
 * pantalla muestra antes de preguntar si guarda.
 */

const { consultar, unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const {
  desdeGuardado, paraPantalla, enfrentamientos, esCantidadValida, ErrorDeArmado,
} = require('../polo');
const {
  cambioDeFormatoValido, planillaEditada, chukkersPorJugador,
  balanceDeLaEdicion, balanceEnPalabras,
} = require('../edicion');
const { validarCabecera, traerJugadores, COLORES_VALIDOS } = require('./practicas');

const idDe = (req) => new URL(req.url, 'http://app').searchParams.get('id');
const esId = (id) => /^[0-9a-f-]{36}$/i.test(String(id || ''));

/**
 * Borrar se lleva puesta la planilla y, con ella, los caballos que cada uno
 * había cargado para esa práctica. Por eso primero contamos qué se pierde: la
 * pantalla lo avisa antes de preguntar si está seguro.
 */
async function borrar(req, res, id) {
  const practica = await unaFila(
    `select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, p.cancha,
            (select count(*) from jornada j where j.practica_id = p.id) as jornadas
     from practica p where p.id = $1`,
    [id],
  );
  if (!practica) return error(res, 404, 'Esa práctica no existe.');

  // La planilla, los resultados y las jornadas de caballos se van solos: la
  // base los tiene declarados `on delete cascade`.
  await consultar('delete from practica where id = $1', [id]);

  ok(res, { borrada: practica.id, jornadas: Number(practica.jornadas) });
}

/* --------------------------------------------------------------- editar */

/**
 * Lo que hay guardado hoy de esa práctica: la cabecera, quién jugó y qué
 * caballos tiene cargado cada uno. Es contra esto que se compara lo que se
 * está por guardar.
 */
async function comoEsta(id) {
  const practica = await unaFila(
    `select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, to_char(p.hora, 'HH24:MI') as hora,
            p.cancha, p.formato, p.chukkers, p.tipo, p.notas, p.mvp_id, p.temporada_id
     from practica p where p.id = $1`,
    [id],
  );
  if (!practica) return null;

  const jugadores = await consultar(
    `select pj.jugador_id as id, pj.equipo as color, pj.orden, j.apodo, j.nombre
     from practica_jugador pj
     join jugador j on j.id = pj.jugador_id
     where pj.practica_id = $1
     order by pj.equipo, pj.orden`,
    [id],
  );

  // Las jornadas con sus lugares en una sola consulta: son a lo sumo doce
  // renglones por práctica, no hace falta pedirlas una por una.
  const jornadas = await consultar(
    `select jo.id as "jornadaId", jo.jugador_id as "jugadorId", j.apodo,
            coalesce(
              (select json_agg(json_build_object('chukker', jc.chukker, 'mitad', jc.mitad)
                        order by jc.chukker, jc.mitad)
                 from jornada_chukker jc where jc.jornada_id = jo.id),
              '[]'::json) as lugares
     from jornada jo
     join jugador j on j.id = jo.jugador_id
     where jo.practica_id = $1`,
    [id],
  );

  const mvp = practica.mvp_id
    ? await unaFila('select id, apodo from jugador where id = $1', [practica.mvp_id])
    : null;

  return { practica, jugadores, jornadas, mvp };
}

async function editar(req, res, sesion, id) {
  const actual = await comoEsta(id);
  if (!actual) return error(res, 404, 'Esa práctica no existe.');
  if (actual.practica.tipo !== 'practica') {
    return error(res, 400, 'Esto no es una práctica del club.');
  }

  const datos = cuerpo(req);
  const mal = validarCabecera(datos);
  if (mal) return error(res, 400, mal);

  const formato = Number(datos.formato);
  const cambio = cambioDeFormatoValido(actual.practica.formato, formato);
  if (cambio) return error(res, 409, cambio);

  const elegidos = Array.isArray(datos.jugadores) ? datos.jugadores : [];
  if (elegidos.length !== formato) {
    return error(res, 400, `Quedaron ${elegidos.length} jugadores y la práctica es de ${formato}.`);
  }
  if (new Set(elegidos.map((e) => e && e.id)).size !== elegidos.length) {
    return error(res, 400, 'Hay un jugador puesto dos veces.');
  }
  if (elegidos.some((e) => !e || !COLORES_VALIDOS.includes(e.color))) {
    return error(res, 400, 'Alguno de los jugadores no tiene color.');
  }

  const delPlantel = await traerJugadores(
    elegidos.map((e) => e.id),
    new Set(actual.jugadores.map((j) => j.id)),
  );
  const planilla = planillaEditada(formato, elegidos, delPlantel);

  const balance = balanceDeLaEdicion({
    antes: {
      formato: actual.practica.formato,
      chukkers: actual.practica.chukkers,
      jugadores: actual.jugadores,
    },
    planilla,
    jornadas: actual.jornadas,
    mvp: actual.mvp,
  });
  balance.enPalabras = balanceEnPalabras(balance);

  const notas = String(datos.notas === undefined ? (actual.practica.notas || '') : datos.notas)
    .trim().slice(0, 600);

  const cabecera = {
    fecha: datos.fecha, hora: datos.hora, cancha: Number(datos.cancha),
    formato, chukkers: planilla.chukkers, notas,
  };

  if (datos.guardar === false) {
    return ok(res, { vistaPrevia: true, planilla: paraPantalla(planilla), balance, cabecera });
  }

  /* ---- guardar. El orden importa:
     1) la cabecera primero, porque el disparador que valida el bicolor y el
        colorado lee `practica.formato`;
     2) los jugadores, borrando y reescribiendo — la clave es (práctica, equipo,
        orden) y con un simple update se pisarían entre ellos;
     3) los caballos: se van los del que sale y los de los lugares que ese
        jugador ya no juega. */

  const juegaAhora = chukkersPorJugador(planilla);
  const quedan = planilla.jugadores.map((j) => j.id);

  await transaccion(async (tx) => {
    await tx.consultar(
      `update practica
          set fecha = $2::date, hora = $3::time, cancha = $4, formato = $5, chukkers = $6,
              notas = nullif($7, ''),
              mvp_id = case when mvp_id = any($8::uuid[]) then mvp_id else null end
        where id = $1`,
      [id, cabecera.fecha, cabecera.hora, cabecera.cancha, formato, planilla.chukkers,
        notas, quedan],
    );

    await tx.consultar('delete from practica_jugador where practica_id = $1', [id]);
    for (const j of planilla.jugadores) {
      await tx.consultar(
        `insert into practica_jugador (practica_id, jugador_id, equipo, orden, sale, juega_de)
         values ($1, $2, $3, $4, $5::smallint[], $6::jsonb)`,
        [id, j.id, j.color, j.orden, j.sale, j.juegaDe ? JSON.stringify(j.juegaDe) : null],
      );
    }

    // El que ya no está en la planilla no tiene jornada de esa práctica.
    await tx.consultar(
      'delete from jornada where practica_id = $1 and not (jugador_id = any($2::uuid[]))',
      [id, quedan],
    );
    // La fecha de la jornada acompaña a la de la práctica: es la que ordena el
    // calendario de caballos.
    await tx.consultar(
      'update jornada set fecha = $2::date, chukkers = $3, actualizada_en = now() where practica_id = $1',
      [id, cabecera.fecha, planilla.chukkers],
    );
    // Y de cada jornada que queda, se caen los lugares que ese jugador ya no
    // juega: los del chukker que dejó de existir y los del que pasó a descansar.
    for (const jor of actual.jornadas) {
      if (!juegaAhora.has(jor.jugadorId)) continue;
      const mios = [...juegaAhora.get(jor.jugadorId)];
      await tx.consultar(
        'delete from jornada_chukker where jornada_id = $1 and not (chukker = any($2::smallint[]))',
        [jor.jornadaId, mios],
      );
    }
    // Un puntaje sin ningún chukker cargado ya no dice nada de ese día.
    await tx.consultar(
      `delete from jornada_puntaje jp
        using jornada jo
        where jo.id = jp.jornada_id and jo.practica_id = $1
          and not exists (select 1 from jornada_chukker jc
                           where jc.jornada_id = jp.jornada_id and jc.caballo_id = jp.caballo_id)`,
      [id],
    );
  });

  ok(res, { guardada: true, balance });
}

/* --------------------------------------------------------------- ruteo */

module.exports = conSesion(async (req, res, sesion) => {
  const id = idDe(req);
  if (!esId(id)) return error(res, 400, 'Falta la práctica.');

  if (req.method === 'DELETE') {
    if (!sesion.admin) return error(res, 403, 'Borrar prácticas es solo para administradores.');
    return borrar(req, res, id);
  }
  if (req.method === 'PUT') {
    if (!sesion.admin) return error(res, 403, 'Editar prácticas es solo para administradores.');
    if (!esCantidadValida(cuerpo(req).formato)) {
      return error(res, 400, 'Las prácticas son de 8, 9, 10 o 12 jugadores.');
    }
    try {
      return await editar(req, res, sesion, id);
    } catch (e) {
      if (e instanceof ErrorDeArmado) return error(res, 400, e.message);
      throw e;
    }
  }
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

  const practica = await unaFila(
    `select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, to_char(p.hora, 'HH24:MI') as hora,
            p.cancha, p.formato, p.chukkers, p.estado, p.tipo, p.notas, p.mvp_id,
            t.nombre as temporada,
            -- Cuántos ya cargaron sus caballos: es lo que se perdería al borrar.
            (select count(*) from jornada j where j.practica_id = p.id)::int as jornadas
     from practica p join temporada t on t.id = p.temporada_id
     where p.id = $1`,
    [id],
  );
  if (!practica) return error(res, 404, 'Esa práctica no existe.');

  // El handicap interno solo viaja para un administrador: es con lo que se
  // balancea, y el resto del club no tiene por qué verlo. Sin él la planilla
  // se muestra igual, nada más que sin la suma por equipo.
  const filas = await consultar(
    `select pj.jugador_id, pj.equipo, pj.orden, pj.sale, pj.juega_de,
            j.nombre, j.apodo,
            ${sesion.admin ? 'j.hcp_interno' : 'null::smallint as hcp_interno'}
     from practica_jugador pj
     join jugador j on j.id = pj.jugador_id
     where pj.practica_id = $1`,
    [id],
  );

  // Los enfrentamientos con su resultado, si ya se cargó. Vienen aunque estén
  // vacíos: son los renglones del formulario.
  let partidos = await consultar(
    `select orden, equipo_a as "equipoA", equipo_b as "equipoB",
            goles_a as "golesA", goles_b as "golesB"
     from practica_partido where practica_id = $1 order by orden`,
    [id],
  );
  // Una práctica armada antes de que existieran los resultados todavía no los
  // tiene guardados: se muestran los que le corresponden por formato.
  if (!partidos.length) {
    partidos = enfrentamientos(practica.formato)
      .map((e) => ({ orden: e.orden, equipoA: e.equipoA, equipoB: e.equipoB, golesA: null, golesB: null }));
  }

  const mvp = practica.mvp_id
    ? await unaFila('select id, nombre, apodo from jugador where id = $1', [practica.mvp_id])
    : null;

  ok(res, {
    practica,
    partidos,
    mvp,
    planilla: paraPantalla(desdeGuardado(practica.formato, filas)),
  });
});
