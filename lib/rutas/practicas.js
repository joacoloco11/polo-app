/**
 * Prácticas: listar y armar.
 *
 *   GET  /api/practicas      las de la temporada activa (lo ve todo el club)
 *   POST /api/practicas      arma una (solo administradores)
 *
 * El armado se resuelve acá y se guarda ya resuelto: qué chukkers juega cada
 * uno queda escrito en la base, no se recalcula al mostrarlo. Si algún día
 * cambia la rotación, las planillas viejas siguen diciendo lo que dijeron.
 *
 * Con `guardar: false` devuelve la planilla sin escribir nada — es lo que usa
 * la pantalla para mostrar el armado antes de confirmarlo.
 */

const { consultar, unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const {
  FORMATOS, esCantidadValida, generarPlanilla, repartirPorHandicap,
  verificarPlanilla, paraPantalla, enfrentamientos, ErrorDeArmado,
} = require('../polo');

const COLORES_VALIDOS = ['azul', 'blanco', 'colorado', 'bicolor'];
const CANCHAS = 6;   // las que tiene el club

/* ------------------------------------------------------------------ listar */

async function listar(res) {
  const practicas = await consultar(`
    -- La fecha y la hora salen como texto a propósito: si viajan como fecha,
    -- el navegador las corre de día según su huso.
    select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, to_char(p.hora, 'HH24:MI') as hora,
           p.cancha, p.formato, p.chukkers, p.estado, p.tipo, p.notas, p.mvp_id,
           t.nombre as temporada,
           count(pj.jugador_id) as jugadores,
           -- El marcador ya armado, para no pedir cada práctica solo por eso.
           (select string_agg(pp.goles_a || '-' || pp.goles_b, ' · ' order by pp.orden)
              from practica_partido pp
             where pp.practica_id = p.id and pp.goles_a is not null) as marcador
    from practica p
    join temporada t on t.id = p.temporada_id
    left join practica_jugador pj on pj.practica_id = p.id
    where t.activa
    group by p.id, t.nombre
    order by p.fecha desc, p.hora desc
    limit 60
  `);
  ok(res, { practicas });
}

/* ------------------------------------------------------------------- armar */

function validarCabecera(datos) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return 'Falta la fecha de la práctica.';
  }
  if (!/^\d{2}:\d{2}$/.test(String(datos.hora || ''))) {
    return 'La hora va en formato 17:30.';
  }
  const cancha = Number(datos.cancha);
  if (!Number.isInteger(cancha) || cancha < 1 || cancha > CANCHAS) {
    return `La cancha es un número del 1 al ${CANCHAS}.`;
  }
  if (!esCantidadValida(datos.formato)) {
    return 'Las prácticas son de 8, 9, 10 o 12 jugadores.';
  }
  return null;
}

/**
 * Traduce los ids que llegaron a los jugadores de la base, en el mismo orden
 * en que los eligieron. Ese orden es el que decide quién juega de más, así que
 * no se puede reordenar por conveniencia.
 */
async function traerJugadores(ids) {
  const filas = await consultar(
    `select id, nombre, apodo, handicap, hcp_interno, activo
     from jugador where id = any($1::uuid[])`,
    [ids],
  );
  const porId = new Map(filas.map((j) => [j.id, j]));
  const faltan = ids.filter((id) => !porId.has(id) || !porId.get(id).activo);
  if (faltan.length) {
    throw new ErrorDeArmado('Hay jugadores elegidos que ya no están en el plantel.');
  }
  return ids.map((id) => {
    const j = porId.get(id);
    // Para armar manda el handicap del club, no el de la AAP.
    return { id: j.id, nombre: j.nombre, apodo: j.apodo, handicap: j.hcp_interno };
  });
}

