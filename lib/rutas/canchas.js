/**
 * Las canchas del club.
 *
 *   GET  /api/canchas     cuánto se usó cada una
 *   POST /api/canchas     suma un partido de torneo (solo administradores)
 *
 * Cuenta dos cosas por cancha: las **prácticas**, que salen solas de lo que se
 * arma en la app, y los **partidos de torneo** —Copa San Diego, fechas de la
 * AAP—, que no se arman acá pero sí ocupan cancha y los carga un admin a mano.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const CANCHAS = 6;
const TIPOS = ['copa', 'aap'];

async function listar(res) {
  const temporada = await unaFila(
    `select id, nombre, to_char(desde, 'YYYY-MM-DD') as desde,
            to_char(hasta, 'YYYY-MM-DD') as hasta
     from temporada where activa limit 1`,
  );
  if (!temporada) return ok(res, { temporada: null, canchas: [], torneos: [], dias: [] });

  // Lo que importa de una cancha es cuánto se jugó encima: los chukkers.
  const canchas = await consultar(
    `with usos as (
       select p.cancha, 'practica' as clase, p.chukkers::int as chukkers
       from practica p where p.temporada_id = $1
       union all
       select t.cancha, 'torneo' as clase, t.chukkers::int
       from torneo t where t.temporada_id = $1
     )
     select cancha,
            count(*) filter (where clase = 'practica')::int as practicas,
            count(*) filter (where clase = 'torneo')::int   as partidos,
            count(*)::int                                   as total,
            sum(chukkers)::int                              as chukkers
     from usos
     group by cancha
     order by chukkers desc, cancha`,
    [temporada.id],
  );

  const torneos = await consultar(
    `select t.id, t.nombre, t.tipo, to_char(t.fecha, 'YYYY-MM-DD') as fecha,
            to_char(t.hora, 'HH24:MI') as hora, t.cancha, t.chukkers
     from torneo t
     where t.temporada_id = $1
     order by t.fecha desc, t.hora desc nulls last
     limit 60`,
    [temporada.id],
  );

  // Día por día: con qué se usó cada cancha y cuándo. El gráfico de la pantalla
  // agrupa por semana, pero necesita la fecha exacta para pararse en los días en
  // que realmente se jugó.
  const dias = await consultar(
    `select to_char(p.fecha, 'YYYY-MM-DD') as fecha, p.cancha, 'practica' as clase
     from practica p where p.temporada_id = $1 and p.cancha is not null
     union all
     select to_char(t.fecha, 'YYYY-MM-DD'), t.cancha, 'torneo'
     from torneo t where t.temporada_id = $1 and t.cancha is not null
     order by 1, 2`,
    [temporada.id],
  );

  // El estado de las canchas: qué llovió, qué se les echó y qué se anotó.
  const [lluvias, trabajos, observaciones] = await Promise.all([
    consultar(
      `select id, to_char(fecha, 'YYYY-MM-DD') as fecha, mm::int
       from lluvia where temporada_id = $1 order by fecha`,
      [temporada.id],
    ),
    consultar(
      `select id, cancha, to_char(fecha, 'YYYY-MM-DD') as fecha, tipo, nombre,
              cantidad::float8 as cantidad, unidad
       from cancha_trabajo where temporada_id = $1
       order by fecha desc, cancha`,
      [temporada.id],
    ),
    consultar(
      `select o.id, to_char(o.fecha, 'YYYY-MM-DD') as fecha, o.texto,
              coalesce(j.apodo, 'Alguien') as autor, o.autor_id as "autorId",
              coalesce(array_agg(oc.cancha order by oc.cancha)
                       filter (where oc.cancha is not null), '{}') as canchas
       from cancha_observacion o
       left join jugador j on j.id = o.autor_id
       left join observacion_cancha oc on oc.observacion_id = o.id
       where o.temporada_id = $1
       group by o.id, j.apodo
       order by o.fecha desc, o.creada_en desc
       limit 100`,
      [temporada.id],
    ),
  ]);

  ok(res, { temporada, canchas, torneos, dias, lluvias, trabajos, observaciones });
}

async function sumarTorneo(req, res, sesion) {
  const datos = cuerpo(req);
  const nombre = String(datos.nombre || '').trim().slice(0, 80);
  if (nombre.length < 3) return error(res, 400, 'Poné el nombre del torneo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return error(res, 400, 'Falta la fecha del partido.');
  }
  const cancha = Number(datos.cancha);
  if (!Number.isInteger(cancha) || cancha < 1 || cancha > CANCHAS) {
    return error(res, 400, `La cancha es un número del 1 al ${CANCHAS}.`);
  }
  const tipo = TIPOS.includes(datos.tipo) ? datos.tipo : 'copa';
  const hora = /^\d{2}:\d{2}$/.test(String(datos.hora || '')) ? datos.hora : null;

  const chukkers = Number(datos.chukkers || 6);
  if (!Number.isInteger(chukkers) || chukkers < 1 || chukkers > 12) {
    return error(res, 400, 'Los chukkers van de 1 a 12.');
  }

  const temporada = await unaFila('select id from temporada where activa limit 1');
  if (!temporada) return error(res, 409, 'No hay temporada activa.');

  const torneo = await unaFila(
    `insert into torneo (temporada_id, nombre, tipo, fecha, hora, cancha, chukkers, creado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, nombre, tipo, to_char(fecha, 'YYYY-MM-DD') as fecha,
               to_char(hora, 'HH24:MI') as hora, cancha, chukkers`,
    [temporada.id, nombre, tipo, datos.fecha, hora, cancha, chukkers, sesion.id],
  );
  ok(res, { torneo });
}

/* ------------------------------------------------- el estado de las canchas */

