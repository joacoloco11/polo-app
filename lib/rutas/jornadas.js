/**
 * Las jornadas de un jugador: sus días de caballos.
 *
 *   GET    /api/jornadas   mis prácticas y mis partidos de torneo, con lo cargado
 *   POST   /api/jornadas   sumo un partido de torneo; con `id`, corrijo el que ya está
 *   DELETE /api/jornadas   { id } borro un partido de torneo mío
 *
 * Las prácticas aparecen solas, porque salen de la planilla que armó el
 * organizador. Los partidos de torneo los carga el jugador, porque el club no
 * los conoce.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');
const { lugarDe, mediosDe } = require('../lugares');
const { caballadaDe, companerosDe, grupoDe, invitacionDe } = require('../caballada');

const CHUKKERS_TORNEO = 6;      // y se juegan de a medio: 12 lugares
const CUANTAS = 60;             // alcanza para toda una temporada

/**
 * El código y el SQL se publican por separado —GitHub y Supabase—, así que
 * siempre hay un rato en que el código nuevo le habla a una base vieja. Una
 * tabla que todavía no existe no puede tirar abajo la pantalla entera: se
 * devuelve vacío y lo demás sigue andando.
 *
 * 42P01 es, en PostgreSQL, "esa tabla no existe". Cualquier otro error sí sube.
 */
const sinTablaTodavia = (e) => {
  if (e && e.code === '42P01') return [];
  throw e;
};

const rango = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Cómo se lee el organizador de un partido. Vacío si nunca se cargó. */
function nombreDelOrganizador(t) {
  if (t.organizador === 'aap') return 'AAP';
  if (t.organizador === 'sd') return 'San Diego';
  if (t.organizador === 'otro') return t.organizador_nombre || 'Otro';
  return null;
}

/**
 * Los lugares de una jornada, como los nombra la pantalla.
 *
 * En una práctica son los chukkers que le tocaron: ["1","2","3"]. En un partido
 * de a medio son las dos mitades de cada uno: ["1a","1b","2a","2b"…]. Que el
 * jugador parta un chukker en la práctica no cambia esta lista —es la de lo que
 * se puede llenar— sino cómo se llena.
 */
const lugaresDe = (chukkers, medios) => {
  const enteros = Array.from({ length: chukkers }, (_, i) => String(i + 1));
  return medios ? enteros.flatMap((c) => mediosDe(c)) : enteros;
};

