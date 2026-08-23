/**
 * El resultado de una práctica y su MVP.
 *
 *   POST /api/resultado
 *     { practicaId, partidos: [{ orden, golesA, golesB }], mvpId }
 *
 * Lo carga un administrador cuando termina la práctica. Los enfrentamientos ya
 * existen desde que se armó —uno en las de 8, 9 y 10; tres en las de 12—, así
 * que acá solo se completan los goles.
 *
 * Cargar el resultado cierra la práctica. Se puede volver a cargar: corrige.
 */

const { consultar, unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo, soloMetodo } = require('../http');
const { enfrentamientos } = require('../polo');

const esGol = (n) => n === null || n === undefined || n === ''
  || (Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 99);

const aGol = (n) => (n === null || n === undefined || n === '' ? null : Number(n));

module.exports = conSesion(async (req, res, sesion) => {
  if (!soloMetodo(req, res, 'POST')) return;

  const datos = cuerpo(req);
  if (!/^[0-9a-f-]{36}$/i.test(String(datos.practicaId || ''))) {
    return error(res, 400, 'Falta la práctica.');
  }

  const practica = await unaFila(
    'select id, formato, estado from practica where id = $1',
    [datos.practicaId],
  );
  if (!practica) return error(res, 404, 'Esa práctica no existe.');

  let enJuego = await consultar(
    'select orden, equipo_a, equipo_b from practica_partido where practica_id = $1 order by orden',
    [practica.id],
  );

  // Las prácticas armadas antes de que existieran los resultados no tienen
  // enfrentamientos: se los arma acá, que salen del formato.
  if (!enJuego.length) {
    for (const e of enfrentamientos(practica.formato)) {
      await consultar(
        `insert into practica_partido (practica_id, orden, equipo_a, equipo_b)
         values ($1, $2, $3, $4) on conflict do nothing`,
        [practica.id, e.orden, e.equipoA, e.equipoB],
      );
    }
    enJuego = await consultar(
      'select orden, equipo_a, equipo_b from practica_partido where practica_id = $1 order by orden',
      [practica.id],
    );
  }

  const llegaron = Array.isArray(datos.partidos) ? datos.partidos : [];
  const porOrden = new Map(llegaron.map((p) => [Number(p.orden), p]));

  for (const partido of enJuego) {
    const vino = porOrden.get(partido.orden);
    if (!vino) continue;
    if (!esGol(vino.golesA) || !esGol(vino.golesB)) {
      return error(res, 400, 'Los goles son números de 0 a 99.');
    }
    const a = aGol(vino.golesA);
    const b = aGol(vino.golesB);
    if ((a === null) !== (b === null)) {
      return error(res, 400, 'Falta un marcador: van los dos o ninguno.');
    }
  }

  // El MVP tiene que haber jugado la práctica.
  let mvpId = datos.mvpId || null;
  if (mvpId) {
    const jugo = await unaFila(
      'select 1 from practica_jugador where practica_id = $1 and jugador_id = $2',
      [practica.id, mvpId],
    );
    if (!jugo) return error(res, 400, 'El MVP tiene que ser alguno de los que jugaron.');
  }

  const cerrada = enJuego.every((partido) => {
    const vino = porOrden.get(partido.orden);
    return vino && aGol(vino.golesA) !== null;
  });

  await transaccion(async (tx) => {
    for (const partido of enJuego) {
      const vino = porOrden.get(partido.orden);
      if (!vino) continue;
      await tx.consultar(
        'update practica_partido set goles_a = $3, goles_b = $4 where practica_id = $1 and orden = $2',
        [practica.id, partido.orden, aGol(vino.golesA), aGol(vino.golesB)],
      );
    }
    await tx.consultar(
      `update practica set
         mvp_id = $2,
         estado = case when $3 then 'cerrada'::estado_practica else estado end,
         cerrada_en = case when $3 then now() else cerrada_en end
       where id = $1`,
      [practica.id, mvpId, cerrada],
    );
  });

  const partidos = await consultar(
    `select orden, equipo_a as "equipoA", equipo_b as "equipoB",
            goles_a as "golesA", goles_b as "golesB"
     from practica_partido where practica_id = $1 order by orden`,
    [practica.id],
  );

  ok(res, { partidos, cerrada, mvpId });
}, { soloAdmin: true });
