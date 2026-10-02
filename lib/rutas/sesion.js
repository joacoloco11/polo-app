/**
 * Quién está entrando. Lo primero que consulta la app al abrirse.
 *
 *   GET  /api/sesion    quién soy, la temporada y —si soy admin— los cumpleaños
 *   POST /api/sesion    { fechaNacimiento }  la cargo la primera vez que entro
 *
 * El cumpleaños lo carga cada uno para sí mismo, y desde 2026.09.25 también lo
 * puede cargar un administrador desde el plantel: al que entró y salteó la
 * pantalla, la app no se la vuelve a pedir nunca. Sale del servidor solamente
 * hacia un administrador: el cartel del plantel es para que el club salude, no
 * un dato que ande dando vueltas.
 *
 * La cuenta —qué fecha vale, cuándo cumple, cuántos días faltan— vive en
 * `lib/cumple.js`, que es el mismo que usa el plantel.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const { AMBIENTE, ANOTACION } = require('../version');
const { hoyEnArgentina, leerNacimiento, cumplesDe } = require('../cumple');

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
    ambiente: AMBIENTE,
    // Si la solapa Anotación está prendida en esta copia. La pantalla la
    // dibuja solo cuando sí: no tiene sentido mostrar una lista que nadie
    // puede abrir.
    conAnotacion: ANOTACION,
  });
}

/** Cada uno carga la suya, la primera vez que entra. */
async function guardarNacimiento(req, res, sesion) {
  const leida = leerNacimiento(cuerpo(req).fechaNacimiento);
  if (leida.error) return error(res, 400, leida.error);
  // Acá la fecha vacía no vale: esta pantalla es para cargarla, no para
  // sacarla. Sacarla es cosa del plantel, y la hace un administrador.
  if (!leida.fecha) return error(res, 400, 'Poné la fecha como día, mes y año.');

  await consultar('update jugador set fecha_nacimiento = $2 where id = $1', [sesion.id, leida.fecha]);
  ok(res, { listo: true });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'POST') return guardarNacimiento(req, res, sesion);
  return quienSoy(res, sesion);
});
