/**
 * Cómo viene cada jugador: el ajuste de su handicap interno y hacia dónde
 * apunta su flecha.
 *
 * El administrador fija el handicap **base**. Encima de eso, esto calcula un
 * ajuste con los resultados de la temporada —palizas, rachas y MVP— y el
 * handicap con el que se arman los equipos es la suma de los dos.
 *
 * Se recalcula entero cada vez, desde el primer partido. Es a propósito: si
 * mañana se corrige un marcador viejo, todo lo que vino después se acomoda
 * solo, y el número que puso el admin no se toca nunca.
 *
 * Las reglas viven en `polo.js`, con el resto del motor.
 */

const { consultar, unaFila } = require('./db');
const { comoViene } = require('./polo');

/** El que todavía no jugó ningún partido con resultado cargado. */
const SIN_JUGAR = { ajuste: 0, flecha: 2 };

const temporadaActiva = () =>
  unaFila('select id, nombre from temporada where activa limit 1');

/**
 * Un mapa `jugador_id → { ajuste, flecha }` con toda la temporada.
 *
 * Una sola consulta para todos: el ranking son 35 jugadores y no tiene sentido
 * ir a la base una vez por cada uno.
 */
async function comoVienenTodos(temporadaId) {
  const filas = await consultar(
    `select jugador_id, practica_id,
            to_char(fecha, 'YYYY-MM-DD') as fecha,
            to_char(hora, 'HH24:MI')     as hora,
            orden, diferencia::int as diferencia, mvp
     from v_resultado_jugador
     where temporada_id = $1
     order by fecha, hora, orden`,
    [temporadaId],
  );

  const porJugador = new Map();
  filas.forEach((f) => {
    if (!porJugador.has(f.jugador_id)) porJugador.set(f.jugador_id, []);
    porJugador.get(f.jugador_id).push({
      practicaId: f.practica_id,
      fecha: f.fecha,
      hora: f.hora,
      orden: f.orden,
      diferencia: f.diferencia,
      mvp: f.mvp,
    });
  });

  const salida = new Map();
  porJugador.forEach((resultados, id) => salida.set(id, comoViene(resultados)));
  return salida;
}

/** Lo mismo para uno solo. */
async function comoVieneUno(temporadaId, jugadorId) {
  const todos = await comoVienenTodos(temporadaId);
  return todos.get(jugadorId) || SIN_JUGAR;
}

/** El handicap interno con el que hay que armar equipos hoy. */
const hcpEfectivo = (base, como) => Number(base || 0) + ((como || SIN_JUGAR).ajuste);

module.exports = { comoVienenTodos, comoVieneUno, hcpEfectivo, temporadaActiva, SIN_JUGAR };
