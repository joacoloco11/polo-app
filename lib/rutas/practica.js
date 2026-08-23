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
const { desdeGuardado, paraPantalla } = require('../polo');

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

  const resultados = await consultar(
    'select equipo, goles from practica_resultado where practica_id = $1',
    [id],
  );

  ok(res, {
    practica,
    resultados,
    planilla: paraPantalla(desdeGuardado(practica.formato, filas)),
  });
});
