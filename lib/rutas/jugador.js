/**
 * La ficha de un jugador.
 *
 *   GET /api/jugador?id=…
 *
 * Devuelve sus prácticas con los equipos completos: con eso la pantalla arma
 * lo mismo que mostraba la v1 —compañero más frecuente, con quién compartió
 * más cancha, en qué canchas jugó, el historial— sin veinte consultas.
 *
 * El handicap que viaja es el de la AAP, que es público. El interno del club
 * no sale de acá.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion } = require('../http');
const { hcpDeLaPractica } = require('../polo');

module.exports = conSesion(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'Método no permitido.');

  const id = new URL(req.url, 'http://app').searchParams.get('id');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return error(res, 400, 'Falta el jugador.');

  const jugador = await unaFila(
    `select id, nombre, apodo, handicap, categoria, activo,
            (select apodo from jugador q where q.id = j.invitado_por) as invitado_por
     from jugador j where j.id = $1`,
    [id],
  );
  if (!jugador) return error(res, 404, 'Ese jugador no está en el plantel.');

  const temporada = await unaFila('select id, nombre from temporada where activa limit 1');
  if (!temporada) return ok(res, { jugador, temporada: null, practicas: [], resumen: null });

  // Todas las prácticas de la temporada donde figura, con sus compañeros y
  // rivales. Una sola consulta: cada fila es un jugador de una de esas prácticas.
  const filas = await consultar(
    `select p.id as practica_id, to_char(p.fecha, 'YYYY-MM-DD') as fecha,
            to_char(p.hora, 'HH24:MI') as hora, p.cancha, p.formato, p.estado, p.mvp_id,
            pj.jugador_id, pj.equipo, pj.orden,
            j.apodo, j.handicap
     from practica p
     join practica_jugador pj on pj.practica_id = p.id
     join jugador j on j.id = pj.jugador_id
     where p.temporada_id = $1
       and p.id in (select practica_id from practica_jugador where jugador_id = $2)
     order by p.fecha desc, p.hora desc, pj.equipo, pj.orden`,
    [temporada.id, id],
  );

  const partidos = await consultar(
    `select pp.practica_id, pp.orden, pp.equipo_a as "equipoA", pp.equipo_b as "equipoB",
            pp.goles_a as "golesA", pp.goles_b as "golesB"
     from practica_partido pp
     where pp.practica_id in (select practica_id from practica_jugador where jugador_id = $1)
     order by pp.orden`,
    [id],
  );

  const porPractica = new Map();
  filas.forEach((f) => {
    if (!porPractica.has(f.practica_id)) {
      porPractica.set(f.practica_id, {
        id: f.practica_id,
        fecha: f.fecha,
        hora: f.hora,
        cancha: f.cancha,
        formato: f.formato,
        estado: f.estado,
        mvpId: f.mvp_id,
        equipos: {},
        miEquipo: null,
        partidos: [],
      });
    }
    const practica = porPractica.get(f.practica_id);
    if (!practica.equipos[f.equipo]) practica.equipos[f.equipo] = [];
    practica.equipos[f.equipo].push({
      id: f.jugador_id, apodo: f.apodo, handicap: f.handicap,
    });
    if (f.jugador_id === id) practica.miEquipo = f.equipo;
  });

  partidos.forEach((p) => {
    const practica = porPractica.get(p.practica_id);
    if (practica) practica.partidos.push(p);
  });

  const practicas = [...porPractica.values()].map((p) => ({
    ...p,
    hcpPractica: hcpDeLaPractica(p.equipos),
  }));

  // Los totales salen de la misma vista que el ranking, así no hay dos cuentas.
  const resumen = await unaFila(
    `select practicas::int, chukkers::int, puntos::float8 as puntos, mvps::int
     from v_participacion where temporada_id = $1 and jugador_id = $2`,
    [temporada.id, id],
  );

  ok(res, {
    jugador,
    temporada,
    practicas,
    resumen: resumen || { practicas: 0, chukkers: 0, puntos: 0, mvps: 0 },
  });
});
