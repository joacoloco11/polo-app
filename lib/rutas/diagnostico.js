/**
 * Chequeo de configuración: dice qué falta sin revelar ningún dato.
 * Pensado para abrirlo a mano —/api/diagnostico— cuando algo no arranca.
 */

const { consultar } = require('../db');
const { ok, publico } = require('../http');
const { explicar } = require('../diagnostico');

module.exports = publico(async (req, res) => {
  const revision = {
    DATABASE_URL: process.env.DATABASE_URL ? 'cargada' : 'FALTA',
    SESSION_SECRET: process.env.SESSION_SECRET
      ? (process.env.SESSION_SECRET.length >= 16 ? 'cargada' : 'DEMASIADO CORTA')
      : 'FALTA',
    base: 'sin probar',
    plantel: null,
    queHacer: null,
  };

  try {
    const filas = await consultar('select count(*)::int as cuantos from jugador');
    revision.base = 'conecta';
    revision.plantel = filas[0].cuantos + ' jugadores';
    if (!filas[0].cuantos) revision.queHacer = 'La base está vacía: corré db/seed-plantel.sql en Supabase.';
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