const TIPOS_TRABAJO = ['arena', 'fertilizante', 'otro'];
const UNIDAD_FIJA = { arena: 'm³', fertilizante: 'kg' };

const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));

async function temporadaActiva(res) {
  const t = await unaFila('select id from temporada where activa limit 1');
  if (!t) error(res, 409, 'No hay temporada activa.');
  return t;
}

/** Un día de lluvia. Si ese día ya estaba cargado, se corrige. */
async function sumarLluvia(datos, res, sesion) {
  if (!esFecha(datos.fecha)) return error(res, 400, 'Falta la fecha de la lluvia.');
  const mm = Number(datos.mm);
  if (!Number.isInteger(mm) || mm < 0 || mm > 500) {
    return error(res, 400, 'Los milímetros van de 0 a 500.');
  }
  const temporada = await temporadaActiva(res);
  if (!temporada) return null;

  const lluvia = await unaFila(
    `insert into lluvia (temporada_id, fecha, mm, cargada_por)
     values ($1, $2, $3, $4)
     on conflict (temporada_id, fecha) do update set mm = excluded.mm, cargada_por = excluded.cargada_por
     returning id, to_char(fecha, 'YYYY-MM-DD') as fecha, mm::int`,
    [temporada.id, datos.fecha, mm, sesion.id],
  );
  return ok(res, { lluvia });
}

/**
 * Las canchas marcadas en pantalla, limpias: sin repetidas, sin números que no
 * existen y siempre en orden. La usan el trabajo y la observación.
 */
function canchasElegidas(lista) {
  return [...new Set((lista || []).map(Number))]
    .filter((c) => Number.isInteger(c) && c >= 1 && c <= CANCHAS)
    .sort((a, b) => a - b);
}

/**
 * Un trabajo de cancha: arena, fertilizante o lo que sea.
 *
 * Va sobre **una o varias** canchas —el mismo camión de arena se reparte el
 * mismo día— y queda una fila por cancha, que es como se leen después los
 * totales. Sigue aceptando `cancha` sola por si quedó alguna pantalla vieja.
 */
