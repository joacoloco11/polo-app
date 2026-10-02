/**
 * El plantel completo, para los administradores.
 *
 * A diferencia de /api/plantel —que es la lista para entrar y no muestra
 * nada— acá sí van los dos handicaps y la categoría, porque es con lo que se
 * arman las prácticas. Por eso pide sesión de administrador.
 *
 *   GET    /api/jugadores            lista
 *   POST   /api/jugadores            alta o edición (si viene `id`)
 *
 * Acá también se carga el **cumpleaños** de cualquiera. Lo normal es que lo
 * ponga cada uno la primera vez que entra, pero esa pantalla pasa una sola vez
 * y se puede saltear: al que la salteó no hay forma de volver a pedírsela, y
 * sin esto su cumpleaños no lo puede cargar nadie.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const { comoVienenTodos, temporadaActiva, hcpEfectivo, SIN_JUGAR } = require('../handicap');
const { leerNacimiento } = require('../cumple');

const CATEGORIAS = ['socio', 'temporario', 'invitado'];

/** Los handicaps del club van de -2 a 10; fuera de ahí es un dedazo. */
function numeroDeHandicap(valor, porDefecto = 0) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < -2 || n > 10) return null;
  return n;
}

async function listar(res) {
  const [filas, temporada] = await Promise.all([
    consultar(`
      select id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo,
             (pin_puesto_en is not null) as activado,
             to_char(fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento,
             -- El apodo es para mostrarlo; el id, para dejarlo ya elegido
             -- cuando se abre el jugador a corregir.
             (select apodo from jugador q where q.id = j.invitado_por) as invitado_por,
             j.invitado_por as invitado_por_id
      from jugador j
      order by activo desc, hcp_interno desc, apodo
    `),
    temporadaActiva(),
  ]);

  // El handicap con el que hay que armar equipos hoy: el que puso el admin más
  // lo que movieron los resultados.
  const como = temporada ? await comoVienenTodos(temporada.id) : new Map();
  const jugadores = filas.map((j) => {
    const suyo = como.get(j.id) || SIN_JUGAR;
    return {
      ...j,
      ajuste: suyo.ajuste,
      flecha: suyo.flecha,
      hcp_efectivo: hcpEfectivo(j.hcp_interno, suyo),
    };
  });

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

  // Quién trajo al invitado. Solo tiene sentido para un invitado; en cualquier
  // otra categoría se limpia, para que no quede colgado de un cambio viejo.
  const invitadoPor = categoria === 'invitado' && /^[0-9a-f-]{36}$/i.test(String(datos.invitado_por || ''))
    ? datos.invitado_por
    : null;

  /* El cumpleaños se toca solo si vino en el mensaje. La diferencia importa:
     que no venga es "no lo toqués", y que venga vacío es "sacáselo". Si fueran
     lo mismo, cualquier pantalla que mandara media ficha le borraría la fecha
     a alguien sin querer. */
  const tocaNacimiento = Object.prototype.hasOwnProperty.call(datos, 'fecha_nacimiento');
  const nacimiento = tocaNacimiento ? leerNacimiento(datos.fecha_nacimiento) : null;
  if (nacimiento && nacimiento.error) return error(res, 400, nacimiento.error);

  if (datos.id) {
    const antes = await unaFila('select id from jugador where id = $1', [datos.id]);
    if (!antes) return error(res, 404, 'Ese jugador no está en el plantel.');
    // Dos jugadores no pueden compartir el nombre completo. Sin esto, la base
    // igual lo frena, pero con un error que no le dice nada a nadie.
    if (nombre) {
      const otro = await unaFila(
        'select id from jugador where lower(nombre) = lower($1) and id <> $2',
        [nombre, datos.id],
      );
      if (otro) return error(res, 409, 'Ya hay otro jugador con ese nombre.');
    }
    const jugador = await unaFila(
      `update jugador set
         nombre       = coalesce(nullif($2, ''), nombre),
         apodo        = coalesce(nullif($3, ''), apodo),
         handicap     = $4,
         hcp_interno  = $5,
         categoria    = $6,
         activo       = $7,
         invitado_por = $8,
         fecha_nacimiento = case when $9 then $10::date else fecha_nacimiento end
       where id = $1
       returning id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo,
                 to_char(fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento`,
      [datos.id, nombre, apodo, handicap, hcpInterno, categoria, datos.activo !== false, invitadoPor,
        tocaNacimiento, nacimiento ? nacimiento.fecha : null],
    );
    return ok(res, { jugador });
  }

  const repetido = await unaFila('select id from jugador where lower(nombre) = lower($1)', [nombre]);
  if (repetido) return error(res, 409, 'Ya hay alguien con ese nombre en el plantel.');

  const jugador = await unaFila(
    `insert into jugador (nombre, apodo, handicap, hcp_interno, categoria, invitado_por, fecha_nacimiento)
     values ($1, $2, $3, $4, $5, $6, $7::date)
     returning id, nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo,
               to_char(fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento`,
    [nombre, apodo, handicap, hcpInterno, categoria, invitadoPor,
      nacimiento ? nacimiento.fecha : null],
  );
  ok(res, { jugador });
}

/**
 * Los cumpleaños de varios de una vez: es la pantalla donde se cargan los que
 * faltan, uno abajo del otro.
 *
 * Va por su propio camino y no por `guardar` a propósito. Esa función escribe
 * la ficha entera, así que mandarle media —solo el id y la fecha— le dejaría
 * el handicap en cero y la categoría en invitado. Acá lo único que se toca es
 * la fecha.
 */
async function guardarCumples(req, res) {
  const fechas = cuerpo(req).fechas;
  if (!fechas || typeof fechas !== 'object') return error(res, 400, 'No vino ninguna fecha.');

  const entradas = Object.entries(fechas).filter(([id]) => /^[0-9a-f-]{36}$/i.test(id));
  if (!entradas.length) return error(res, 400, 'No vino ninguna fecha.');
  if (entradas.length > 100) return error(res, 400, 'Son demasiadas de una vez.');

  // Se revisan todas antes de escribir ninguna: si una está mal, no se guarda
  // nada y la pantalla queda con lo que el otro escribió, que es lo que uno
  // quiere cuando le rebotan una de veinte.
  const listas = [];
  for (const [id, valor] of entradas) {
    const leida = leerNacimiento(valor);
    if (leida.error) {
      const quien = await unaFila('select apodo from jugador where id = $1', [id]);
      return error(res, 400, `${quien ? quien.apodo + ': ' : ''}${leida.error}`);
    }
    listas.push([id, leida.fecha]);
  }

  let guardados = 0;
  for (const [id, fecha] of listas) {
    const fila = await unaFila(
      'update jugador set fecha_nacimiento = $2::date where id = $1 returning id', [id, fecha],
    );
    if (fila) guardados++;
  }
  ok(res, { guardados });
}

module.exports = conSesion(async (req, res) => {
  if (req.method === 'GET') return listar(res);
  if (req.method === 'POST') {
    return cuerpo(req).accion === 'cumples' ? guardarCumples(req, res) : guardar(req, res);
  }
  return error(res, 405, 'Método no permitido.');
}, { soloAdmin: true });