async function armar(req, res, sesion) {
  const datos = cuerpo(req);

  const mal = validarCabecera(datos);
  if (mal) return error(res, 400, mal);

  const formato = Number(datos.formato);
  const explicitos = Array.isArray(datos.jugadores) ? datos.jugadores : null;
  const ids = explicitos
    ? explicitos.map((j) => j && j.id)
    : (Array.isArray(datos.seleccion) ? datos.seleccion : []);

  if (ids.length !== formato) {
    return error(res, 400, `Elegiste ${ids.length} jugadores y la práctica es de ${formato}.`);
  }
  if (new Set(ids).size !== ids.length) {
    return error(res, 400, 'Hay un jugador elegido dos veces.');
  }
  if (explicitos && explicitos.some((j) => !COLORES_VALIDOS.includes(j.color))) {
    return error(res, 400, 'Alguno de los jugadores no tiene color asignado.');
  }

  const delPlantel = await traerJugadores(ids);

  const asignados = explicitos
    ? delPlantel.map((j, i) => ({ ...j, color: explicitos[i].color }))
    : repartirPorHandicap(formato, delPlantel);

  // `generarPlanilla` agrupa por color, y dentro de cada color respeta el orden
  // del array. Ordenar por equipo acá deja el array igual que la planilla.
  const equipos = [...FORMATOS[formato].equipos, 'bicolor'];
  const ordenados = equipos.flatMap((c) => asignados.filter((j) => j.color === c));

  const planilla = generarPlanilla(formato, ordenados);

  const problemas = verificarPlanilla(planilla);
  if (problemas.length) {
    // No debería pasar nunca: la rotación está probada en tests. Si pasa, es
    // preferible no guardar una planilla que no cierra.
    return error(res, 500, `El armado no cierra: ${problemas[0]}`);
  }

  const notas = String(datos.notas || '').trim().slice(0, 600);
  const cabecera = {
    fecha: datos.fecha,
    hora: datos.hora,
    cancha: Number(datos.cancha),
    formato,
    chukkers: planilla.chukkers,
    notas,
  };

  if (datos.guardar === false) {
    return ok(res, { practica: { ...cabecera, id: null, estado: 'borrador' }, planilla: paraPantalla(planilla) });
  }

  const temporada = await unaFila('select id, nombre from temporada where activa limit 1');
  if (!temporada) {
    return error(res, 409, 'No hay temporada activa. Corré db/seed-temporada.sql en Supabase.');
  }

  const guardada = await transaccion(async (tx) => {
    const practica = await tx.unaFila(
      `insert into practica
         (temporada_id, fecha, hora, cancha, tipo, formato, chukkers, estado, notas, creada_por)
       values ($1, $2, $3, $4, 'practica', $5, $6, 'publicada', nullif($7, ''), $8)
       returning id, to_char(fecha, 'YYYY-MM-DD') as fecha, to_char(hora, 'HH24:MI') as hora,
                 cancha, formato, chukkers, estado, notas`,
      [temporada.id, cabecera.fecha, cabecera.hora, cabecera.cancha,
        formato, planilla.chukkers, notas, sesion.id],
    );

    for (const j of planilla.jugadores) {
      await tx.consultar(
        `insert into practica_jugador (practica_id, jugador_id, equipo, orden, sale, juega_de)
         values ($1, $2, $3, $4, $5::smallint[], $6::jsonb)`,
        [practica.id, j.id, j.color, j.orden, j.sale, j.juegaDe ? JSON.stringify(j.juegaDe) : null],
      );
    }

    // Los enfrentamientos quedan escritos desde el vamos, sin goles: es lo que
    // después se completa con el resultado. En las de 12 son tres.
    for (const e of enfrentamientos(formato)) {
      await tx.consultar(
        'insert into practica_partido (practica_id, orden, equipo_a, equipo_b) values ($1, $2, $3, $4)',
        [practica.id, e.orden, e.equipoA, e.equipoB],
      );
    }
    return practica;
  });

  ok(res, {
    practica: { ...guardada, temporada: temporada.nombre },
    planilla: paraPantalla(planilla),
  });
}

/* ------------------------------------------------------------------ ruteo */

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res);
  if (req.method !== 'POST') return error(res, 405, 'Método no permitido.');
  if (!sesion.admin) return error(res, 403, 'Armar prácticas es solo para administradores.');
  try {
    return await armar(req, res, sesion);
  } catch (e) {
    if (e instanceof ErrorDeArmado) return error(res, 400, e.message);
    throw e;
  }
});
