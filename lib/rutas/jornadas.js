/**
 * Las jornadas de un jugador: sus días de caballos.
 *
 *   GET  /api/jornadas     mis prácticas y mis partidos de torneo, con lo cargado
 *   POST /api/jornadas     { nombre, fecha, chukkers } sumo un partido AAP
 *
 * Las prácticas aparecen solas, porque salen de la planilla que armó el
 * organizador. Los partidos de torneo los carga el jugador, porque el club no
 * los conoce.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const CHUKKERS_TORNEO = 6;      // y se juegan de a medio: 12 lugares
const CUANTAS = 60;             // alcanza para toda una temporada

const rango = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Cuántos lugares hay que llenar: el doble si se juega de a medio chukker. */
const lugaresDe = (chukkers, medios) => chukkers * (medios ? 2 : 1);

async function listar(res, sesion) {
  const [practicas, torneos, caballos] = await Promise.all([
    consultar(
      `select p.id as practica_id, to_char(p.fecha, 'YYYY-MM-DD') as fecha,
              to_char(p.hora, 'HH24:MI') as hora, p.cancha, p.chukkers, p.formato,
              p.estado, pj.equipo, pj.sale,
              j.id as jornada_id, j.observaciones
       from practica_jugador pj
       join practica p on p.id = pj.practica_id
       left join jornada j on j.practica_id = p.id and j.jugador_id = $1
       where pj.jugador_id = $1
       order by p.fecha desc, p.hora desc
       limit ${CUANTAS}`,
      [sesion.id],
    ),
    consultar(
      `select id as jornada_id, nombre, to_char(fecha, 'YYYY-MM-DD') as fecha,
              chukkers, medios, observaciones
       from jornada
       where jugador_id = $1 and practica_id is null
       order by fecha desc
       limit ${CUANTAS}`,
      [sesion.id],
    ),
    consultar(
      `select id, nombre, activo, lesionado, to_char(lesionado_desde, 'YYYY-MM-DD') as lesionado_desde
       from caballo where jugador_id = $1
       order by activo desc, nombre`,
      [sesion.id],
    ),
  ]);

  const eventos = [
    ...practicas.map((p) => {
      const sale = (p.sale || []).map(Number);
      return {
        tipo: 'practica',
        practicaId: p.practica_id,
        jornadaId: p.jornada_id,
        titulo: 'Práctica',
        detalle: 'Cancha ' + p.cancha + ' · ' + p.hora + ' hs',
        fecha: p.fecha,
        chukkers: p.chukkers,
        medios: false,
        misChukkers: rango(p.chukkers).filter((c) => !sale.includes(c)),
        color: p.equipo,
        cerrada: p.estado === 'cerrada',
        observaciones: p.observaciones || '',
        uso: {},
        puntajes: {},
      };
    }),
    ...torneos.map((t) => ({
      tipo: 'aap',
      practicaId: null,
      jornadaId: t.jornada_id,
      titulo: t.nombre,
      detalle: 'Torneo AAP · ' + t.chukkers + ' chukkers'
        + (t.medios ? ' de a medio' : ''),
      fecha: t.fecha,
      chukkers: t.chukkers,
      medios: !!t.medios,
      misChukkers: rango(lugaresDe(t.chukkers, t.medios)),
      color: null,
      cerrada: false,
      observaciones: t.observaciones || '',
      uso: {},
      puntajes: {},
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  // Lo cargado, de una sola consulta para todas las jornadas.
  const ids = eventos.map((e) => e.jornadaId).filter(Boolean);
  if (ids.length) {
    const porJornada = new Map(eventos.filter((e) => e.jornadaId).map((e) => [e.jornadaId, e]));
    const [chukkers, puntajes] = await Promise.all([
      consultar('select jornada_id, chukker, caballo_id from jornada_chukker where jornada_id = any($1::uuid[])', [ids]),
      consultar('select jornada_id, caballo_id, puntaje from jornada_puntaje where jornada_id = any($1::uuid[])', [ids]),
    ]);
    chukkers.forEach((f) => { porJornada.get(f.jornada_id).uso[f.chukker] = f.caballo_id; });
    puntajes.forEach((f) => { porJornada.get(f.jornada_id).puntajes[f.caballo_id] = f.puntaje; });
  }

  ok(res, { eventos, caballos });
}

async function nuevoPartido(req, res, sesion) {
  const datos = cuerpo(req);
  const nombre = String(datos.nombre || '').trim().slice(0, 80);
  if (nombre.length < 3) return error(res, 400, 'Poné el nombre del torneo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return error(res, 400, 'Falta la fecha del partido.');
  }
  const chukkers = Number(datos.chukkers || CHUKKERS_TORNEO);
  if (!Number.isInteger(chukkers) || chukkers < 1 || chukkers > 12) {
    return error(res, 400, 'Los chukkers van de 1 a 12.');
  }
  // En el torneo se juega de a medio chukker salvo que digan lo contrario.
  const medios = datos.medios !== false;

  const jornada = await unaFila(
    `insert into jornada (jugador_id, nombre, fecha, chukkers, medios)
     values ($1, $2, $3, $4, $5)
     returning id, nombre, to_char(fecha, 'YYYY-MM-DD') as fecha, chukkers, medios`,
    [sesion.id, nombre, datos.fecha, chukkers, medios],
  );
  ok(res, { jornada });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res, sesion);
  if (req.method === 'POST') return nuevoPartido(req, res, sesion);
  return error(res, 405, 'Método no permitido.');
});
