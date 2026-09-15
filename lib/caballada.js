/**
 * La caballada compartida.
 *
 * Hay jugadores que se prestan los caballos todo el tiempo. Contados por
 * separado, ningún caballo tiene su carga real: la mitad de sus chukkers están
 * anotados en la cuenta del otro, y el mismo animal aparece dos veces, una por
 * dueño.
 *
 * El grupo los junta. Los caballos de todos los que están ADENTRO se usan como
 * si fueran propios y los que se llaman igual se muestran como uno solo.
 *
 * Nadie entra porque otro lo marque: se invita, y el invitado acepta desde su
 * app. Mientras no acepte no se ve nada de los dos lados. Es la regla que hace
 * que esto no sea una forma de espiar la caballada ajena.
 */

const { consultar, unaFila } = require('./db');

/**
 * Si el SQL todavía no se corrió, el grupo simplemente no existe: cada uno
 * sigue con su caballada y la app anda igual. 42P01 es "esa tabla no existe".
 */
const sinGrupoTodavia = (e) => {
  if (e && e.code === '42P01') return null;
  throw e;
};

/**
 * Cómo se compara un nombre de caballo con otro: sin mayúsculas, sin tildes y
 * sin espacios de más. "La Negra" y "la negra " son el mismo animal.
 */
function claveDeNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** El grupo donde estoy adentro, con todos sus miembros. `null` si no hay. */
async function grupoDe(jugadorId) {
  const mio = await unaFila(
    `select g.id, g.nombre, g.creado_por
       from grupo_miembro m
       join grupo_caballada g on g.id = m.grupo_id
      where m.jugador_id = $1 and m.estado = 'adentro'`,
    [jugadorId],
  ).catch(sinGrupoTodavia);
  if (!mio) return null;

  const miembros = await consultar(
    `select m.jugador_id, m.estado, j.apodo, j.nombre,
            (select count(*)::int from caballo c
              where c.jugador_id = m.jugador_id and c.activo) as caballos
       from grupo_miembro m
       join jugador j on j.id = m.jugador_id
      where m.grupo_id = $1
      order by (m.estado = 'adentro') desc, j.apodo`,
    [mio.id],
  );

  return {
    id: mio.id,
    nombre: mio.nombre,
    soyElDuenio: mio.creado_por === jugadorId,
    miembros: miembros.map((m) => ({
      jugadorId: m.jugador_id,
      apodo: m.apodo,
      nombre: m.nombre,
      estado: m.estado,
      caballos: m.caballos,
    })),
  };
}

/**
 * La invitación que tengo sin contestar, si hay alguna. Es lo que hace que el
 * cartel aparezca solo al abrir Caballos, sin que nadie tenga que avisar por
 * WhatsApp que mandó la invitación.
 */
async function invitacionDe(jugadorId) {
  return unaFila(
    `select g.id as grupo_id, g.nombre, j.apodo as de
       from grupo_miembro m
       join grupo_caballada g on g.id = m.grupo_id
       join jugador j on j.id = g.creado_por
      where m.jugador_id = $1 and m.estado = 'invitado'
      order by m.desde desc
      limit 1`,
    [jugadorId],
  ).catch(sinGrupoTodavia);
}

/**
 * Con quiénes comparto caballada: yo siempre, más los que estén adentro del
 * mismo grupo. Es la lista que decide qué caballos puedo tocar.
 */
async function companerosDe(jugadorId) {
  const filas = await consultar(
    `select otro.jugador_id
       from grupo_miembro yo
       join grupo_miembro otro on otro.grupo_id = yo.grupo_id
      where yo.jugador_id = $1 and yo.estado = 'adentro' and otro.estado = 'adentro'`,
    [jugadorId],
  ).catch((e) => {
    if (e && e.code === '42P01') return [];
    throw e;
  });
  const ids = new Set(filas.map((f) => f.jugador_id));
  ids.add(jugadorId);
  return [...ids];
}

/**
 * La caballada con la que puedo trabajar: la mía y la de los del grupo.
 *
 * Cada caballo viene con de quién es y con su `clave` —el nombre comparado sin
 * mayúsculas ni tildes—, que es lo que le permite a la pantalla mostrar como
 * uno solo al caballo que los dos cargaron con el mismo nombre.
 */
async function caballadaDe(jugadorId, deQuienes) {
  const ids = deQuienes || await companerosDe(jugadorId);
  const filas = await consultar(
    `select c.id, c.nombre, c.activo, c.lesionado,
            to_char(c.lesionado_desde, 'YYYY-MM-DD') as lesionado_desde,
            c.jugador_id, j.apodo as duenio
       from caballo c
       join jugador j on j.id = c.jugador_id
      where c.jugador_id = any($1::uuid[])
      order by c.activo desc, c.nombre`,
    [ids],
  );
  return filas.map((c) => ({
    ...c,
    mio: c.jugador_id === jugadorId,
    clave: claveDeNombre(c.nombre),
  }));
}

module.exports = {
  claveDeNombre, grupoDe, invitacionDe, companerosDe, caballadaDe,
};
