/**
 * Quién está entrando. Lo primero que consulta la app al abrirse.
 *
 *   GET  /api/sesion    quién soy, la temporada y —si soy admin— los cumpleaños
 *   POST /api/sesion    { fechaNacimiento }  la cargo la primera vez que entro
 *
 * El cumpleaños lo carga cada uno para sí mismo. Sale del servidor solamente
 * hacia un administrador: el cartel del plantel es para que el club salude, no
 * un dato que ande dando vueltas.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

/** Hoy en el huso del club: a las 21 de Buenos Aires en UTC ya es otro día. */
function hoyEnArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Quiénes cumplen hoy y quién es el próximo. Se calcula acá y no en SQL porque
 * el 29 de febrero y el salto de año se leen más claros así.
 */
function cumplesDe(filas, hoyISO) {
  const hoy = new Date(hoyISO + 'T12:00:00');

  const conDias = filas
    .filter((j) => j.fecha_nacimiento)
    .map((j) => {
      const [, mes, dia] = j.fecha_nacimiento.split('-').map(Number);
      let cuando = new Date(hoy.getFullYear(), mes - 1, dia, 12);
      if (cuando < hoy) cuando = new Date(hoy.getFullYear() + 1, mes - 1, dia, 12);
      return {
        apodo: j.apodo,
        nombre: j.nombre,
        dia,
        mes,
        dias: Math.round((cuando - hoy) / 86400000),
      };
    })
    .sort((a, b) => a.dias - b.dias || a.apodo.localeCompare(b.apodo));

  return {
    hoy: conDias.filter((x) => x.dias === 0),
    proximo: conDias.find((x) => x.dias > 0) || null,
    cargados: conDias.length,
    total: filas.length,
  };
}

async function quienSoy(res, sesion) {
  const jugador = await unaFila(
    `select id, nombre, apodo, es_admin, activo,
            (fecha_nacimiento is null) as falta_nacimiento
     from jugador where id = $1`,
    [sesion.id],
  );
  if (!jugador || !jugador.activo) return error(res, 401, 'Entrá de nuevo.');

  const temporada = await unaFila('select id, nombre from temporada where activa limit 1');

  // Los cumpleaños son cosa del plantel, que es solapa de administrador.
  let cumples = null;
  if (jugador.es_admin) {
    const filas = await consultar(
      `select apodo, nombre, to_char(fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento
       from jugador where activo`,
    );
    cumples = cumplesDe(filas, hoyEnArgentina());
  }

  ok(res, {
    jugador: {
      id: jugador.id,
      nombre: jugador.nombre,
      apodo: jugador.apodo,
      admin: !!jugador.es_admin,
      faltaNacimiento: !!jugador.falta_nacimiento,
    },
    temporada,
    cumples,
  });
}

/** Cada uno carga la suya, la primera vez que entra. */
async function guardarNacimiento(req, res, sesion) {
  const datos = cuerpo(req);
  const fecha = String(datos.fechaNacimiento || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return error(res, 400, 'Poné la fecha como día, mes y año.');
  }

  const ano = Number(fecha.slice(0, 4));
  if (ano < 1920 || ano > new Date().getFullYear()) return error(res, 400, 'Esa fecha no puede ser.');

  await consultar('update jugador set fecha_nacimiento = $2 where id = $1', [sesion.id, fecha]);
  ok(res, { listo: true });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'POST') return guardarNacimiento(req, res, sesion);
  return quienSoy(res, sesion);
});