async function sumarTrabajo(datos, res, sesion) {
  const canchas = canchasElegidas(
    datos.canchas && datos.canchas.length ? datos.canchas : [datos.cancha],
  );
  if (!canchas.length) return error(res, 400, 'Elegí al menos una cancha.');
  if (!esFecha(datos.fecha)) return error(res, 400, 'Falta la fecha del trabajo.');

  const tipo = TIPOS_TRABAJO.includes(datos.tipo) ? datos.tipo : 'arena';
  const nombre = tipo === 'otro' ? String(datos.nombre || '').trim().slice(0, 60) : null;
  if (tipo === 'otro' && nombre.length < 2) return error(res, 400, 'Poné cómo se llama el trabajo.');

  // Arena y fertilizante ya saben en qué se miden; "otro" lo trae escrito.
  const unidad = tipo === 'otro'
    ? String(datos.unidad || '').trim().slice(0, 10)
    : UNIDAD_FIJA[tipo];
  if (!unidad) return error(res, 400, 'Poné en qué unidad se mide.');

  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999999) {
    return error(res, 400, 'La cantidad tiene que ser un número mayor que cero.');
  }

  const temporada = await temporadaActiva(res);
  if (!temporada) return null;

  // Una fila por cancha, todas de un saque: la cantidad se anota entera en cada
  // una, que es lo que la pantalla avisa antes de guardar.
  const trabajos = await consultar(
    `insert into cancha_trabajo (temporada_id, cancha, fecha, tipo, nombre, cantidad, unidad, cargado_por)
     select $1, unnest($2::smallint[]), $3, $4, $5, $6, $7, $8
     returning id, cancha, to_char(fecha, 'YYYY-MM-DD') as fecha, tipo, nombre,
               cantidad::float8 as cantidad, unidad`,
    [temporada.id, canchas, datos.fecha, tipo, nombre, cantidad, unidad, sesion.id],
  );
  return ok(res, { trabajos, trabajo: trabajos[0] });
}

/** Una observación sobre una o varias canchas. La firma sale de la sesión. */
async function sumarObservacion(datos, res, sesion) {
  if (!esFecha(datos.fecha)) return error(res, 400, 'Falta la fecha de la observación.');

  const texto = String(datos.texto || '').trim().slice(0, 1200);
  if (texto.length < 3) return error(res, 400, 'Escribí qué pasó.');

  const canchas = canchasElegidas(datos.canchas);
  if (!canchas.length) return error(res, 400, 'Elegí al menos una cancha.');

  const temporada = await temporadaActiva(res);
  if (!temporada) return null;

  const obs = await unaFila(
    `insert into cancha_observacion (temporada_id, fecha, texto, autor_id)
     values ($1, $2, $3, $4)
     returning id, to_char(fecha, 'YYYY-MM-DD') as fecha, texto`,
    [temporada.id, datos.fecha, texto, sesion.id],
  );
  await consultar(
    `insert into observacion_cancha (observacion_id, cancha)
     select $1, unnest($2::smallint[])`,
    [obs.id, canchas],
  );
  // El nombre que firma sale de la base, no de lo que mande la pantalla.
  const quien = await unaFila('select apodo from jugador where id = $1', [sesion.id]);
  return ok(res, {
    observacion: { ...obs, canchas, autor: quien ? quien.apodo : 'Alguien', autorId: sesion.id },
  });
}

/** Qué se está cargando: el POST de canchas hace cuatro cosas distintas. */
async function cargar(req, res, sesion) {
  const datos = cuerpo(req);
  if (datos.que === 'lluvia') return sumarLluvia(datos, res, sesion);
  if (datos.que === 'trabajo') return sumarTrabajo(datos, res, sesion);
  if (datos.que === 'observacion') return sumarObservacion(datos, res, sesion);
  return sumarTorneo(req, res, sesion);
}

const BORRABLES = {
  torneo: 'torneo',
  lluvia: 'lluvia',
  trabajo: 'cancha_trabajo',
  observacion: 'cancha_observacion',
};

async function borrar(req, res) {
  const url = new URL(req.url, 'http://app');
  const id = url.searchParams.get('id');
  const tabla = BORRABLES[url.searchParams.get('que') || 'torneo'];
  if (!tabla) return error(res, 400, 'No sé qué borrar.');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return error(res, 400, 'Falta qué borrar.');
  const fila = await unaFila(`delete from ${tabla} where id = $1 returning id`, [id]);
  if (!fila) return error(res, 404, 'Eso no existe.');
  ok(res, { borrado: fila.id });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res);
  if (!sesion.admin) return error(res, 403, 'Cargar en canchas es solo para administradores.');
  if (req.method === 'POST') return cargar(req, res, sesion);
  if (req.method === 'DELETE') return borrar(req, res);
  return error(res, 405, 'Método no permitido.');
});
