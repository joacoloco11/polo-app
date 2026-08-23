/**
 * El plantel completo, para los administradores.
 *
 * A diferencia de /api/plantel —que es la lista para entrar y no muestra
 * nada— acá sí van los dos handicaps y la categoría, porque es con lo que se
 * arman las prácticas. Por eso pide sesión de administrador.
 *
 *   GET    /api/jugadores            lista
 *   POST   /api/jugadores            alta o edición (si viene `id`)
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const CATEGORIAS = ['socio', 'temporario', 'invitado'];

/** Los handicaps del club van de -2 a 10; fuera de ahí es un dedazo. */
function numeroDeHandicap(valor, porDefecto = 0) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < -2 || n > 10) return null;
  return n;
}

async function listar(res) {
  const jugadores = await consultar(`
    select id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo,
           (pin_puesto_en is not null) as activado
    from jugador
    order by activo desc, hcp_interno desc, apodo
  `);
  ok(res, { jugadores });
}

async function guardar(req, res) {
  const datos = cuerpo(req);
  const nombre = String(datos.nombre || '').trim();
  const apodo = String(datos.apodo || '').trim() || nombre.split(' ').slice(-1)[0];

  if (!datos.id && !nombre) return error(res, 400, 'Falta el nombre y apellido.');
  if (nombre && nombre.length < 3) return error(res, 400, 'El nombre es muy corto.');

  const handicap = numeroDeHandicap(datos.handicap);
  const hcpInterno = numeroDeHandicap(datos.hcp_interno);
  if (handicap === null || hcpInterno === null) {
    return error(res, 400, 'Los handicaps van de -2 a 10.');
  }

  const categoria = CATEGORIAS.includes(datos.categoria) ? datos.categoria : 'invitado';

  if (datos.id) {
    const antes = await unaFila('select id from jugador where id = $1', [datos.id]);
    if (!antes) return error(res, 404, 'Ese jugador no está en el plantel.');
    const jugador = await unaFila(
      `update jugador set
         nombre      = coalesce(nullif($2, ''), nombre),
         apodo       = coalesce(nullif($3, ''), apodo),
         handicap    = $4,
         hcp_interno = $5,
         categoria   = $6,
         activo      = $7
       where id = $1
       returning id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo`,
      [datos.id, nombre, apodo, handicap, hcpInterno, categoria, datos.activo !== false],
    );
    return ok(res, { jugador });
  }

  const repetido = await unaFila('select id from jugador where lower(nombre) = lower($1)', [nombre]);
  if (repetido) return error(res, 409, 'Ya hay alguien con ese nombre en el plantel.');

  const jugador = await unaFila(
    `insert into jugador (nombre, apodo, handicap, hcp_interno, categoria)
     values ($1, $2, $3, $4, $5)
     returning id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo`,
    [nombre, apodo, handicap, hcpInterno, categoria],
  );
  ok(res, { jugador });
}

module.exports = conSesion(async (req, res) => {
  if (req.method === 'GET') return listar(res);
  if (req.method === 'POST') return guardar(req, res);
  return error(res, 405, 'Método no permitido.');
}, { soloAdmin: true });
