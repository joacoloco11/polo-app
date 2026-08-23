/**
 * Guardar los caballos de una jornada.
 *
 *   POST /api/jornada
 *     { practicaId | jornadaId, uso: {chukker: caballoId},
 *       puntajes: {caballoId: 1..10}, observaciones }
 *
 * Se guarda entera y de una: lo que llega reemplaza lo que había. Es lo que
 * espera la pantalla, donde el jugador toca chukkers hasta que queda como
 * jugó y recién ahí guarda.
 *
 * La jornada de una práctica se crea sola la primera vez que alguien carga
 * algo: no tiene sentido pedirle al jugador que la abra antes.
 */

const { unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo, soloMetodo } = require('../http');

const rango = (n) => Array.from({ length: n }, (_, i) => i + 1);

module.exports = conSesion(async (req, res, sesion) => {
  if (!soloMetodo(req, res, 'POST')) return;

  const datos = cuerpo(req);
  const uso = datos.uso && typeof datos.uso === 'object' ? datos.uso : {};
  const puntajes = datos.puntajes && typeof datos.puntajes === 'object' ? datos.puntajes : {};
  const observaciones = String(datos.observaciones || '').trim().slice(0, 400);

  /* ---- de qué jornada estamos hablando, y qué chukkers le tocaron */

  let jornada;
  let misChukkers;

  if (datos.practicaId) {
    const fila = await unaFila(
      `select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, p.chukkers, p.estado, pj.sale
       from practica p
       join practica_jugador pj on pj.practica_id = p.id and pj.jugador_id = $2
       where p.id = $1`,
      [datos.practicaId, sesion.id],
    );
    if (!fila) return error(res, 404, 'No jugaste esa práctica.');
    if (fila.estado === 'cerrada' && !sesion.admin) {
      return error(res, 409, 'Esa práctica ya está cerrada.');
    }
    const sale = (fila.sale || []).map(Number);
    misChukkers = rango(fila.chukkers).filter((c) => !sale.includes(c));

    jornada = await unaFila(
      `insert into jornada (jugador_id, practica_id, fecha, chukkers, observaciones)
       values ($1, $2, $3, $4, nullif($5, ''))
       on conflict (jugador_id, practica_id)
         do update set observaciones = nullif($5, ''), actualizada_en = now()
       returning id`,
      [sesion.id, fila.id, fila.fecha, fila.chukkers, observaciones],
    );
  } else if (datos.jornadaId) {
    jornada = await unaFila(
      `update jornada set observaciones = nullif($3, ''), actualizada_en = now()
       where id = $1 and jugador_id = $2
       returning id, chukkers, medios`,
      [datos.jornadaId, sesion.id, observaciones],
    );
    if (!jornada) return error(res, 404, 'Esa jornada no es tuya.');
    // Jugando de a medio, los lugares son el doble.
    misChukkers = rango(jornada.chukkers * (jornada.medios ? 2 : 1));
  } else {
    return error(res, 400, 'Falta decir de qué práctica o partido es.');
  }

  /* ---- validar antes de escribir */

  const chukkers = Object.entries(uso)
    .filter(([, caballoId]) => caballoId)
    .map(([chukker, caballoId]) => [Number(chukker), String(caballoId)]);

  const fuera = chukkers.filter(([c]) => !misChukkers.includes(c));
  if (fuera.length) {
    return error(res, 400, `El lugar ${fuera[0][0]} no es tuyo en esa jornada.`);
  }

  const usados = [...new Set([...chukkers.map(([, c]) => c), ...Object.keys(puntajes)])];
  if (usados.length) {
    const mios = await unaFila(
      'select count(*)::int as cuantos from caballo where jugador_id = $1 and id = any($2::uuid[])',
      [sesion.id, usados],
    );
    if (mios.cuantos !== usados.length) {
      return error(res, 400, 'Hay un caballo que no es de tu caballada.');
    }
  }

  const notas = Object.entries(puntajes)
    .filter(([, n]) => n !== null && n !== undefined && n !== '')
    .map(([caballoId, n]) => [String(caballoId), Number(n)]);
  if (notas.some(([, n]) => !Number.isInteger(n) || n < 1 || n > 10)) {
    return error(res, 400, 'El puntaje va del 1 al 10.');
  }

  /* ---- guardar: lo que llega reemplaza lo que había */

  await transaccion(async (tx) => {
    await tx.consultar('delete from jornada_chukker where jornada_id = $1', [jornada.id]);
    await tx.consultar('delete from jornada_puntaje where jornada_id = $1', [jornada.id]);
    for (const [chukker, caballoId] of chukkers) {
      await tx.consultar(
        'insert into jornada_chukker (jornada_id, chukker, caballo_id) values ($1, $2, $3)',
        [jornada.id, chukker, caballoId],
      );
    }
    for (const [caballoId, puntaje] of notas) {
      await tx.consultar(
        'insert into jornada_puntaje (jornada_id, caballo_id, puntaje) values ($1, $2, $3)',
        [jornada.id, caballoId, puntaje],
      );
    }
  });

  ok(res, { jornadaId: jornada.id, chukkers: chukkers.length, faltan: misChukkers.length - chukkers.length });
});
