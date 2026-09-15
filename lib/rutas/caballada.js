/**
 * El grupo de caballada: quiénes comparten los caballos.
 *
 *   GET  /api/caballada    mi grupo, mi invitación sin contestar, y a quién puedo invitar
 *   POST /api/caballada    { accion: ... }
 *
 * Todo lo que se hace acá es de a dos: uno invita, el otro acepta. Nadie entra
 * a un grupo porque otro lo haya marcado, y cualquiera se sale cuando quiere
 * sin pedirle permiso a nadie.
 */

const { consultar, unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const { grupoDe, invitacionDe } = require('../caballada');

const esId = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

/** Falta correr el SQL: se dice así y no con una pantalla rota. */
const FALTA_SQL = 'Falta correr db/schema.sql en Supabase: la tabla del grupo '
  + 'de caballada todavía no existe.';

function limpiarNombre(texto) {
  return String(texto || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

async function mirar(res, sesion) {
  const [grupo, invitacion] = await Promise.all([
    grupoDe(sesion.id),
    invitacionDe(sesion.id),
  ]);

  // A quién se puede invitar: el plantel activo, sin los que ya están en el
  // grupo. Que alguien ya tenga grupo propio se avisa al invitarlo, no acá:
  // saber de antemano quién comparte con quién no le hace falta a nadie.
  const yaEstan = new Set((grupo ? grupo.miembros : []).map((m) => m.jugadorId));
  const plantel = await consultar(
    `select j.id, j.apodo, j.nombre,
            (select count(*)::int from caballo c where c.jugador_id = j.id and c.activo) as caballos
       from v_plantel j
      where j.id <> $1
      order by j.apodo`,
    [sesion.id],
  );

  ok(res, {
    grupo,
    invitacion,
    plantel: plantel.filter((j) => !yaEstan.has(j.id)),
  });
}

/* ---------------------------------------------------------------- acciones */

/** Crear el grupo y mandar las invitaciones de una. */
async function crear(res, datos, sesion) {
  const nombre = limpiarNombre(datos.nombre);
  if (nombre.length < 2) return error(res, 400, 'Poné cómo se llama el grupo.');

  const ya = await grupoDe(sesion.id);
  if (ya) return error(res, 409, 'Ya estás en ' + ya.nombre + '. Salite de ese antes.');

  const invitados = (Array.isArray(datos.invitados) ? datos.invitados : [])
    .filter(esId).filter((id) => id !== sesion.id).slice(0, 20);

  await transaccion(async (tx) => {
    const grupo = await tx.unaFila(
      'insert into grupo_caballada (nombre, creado_por) values ($1, $2) returning id',
      [nombre, sesion.id],
    );
    // El que lo crea entra derecho: ya dijo que sí armándolo.
    await tx.consultar(
      `insert into grupo_miembro (grupo_id, jugador_id, estado) values ($1, $2, 'adentro')`,
      [grupo.id, sesion.id],
    );
    for (const id of invitados) {
      await tx.consultar(
        `insert into grupo_miembro (grupo_id, jugador_id, estado, invitado_por)
         values ($1, $2, 'invitado', $3)
         on conflict (grupo_id, jugador_id) do nothing`,
        [grupo.id, id, sesion.id],
      );
    }
  });

  return mirar(res, sesion);
}

/** Sumar a alguien más. Solo el que armó el grupo. */
async function invitar(res, datos, sesion) {
  const grupo = await grupoDe(sesion.id);
  if (!grupo) return error(res, 409, 'Todavía no armaste ningún grupo.');
  if (!grupo.soyElDuenio) {
    return error(res, 403, 'Invitar es cosa del que armó el grupo. Pedíselo a él.');
  }
  if (!esId(datos.jugadorId)) return error(res, 400, 'Falta a quién invitar.');

  const suyo = await unaFila(
    `select g.nombre from grupo_miembro m
       join grupo_caballada g on g.id = m.grupo_id
      where m.jugador_id = $1 and m.estado = 'adentro'`,
    [datos.jugadorId],
  );
  if (suyo) return error(res, 409, 'Ya está compartiendo caballada en ' + suyo.nombre + '.');

  await consultar(
    `insert into grupo_miembro (grupo_id, jugador_id, estado, invitado_por)
     values ($1, $2, 'invitado', $3)
     on conflict (grupo_id, jugador_id) do nothing`,
    [grupo.id, datos.jugadorId, sesion.id],
  );
  return mirar(res, sesion);
}

/**
 * Aceptar la invitación. Es el único momento en que se abren las dos
 * caballadas, y por eso es el invitado —y nadie más— quien lo hace.
 */
async function aceptar(res, sesion) {
  const invitacion = await invitacionDe(sesion.id);
  if (!invitacion) return error(res, 404, 'No tenés ninguna invitación.');

  const ya = await grupoDe(sesion.id);
  if (ya) return error(res, 409, 'Ya estás en ' + ya.nombre + '. Salite de ese primero.');

  await transaccion(async (tx) => {
    // Aceptar una es rechazar las otras: se está adentro de un grupo por vez.
    await tx.consultar(
      `delete from grupo_miembro
        where jugador_id = $1 and estado = 'invitado' and grupo_id <> $2`,
      [sesion.id, invitacion.grupo_id],
    );
    await tx.consultar(
      `update grupo_miembro set estado = 'adentro', desde = now()
        where grupo_id = $1 and jugador_id = $2`,
      [invitacion.grupo_id, sesion.id],
    );
  });
  return mirar(res, sesion);
}

async function rechazar(res, sesion) {
  await consultar(
    `delete from grupo_miembro where jugador_id = $1 and estado = 'invitado'`,
    [sesion.id],
  );
  return mirar(res, sesion);
}

/**
 * Salirse. Los chukkers que ya se cargaron quedan donde están —se jugaron— y
 * cada uno vuelve a ver solo sus caballos. Si se va el que lo armó, el grupo
 * se termina para todos: no queda nadie a cargo.
 */
async function salir(res, sesion) {
  const grupo = await grupoDe(sesion.id);
  if (!grupo) return mirar(res, sesion);

  if (grupo.soyElDuenio) {
    await consultar('delete from grupo_caballada where id = $1', [grupo.id]);
  } else {
    await consultar(
      'delete from grupo_miembro where grupo_id = $1 and jugador_id = $2',
      [grupo.id, sesion.id],
    );
  }
  return mirar(res, sesion);
}

/** Bajar a otro del grupo, o cancelarle la invitación. Solo el dueño. */
async function sacar(res, datos, sesion) {
  const grupo = await grupoDe(sesion.id);
  if (!grupo) return error(res, 409, 'No estás en ningún grupo.');
  if (!grupo.soyElDuenio) return error(res, 403, 'Eso lo hace el que armó el grupo.');
  if (datos.jugadorId === sesion.id) return salir(res, sesion);

  await consultar(
    'delete from grupo_miembro where grupo_id = $1 and jugador_id = $2',
    [grupo.id, datos.jugadorId],
  );
  return mirar(res, sesion);
}

async function renombrar(res, datos, sesion) {
  const grupo = await grupoDe(sesion.id);
  if (!grupo) return error(res, 409, 'No estás en ningún grupo.');
  if (!grupo.soyElDuenio) return error(res, 403, 'El nombre lo cambia el que lo armó.');

  const nombre = limpiarNombre(datos.nombre);
  if (nombre.length < 2) return error(res, 400, 'Poné cómo se llama el grupo.');
  await consultar('update grupo_caballada set nombre = $2 where id = $1', [grupo.id, nombre]);
  return mirar(res, sesion);
}

module.exports = conSesion(async (req, res, sesion) => {
  try {
    if (req.method === 'GET') return await mirar(res, sesion);
    if (req.method !== 'POST') return error(res, 405, 'Método no permitido.');

    const datos = cuerpo(req);
    switch (String(datos.accion || '')) {
      case 'crear': return await crear(res, datos, sesion);
      case 'invitar': return await invitar(res, datos, sesion);
      case 'aceptar': return await aceptar(res, sesion);
      case 'rechazar': return await rechazar(res, sesion);
      case 'salir': return await salir(res, sesion);
      case 'sacar': return await sacar(res, datos, sesion);
      case 'renombrar': return await renombrar(res, datos, sesion);
      default: return error(res, 400, 'No entiendo qué querés hacer.');
    }
  } catch (e) {
    if (e && e.code === '42P01') return error(res, 503, FALTA_SQL);
    // Dos aceptando a la vez, o una invitación repetida: el índice lo frena y
    // se dice en castellano en vez de con un error de base.
    if (e && e.code === '23505') {
      return error(res, 409, 'Ese jugador ya está compartiendo caballada en otro grupo.');
    }
    throw e;
  }
});
