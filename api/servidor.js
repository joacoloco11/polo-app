/**
 * La única función de servidor.
 *
 * Vercel convierte en una "Serverless Function" a cada archivo de `api/`, y en
 * el plan gratuito no se puede pasar de doce. Once endpuntos sueltos ya rozaban
 * el límite y no había manera de seguir sumando pantallas.
 *
 * Así que `api/` tiene un solo archivo —este— y `vercel.json` manda para acá
 * todo lo que empiece con `/api/`. Este mira qué se pidió y se lo pasa al que
 * corresponde, que vive en `lib/rutas/`, fuera de `api/`, donde no cuenta.
 *
 * Del lado de las pantallas no cambió nada: las direcciones siguen siendo
 * /api/login, /api/practicas y demás.
 *
 * Para sumar un endpunto: un archivo en `lib/rutas/` y una línea en el mapa.
 * Nunca un archivo suelto en `api/`, porque eso vuelve a gastar cupo.
 */

const { error } = require('../lib/http');

// Los `require` están escritos uno por uno a propósito: es lo que le permite a
// Vercel ver qué archivos hacen falta y empaquetarlos.
const RUTAS = {
  login: require('../lib/rutas/login'),
  sesion: require('../lib/rutas/sesion'),
  salir: require('../lib/rutas/salir'),
  plantel: require('../lib/rutas/plantel'),
  diagnostico: require('../lib/rutas/diagnostico'),
  jugadores: require('../lib/rutas/jugadores'),
  practicas: require('../lib/rutas/practicas'),
  practica: require('../lib/rutas/practica'),
  caballos: require('../lib/rutas/caballos'),
  jornadas: require('../lib/rutas/jornadas'),
  jornada: require('../lib/rutas/jornada'),
  resultado: require('../lib/rutas/resultado'),
  ranking: require('../lib/rutas/ranking'),
  jugador: require('../lib/rutas/jugador'),
  canchas: require('../lib/rutas/canchas'),
};

/**
 * Qué se pidió. Viene de dos lados según cómo haya llegado:
 * el `?ruta=` que agrega la regla de `vercel.json`, o el camino tal cual.
 */
function queRuta(req) {
  const url = new URL(req.url || '/', 'http://app');
  const porRegla = url.searchParams.get('ruta');
  if (porRegla) return porRegla;
  return url.pathname.replace(/\/+$/, '').replace(/^\/api\//, '');
}

module.exports = async (req, res) => {
  const nombre = queRuta(req);
  const handler = RUTAS[nombre];
  if (!handler) return error(res, 404, `No existe /api/${nombre}.`);
  return handler(req, res);
};
