/**
 * Chequeo de configuración: dice qué falta sin revelar ningún dato.
 * Pensado para abrirlo a mano —/api/diagnostico— cuando algo no arranca.
 */

const { consultar } = require('../db');
const { ok, publico } = require('../http');
const { explicar } = require('../diagnostico');
const { VERSION, AMBIENTE } = require('../version');
const { estadoDeLlave } = require('../sesion');

/**
 * Las tablas que este código necesita. Cuando una versión agrega una, se suma
 * acá: así el diagnóstico avisa que falta correr el SQL en vez de dejar una
 * pantalla cargando para siempre.
 */
const TABLAS_QUE_USA_EL_CODIGO = [
  'jugador', 'caballo', 'lesion', 'chukker_extra',
  'temporada', 'practica', 'practica_jugador', 'practica_partido',
  'jornada', 'jornada_chukker', 'jornada_puntaje',
  'torneo', 'lluvia', 'cancha_trabajo', 'cancha_observacion', 'observacion_cancha',
];

module.exports = publico(async (req, res) => {
  const revision = {
    // Va primero a propósito: es lo que uno viene a mirar cuando subió los
    // archivos y no ve los cambios en la pantalla.
    version: VERSION,
    // Para confirmar de un vistazo que la copia de prueba está apuntando a
    // donde tiene que apuntar, y que la del club NO se marcó por error.
    ambiente: AMBIENTE,
    // Si hay llave compartida, sin decir cuál es. En la app del club
    // tiene que decir siempre "apagada".
    llave: estadoDeLlave(),
    DATABASE_URL: process.env.DATABASE_URL ? 'cargada' : 'FALTA',
    SESSION_SECRET: process.env.SESSION_SECRET
      ? (process.env.SESSION_SECRET.length >= 16 ? 'cargada' : 'DEMASIADO CORTA')
      : 'FALTA',
    base: 'sin probar',
    plantel: null,
    sql: null,
    queHacer: null,
  };

  try {
    const filas = await consultar('select count(*)::int as cuantos from jugador');
    revision.base = 'conecta';
    revision.plantel = filas[0].cuantos + ' jugadores';
    if (!filas[0].cuantos) revision.queHacer = 'La base está vacía: corré db/seed-plantel.sql en Supabase.';

    // El código y el SQL se publican por separado, así que la pregunta más
    // cara del proyecto es "¿la base está al día con este código?". Se
    // contesta acá y no adivinando por qué una pantalla quedó cargando.
    const faltan = await consultar(
      `select t.nombre from unnest($1::text[]) as t(nombre)
        where to_regclass('public.' || t.nombre) is null`,
      [TABLAS_QUE_USA_EL_CODIGO],
    );
    if (faltan.length) {
      revision.sql = 'FALTA CORRER: no están ' + faltan.map((f) => f.nombre).join(', ');
      revision.queHacer = 'Corré db/schema.sql en Supabase: la base está atrasada '
        + 'respecto del código.';
    } else {
      revision.sql = 'al día';
    }
  } catch (e) {
    revision.base = 'NO CONECTA';
    revision.queHacer = explicar(e) || 'No se pudo conectar. Revisá DATABASE_URL.';
  }

  if (revision.SESSION_SECRET !== 'cargada' && !revision.queHacer) {
    revision.queHacer = 'Cargá SESSION_SECRET en Vercel y volvé a publicar.';
  }
  if (!revision.queHacer) revision.queHacer = 'Está todo bien.';

  ok(res, revision);
});
