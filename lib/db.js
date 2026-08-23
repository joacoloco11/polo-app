/**
 * Conexión a la base.
 *
 * El navegador nunca habla con Supabase: todo pasa por acá, del lado del
 * servidor, con la clave que no sale nunca del servidor. Las políticas de la
 * base siguen siendo la segunda línea de defensa, pero el que decide quién ve
 * qué es este código.
 */

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL. Cargala en Vercel o en el archivo .env.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase exige TLS; el pooler presenta un certificado que no está en la
      // cadena de confianza de Node, y verificarlo no aporta nada acá porque la
      // conexión no sale de la red del proveedor.
      ssl: /localhost|127\.0\.0\.1|\[::1\]/.test(process.env.DATABASE_URL)
        ? false
        : { rejectUnauthorized: false },
      max: 3,                       // en serverless conviene un pool chico
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
  }
  return pool;
}

async function consultar(sql, valores = []) {
  const { rows } = await getPool().query(sql, valores);
  return rows;
}

/** Devuelve la primera fila, o null. */
async function unaFila(sql, valores = []) {
  const filas = await consultar(sql, valores);
  return filas[0] || null;
}

/**
 * Todo adentro de una transacción: o entra la práctica entera con sus
 * jugadores, o no entra nada. Una planilla a medias es peor que ninguna.
 */
async function transaccion(trabajo) {
  const cliente = await getPool().connect();
  try {
    await cliente.query('begin');
    const salida = await trabajo({
      consultar: async (sql, valores = []) => (await cliente.query(sql, valores)).rows,
      unaFila: async (sql, valores = []) => (await cliente.query(sql, valores)).rows[0] || null,
    });
    await cliente.query('commit');
    return salida;
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

module.exports = { consultar, unaFila, transaccion };