async function listar(res, sesion) {
  // Con quiénes comparto caballada. Sin grupo soy yo solo, que es el caso de
  // casi todos, y entonces esto es exactamente lo que era antes.
  const companeros = await companerosDe(sesion.id);

  const [practicas, torneos, caballos, lesiones, extras] = await Promise.all([
    consultar(
      `select p.id as practica_id, to_char(p.fecha, 'YYYY-MM-DD') as fecha,
              to_char(p.hora, 'HH24:MI') as hora, p.cancha, p.chukkers, p.formato,
              p.estado, pj.equipo, pj.sale,
              j.id as jornada_id, j.observaciones
       from practica_jugador pj
       join practica p on p.id = pj.practica_id
       left join jornada j on j.practica_id = p.id and j.jugador_id = $1
       where pj.jugador_id = $1
       order by p.fecha desc, p.hora desc
       limit ${CUANTAS}`,
      [sesion.id],
    ),
    consultar(
      `select id as jornada_id, nombre, to_char(fecha, 'YYYY-MM-DD') as fecha,
              chukkers, medios, observaciones,
              organizador, organizador_nombre, hcp_torneo, de_local, cancha, sede,
              goles_a_favor, goles_en_contra
       from jornada
       where jugador_id = $1 and practica_id is null
       order by fecha desc
       limit ${CUANTAS}`,
      [sesion.id],
    ),
    // La caballada: la mía, más la de los del grupo si acepté compartirla.
    caballadaDe(sesion.id, companeros),
    // Los períodos de lesión: el calendario pinta cada tramo en su lugar.
    consultar(
      `select l.caballo_id, to_char(l.desde, 'YYYY-MM-DD') as desde,
              to_char(l.hasta, 'YYYY-MM-DD') as hasta
       from lesion l join caballo c on c.id = l.caballo_id
       where c.jugador_id = any($1::uuid[])
       order by l.desde`,
      [companeros],
    ),
    // Los chukkers que jugaron afuera del club. Vienen acá y no por su propia
    // dirección porque esta pantalla ya los necesita para dibujar el calendario.
    consultar(
      `select e.id, e.caballo_id, to_char(e.fecha, 'YYYY-MM-DD') as fecha,
              e.chukkers::float8 as chukkers, e.jinete
       from chukker_extra e join caballo c on c.id = e.caballo_id
       where c.jugador_id = any($1::uuid[])
       order by e.fecha desc, e.creado_en desc`,
      [companeros],
    ).catch(sinTablaTodavia),
  ]);

  const eventos = [
    ...practicas.map((p) => {
      const sale = (p.sale || []).map(Number);
      return {
        tipo: 'practica',
        practicaId: p.practica_id,
        jornadaId: p.jornada_id,
        titulo: 'Práctica',
        detalle: 'Cancha ' + p.cancha + ' · ' + p.hora + ' hs',
        fecha: p.fecha,
        chukkers: p.chukkers,
        medios: false,
        misChukkers: rango(p.chukkers).filter((c) => !sale.includes(c)).map(String),
        color: p.equipo,
        cerrada: p.estado === 'cerrada',
        observaciones: p.observaciones || '',
        uso: {},
        puntajes: {},
      };
    }),
    ...torneos.map((t) => ({
      tipo: 'aap',
      practicaId: null,
      jornadaId: t.jornada_id,
      titulo: t.nombre,
      detalle: [
        nombreDelOrganizador(t),
        t.de_local === null || t.de_local === undefined
          ? null
          : (t.de_local ? 'Cancha ' + (t.cancha || '—') : (t.sede || 'de visitante')),
        t.chukkers + ' chukkers' + (t.medios ? ' de a medio' : ''),
      ].filter(Boolean).join(' · '),
      fecha: t.fecha,
      chukkers: t.chukkers,
      medios: !!t.medios,
      misChukkers: lugaresDe(t.chukkers, t.medios),
      color: null,
      cerrada: false,
      observaciones: t.observaciones || '',
      // Lo que el jugador cargó del partido: sirve para su ficha.
      organizador: t.organizador || null,
      organizadorNombre: t.organizador_nombre,
      hcpTorneo: t.hcp_torneo,
      deLocal: t.de_local === null || t.de_local === undefined ? null : t.de_local,
      cancha: t.cancha,
      sede: t.sede,
      golesAFavor: t.goles_a_favor,
      golesEnContra: t.goles_en_contra,
      uso: {},
      puntajes: {},
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  // Lo cargado, de una sola consulta para todas las jornadas.
  const ids = eventos.map((e) => e.jornadaId).filter(Boolean);
  if (ids.length) {
    const porJornada = new Map(eventos.filter((e) => e.jornadaId).map((e) => [e.jornadaId, e]));
    const [chukkers, puntajes] = await Promise.all([
      consultar(`select jornada_id, chukker, mitad, caballo_id
                   from jornada_chukker where jornada_id = any($1::uuid[])`, [ids]),
      consultar('select jornada_id, caballo_id, puntaje from jornada_puntaje where jornada_id = any($1::uuid[])', [ids]),
    ]);
    chukkers.forEach((f) => {
      const ev = porJornada.get(f.jornada_id);
      ev.uso[lugarDe(f.chukker, f.mitad)] = f.caballo_id;
    });
    puntajes.forEach((f) => { porJornada.get(f.jornada_id).puntajes[f.caballo_id] = f.puntaje; });
  }

  /* ---- lo que los del grupo le cargaron a estos mismos caballos ----------
     Sin esto, la estadística de un caballo compartido mostraría solo la mitad
     de lo que jugó: la que monté yo. No viajan las jornadas ajenas enteras
     —eso sería mirarle el cuaderno al otro— sino cuánto jugó cada caballo cada
     día, que es lo único que hace falta para la carga y el calendario. */
  let ajenos = [];
  if (companeros.length > 1) {
    ajenos = await consultar(
      `select jc.caballo_id,
              to_char(j.fecha, 'YYYY-MM-DD') as fecha,
              sum(case when jc.mitad = 0 then 1 else 0.5 end)::float8 as chukkers,
              bool_or(j.practica_id is null) as torneo,
              max(jp.puntaje) as puntaje,
              min(w.apodo) as jinete
         from jornada_chukker jc
         join jornada j on j.id = jc.jornada_id
         join caballo c on c.id = jc.caballo_id
         join jugador w on w.id = j.jugador_id
         left join jornada_puntaje jp
                on jp.jornada_id = j.id and jp.caballo_id = jc.caballo_id
        where c.jugador_id = any($1::uuid[])
          and j.jugador_id = any($1::uuid[])
          and j.jugador_id <> $2
        group by jc.caballo_id, j.id, j.fecha
        order by j.fecha desc`,
      [companeros, sesion.id],
    );
  }

  /* ---- los que ya no están ----------------------------------------------
     Si alguien se sale del grupo, los chukkers que se cargaron con sus
     caballos siguen ahí: se jugaron. Esos caballos se mandan igual, marcados,
     para que la planilla vieja siga diciendo con qué se jugó en vez de mostrar
     un lugar ocupado por nadie. No se pueden elegir de nuevo. */
  const conocidos = new Set(caballos.map((c) => c.id));
  const faltantes = [...new Set(
    eventos.flatMap((e) => Object.values(e.uso)).filter((id) => id && !conocidos.has(id)),
  )];
  if (faltantes.length) {
    const viejos = await consultar(
      `select c.id, c.nombre, c.activo, c.lesionado,
              to_char(c.lesionado_desde, 'YYYY-MM-DD') as lesionado_desde,
              c.jugador_id, j.apodo as duenio
         from caballo c join jugador j on j.id = c.jugador_id
        where c.id = any($1::uuid[])`,
      [faltantes],
    );
    viejos.forEach((c) => caballos.push({ ...c, mio: false, fuera: true, clave: null }));
  }

  // El grupo y la invitación viajan con esto: es la misma pantalla y así el
  // cartel de "te invitaron" aparece sin una llamada más.
  const [grupo, invitacion] = await Promise.all([
    grupoDe(sesion.id), invitacionDe(sesion.id),
  ]);

  ok(res, { eventos, caballos, lesiones, extras, ajenos, grupo, invitacion });
}

const ORGANIZADORES = ['sd', 'aap', 'otro'];

/** Un entero adentro de un rango, o null si no vino nada. */
function enRango(valor, desde, hasta) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < desde || n > hasta) return undefined;   // mal
  return n;
}

/**
 * Revisa el formulario del partido. Devuelve `{ mal: 'lo que falta' }` o los
 * campos ya limpios. Lo usan el alta y la corrección: si se validara en dos
 * lugares, tarde o temprano uno de los dos dejaría pasar algo.
 */
function leerPartido(datos) {
  const nombre = String(datos.nombre || '').trim().slice(0, 80);
  if (nombre.length < 3) return { mal: 'Poné el nombre del torneo.' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return { mal: 'Falta la fecha del partido.' };
  }

  const organizador = ORGANIZADORES.includes(datos.organizador) ? datos.organizador : 'sd';
  const organizadorNombre = organizador === 'otro'
    ? String(datos.organizadorNombre || '').trim().slice(0, 60)
    : null;
  if (organizador === 'otro' && organizadorNombre.length < 2) {
    return { mal: 'Poné quién organiza el torneo.' };
  }

  const chukkers = enRango(datos.chukkers, 4, 8);
  if (chukkers === undefined) return { mal: 'Los chukkers van de 4 a 8.' };

  const hcpTorneo = enRango(datos.hcpTorneo, 0, 40);
  if (hcpTorneo === undefined) return { mal: 'El handicap del torneo va de 0 a 40.' };

  // De local se juega en una de las seis canchas del club; de visitante se
  // escribe dónde se jugó.
  const deLocal = datos.deLocal !== false;
  const cancha = deLocal ? enRango(datos.cancha, 1, 6) : null;
  if (cancha === undefined) return { mal: 'Elegí en qué cancha se jugó.' };
  const sede = deLocal ? null : String(datos.sede || '').trim().slice(0, 80);
  if (!deLocal && sede.length < 2) return { mal: 'Poné dónde se jugó.' };

  const aFavor = enRango(datos.golesAFavor, 0, 99);
  const enContra = enRango(datos.golesEnContra, 0, 99);
  if (aFavor === undefined || enContra === undefined) {
    return { mal: 'Los goles no pueden ser negativos.' };
  }
  if ((aFavor === null) !== (enContra === null)) {
    return { mal: 'Cargá los dos marcadores o ninguno.' };
  }

  return {
    nombre,
    fecha: datos.fecha,
    // En el torneo se juega de a medio chukker salvo que digan lo contrario.
    medios: datos.medios !== false,
    chukkers: chukkers === null ? CHUKKERS_TORNEO : chukkers,
    organizador,
    organizadorNombre,
    hcpTorneo,
    deLocal,
    cancha,
    sede,
    aFavor,
    enContra,
  };
}

const DEVUELVE = `id, nombre, to_char(fecha, 'YYYY-MM-DD') as fecha, chukkers, medios,
                  organizador, organizador_nombre, hcp_torneo, de_local, cancha, sede,
                  goles_a_favor, goles_en_contra`;

/** Nadie toca un partido ajeno: es de quien lo cargó, o de un administrador. */
async function miPartido(id, sesion) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const fila = await unaFila(
    'select id, jugador_id from jornada where id = $1 and practica_id is null', [id],
  );
  if (!fila) return null;
  if (fila.jugador_id !== sesion.id && !sesion.admin) return null;
  return fila;
}

async function guardarPartido(req, res, sesion) {
  const datos = cuerpo(req);
  const p = leerPartido(datos);
  if (p.mal) return error(res, 400, p.mal);

  const valores = [p.nombre, p.fecha, p.chukkers, p.medios, p.organizador,
    p.organizadorNombre, p.hcpTorneo, p.deLocal, p.cancha, p.sede, p.aFavor, p.enContra];

  // Con id se corrige el que ya está; sin id se carga uno nuevo.
  if (datos.id) {
    if (!(await miPartido(datos.id, sesion))) {
      return error(res, 404, 'Ese partido no es tuyo o no existe.');
    }
    const jornada = await unaFila(
      `update jornada set nombre = $1, fecha = $2, chukkers = $3, medios = $4,
              organizador = $5, organizador_nombre = $6, hcp_torneo = $7,
              de_local = $8, cancha = $9, sede = $10,
              goles_a_favor = $11, goles_en_contra = $12
       where id = $13
       returning ${DEVUELVE}`,
      [...valores, datos.id],
    );
    return ok(res, { jornada });
  }

  const jornada = await unaFila(
    `insert into jornada (jugador_id, nombre, fecha, chukkers, medios,
                          organizador, organizador_nombre, hcp_torneo,
                          de_local, cancha, sede, goles_a_favor, goles_en_contra)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning ${DEVUELVE}`,
    [sesion.id, ...valores],
  );
  ok(res, { jornada });
}

/** Borrar el partido se lleva puestos los caballos que se le hayan cargado. */
async function borrarPartido(req, res, sesion) {
  const { id } = cuerpo(req);
  if (!(await miPartido(id, sesion))) {
    return error(res, 404, 'Ese partido no es tuyo o no existe.');
  }
  await consultar('delete from jornada_chukker where jornada_id = $1', [id]);
  await consultar('delete from jornada_puntaje where jornada_id = $1', [id]);
  await consultar('delete from jornada where id = $1', [id]);
  ok(res, { borrado: id });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res, sesion);
  if (req.method === 'POST') return guardarPartido(req, res, sesion);
  if (req.method === 'DELETE') return borrarPartido(req, res, sesion);
  return error(res, 405, 'Método no permitido.');
});
