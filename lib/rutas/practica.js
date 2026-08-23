/**
 * Una práctica con su planilla.
 *
 *   GET    /api/practica?id=…    la lee cualquiera del club
 *   DELETE /api/practica?id=…    la borra un administrador
 *
 * La planilla es pública puertas adentro. El handicap interno no viaja: se usa
 * para armar, no para mostrar.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion } = require('../http');
const { desdeGuardado, paraPantalla, enfrentamientos } = require('../polo');

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

module.exports = conSesion(async (req, res, sesion) => {
  const id = idDe(req);
  if (!esId(id)) return error(res, 400, 'Falta la práctica.');

  if (req.method === 'DELETE') {
    if (!sesion.admin) return error(res, 403, 'Borrar prácticas es solo para administradores.');
    return borrar(req, res, id);
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
