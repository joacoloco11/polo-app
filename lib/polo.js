/**
 * El motor de la app: formatos, rotación y reparto de equipos.
 *
 * Vive del lado del servidor a propósito. La planilla se calcula acá y se
 * guarda ya resuelta, así lo que se ve en pantalla y lo que queda en la base
 * son lo mismo, aunque el día de mañana cambie la app.
 *
 * Las cuatro rotaciones salen de las planillas del club y están verificadas en
 * tests/rotacion.test.js: en todos los formatos quedan 4 contra 4 en cada
 * chukker, sin un lugar de más ni de menos.
 */

const COLORES = {
  azul: { label: 'AZUL', hex: '#3b82f6' },
  blanco: { label: 'BLANCO', hex: '#94a3b8' },
  colorado: { label: 'COLORADO', hex: '#ef4444' },
  bicolor: { label: 'BICOLOR', hex: '#c9a84c' },
};

const FORMATOS = {
  8: {
    jugadores: 8, chukkers: 6,
    cupos: { azul: 4, blanco: 4 },
    equipos: ['azul', 'blanco'],
    resumen: 'azul 4 · blanco 4',
    detalle: 'todos juegan los 6',
  },
  9: {
    jugadores: 9, chukkers: 7,
    cupos: { azul: 4, blanco: 4, bicolor: 1 },
    equipos: ['azul', 'blanco'],
    resumen: '4 · 4 · 1 bicolor',
    detalle: 'dos juegan 7',
  },
  10: {
    jugadores: 10, chukkers: 8,
    cupos: { azul: 5, blanco: 5 },
    equipos: ['azul', 'blanco'],
    resumen: 'azul 5 · blanco 5',
    detalle: 'cuatro juegan 7',
  },
  12: {
    jugadores: 12, chukkers: 9,
    cupos: { azul: 4, blanco: 4, colorado: 4 },
    equipos: ['azul', 'blanco', 'colorado'],
    resumen: '4 · 4 · 4 colorado',
    detalle: '3 + 3 + 3',
  },
};

/** En las de 12: qué dos equipos juegan cada tramo. El tercero descansa. */
const FRANJAS_12 = [
  { desde: 1, hasta: 3, juegan: ['azul', 'blanco'] },
  { desde: 4, hasta: 6, juegan: ['blanco', 'colorado'] },
  { desde: 7, hasta: 9, juegan: ['colorado', 'azul'] },
];

/** Chukkers que sale cada jugador, por su orden dentro del equipo. */
const SALE_9_AZUL = [[], [1], [2], [3]];
const SALE_9_BLANCO = [[], [5], [6], [7]];
const SALE_9_BICOLOR = [4];
const SALE_10 = [[5], [6], [1, 2], [3, 4], [7, 8]];

const CANTIDADES = [8, 9, 10, 12];
const esCantidadValida = (n) => CANTIDADES.includes(Number(n));

const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

class ErrorDeArmado extends Error {}

function validarCupos(formato, jugadores) {
  if (jugadores.length !== formato.jugadores) {
    throw new ErrorDeArmado(
      `La práctica es de ${formato.jugadores} jugadores y llegaron ${jugadores.length}.`,
    );
  }
  for (const [color, cupo] of Object.entries(formato.cupos)) {
    const cuantos = jugadores.filter((j) => j.color === color).length;
    if (cuantos !== cupo) {
      throw new ErrorDeArmado(
        `El ${color} lleva ${cupo} jugadores en una práctica de ${formato.jugadores} y tiene ${cuantos}.`,
      );
    }
  }
  if (new Set(jugadores.map((j) => j.id)).size !== jugadores.length) {
    throw new ErrorDeArmado('Hay un jugador repetido en la práctica.');
  }
}

/**
 * Arma la planilla. `jugadores` viene agrupado por color y, dentro de cada
 * color, en el orden en que se los eligió — ese orden decide quién juega más:
 * en las de 9 el primero de cada equipo juega los 7, y en las de 10 los dos
 * primeros juegan 7 de 8.
 */
function generarPlanilla(cantidad, jugadores) {
  const formato = FORMATOS[cantidad];
  if (!formato) throw new ErrorDeArmado(`No existe el formato de ${cantidad} jugadores.`);
  validarCupos(formato, jugadores);

  const porColor = (c) => jugadores.filter((j) => j.color === c);
  const { chukkers } = formato;
  const salidas = new Map();
  const ladoDelBicolor = {};

  if (cantidad === 8) jugadores.forEach((j) => salidas.set(j.id, []));

  if (cantidad === 9) {
    porColor('azul').forEach((j, i) => salidas.set(j.id, SALE_9_AZUL[i]));
    porColor('blanco').forEach((j, i) => salidas.set(j.id, SALE_9_BLANCO[i]));
    salidas.set(porColor('bicolor')[0].id, SALE_9_BICOLOR);
    // El bicolor tapa el hueco: azul en la primera mitad, blanco en la segunda.
    porColor('azul').forEach((j) => salidas.get(j.id).forEach((c) => { ladoDelBicolor[c] = 'azul'; }));
    porColor('blanco').forEach((j) => salidas.get(j.id).forEach((c) => { ladoDelBicolor[c] = 'blanco'; }));
  }

  if (cantidad === 10) {
    ['azul', 'blanco'].forEach((color) => {
      porColor(color).forEach((j, i) => salidas.set(j.id, SALE_10[i]));
    });
  }

  if (cantidad === 12) {
    // Nadie sale a título individual: descansa el equipo entero su franja.
    jugadores.forEach((j) => {
      const descansa = FRANJAS_12.find((f) => !f.juegan.includes(j.color));
      salidas.set(j.id, rango(descansa.desde, descansa.hasta));
    });
  }

  // `orden` es el lugar dentro del equipo, no dentro de la lista: es lo que
  // guarda la base y lo que decide quién juega de más.
  const contador = {};
  const enPlanilla = jugadores.map((j) => {
    contador[j.color] = (contador[j.color] || 0);
    const orden = contador[j.color]++;
    const sale = (salidas.get(j.id) || []).slice().sort((a, b) => a - b);
    const juega = rango(1, chukkers).filter((c) => !sale.includes(c));
    const fila = { ...j, orden, sale, juega, todos: sale.length === 0 };
    if (j.color === 'bicolor') {
      fila.juegaDe = {};
      juega.forEach((c) => { fila.juegaDe[c] = ladoDelBicolor[c]; });
    }
    return fila;
  });

  const sumaBicolor = porColor('bicolor').reduce((a, j) => a + (j.handicap || 0), 0);
  const hcpPorEquipo = {};
  formato.equipos.forEach((e) => {
    const propio = porColor(e).reduce((a, j) => a + (j.handicap || 0), 0);
    // El handicap del bicolor suma en los dos equipos: juega para los dos.
    hcpPorEquipo[e] = propio + (e === 'colorado' ? 0 : sumaBicolor);
  });
  const hcpPractica =
    formato.equipos.reduce((a, e) => a + hcpPorEquipo[e], 0) / formato.equipos.length;

  return {
    cantidad: formato.jugadores,
    formato,
    chukkers,
    jugadores: enPlanilla,
    franjas: cantidad === 12 ? FRANJAS_12 : null,
    hcpPorEquipo,
    hcpPractica: Math.round(hcpPractica * 100) / 100,
  };
}

/**
 * Los jugadores en el orden de la hoja: los equipos y, al final, el bicolor.
 * Es el orden canónico — no depende de cómo llegaron ni de cómo los devolvió
 * la base.
 */
function enOrdenDeHoja(planilla) {
  const orden = [...planilla.formato.equipos, 'bicolor'];
  return planilla.jugadores.slice().sort((a, b) =>
    orden.indexOf(a.color) - orden.indexOf(b.color) || a.orden - b.orden);
}

/** Quién está en cancha, por lado, en cada chukker. */
function formacionPorChukker(planilla) {
  const salida = [];
  const jugadores = enOrdenDeHoja(planilla);
  for (let c = 1; c <= planilla.chukkers; c++) {
    const lados = {};
    planilla.formato.equipos.forEach((e) => { lados[e] = []; });
    jugadores.forEach((j) => {
      if (!j.juega.includes(c)) return;
      const lado = j.color === 'bicolor' ? j.juegaDe[c] : j.color;
      lados[lado].push(j.apodo);
    });
    // En las de 12 solo hay dos equipos en cancha; el que descansa queda vacío.
    Object.keys(lados).forEach((e) => { if (!lados[e].length) delete lados[e]; });
    salida.push({ chukker: c, lados });
  }
  return salida;
}

/** Verifica que la rotación cierre. Devuelve los problemas encontrados. */
function verificarPlanilla(planilla) {
  const problemas = [];
  formacionPorChukker(planilla).forEach(({ chukker, lados }) => {
    const equipos = Object.keys(lados);
    if (equipos.length !== 2) {
      problemas.push(`Chukker ${chukker}: hay ${equipos.length} equipos en cancha, tienen que ser 2.`);
    }
    equipos.forEach((e) => {
      if (lados[e].length !== 4) {
        problemas.push(`Chukker ${chukker}: el ${e} tiene ${lados[e].length} en cancha, tienen que ser 4.`);
      }
    });
  });
  return problemas;
}

/**
 * Texto de la planilla como lo escribe el club: `x7`, `(1)` o `x7 (5)`.
 * En las de 8 y 12 no lleva: en las de 8 nadie sale, y en las de 12 el
 * descanso es por franja del equipo, no por jugador.
 */
function anotacion(planilla, j) {
  if (planilla.cantidad === 8 || planilla.cantidad === 12) return '';
  const marca = j.juega.length === 7 ? 'x7' : '';
  const salida = j.sale.length === 0
    ? ''
    : j.sale.length === 1
      ? `(${j.sale[0]})`
      : `(${j.sale.slice(0, -1).join(', ')} y ${j.sale[j.sale.length - 1]})`;
  return [marca, salida].filter(Boolean).join(' ');
}

/**
 * Reparto balanceado por handicap. Codicioso: de mayor a menor, cada uno al
 * equipo con lugar que menos handicap acumulado tenga. El orden de elección
 * se respeta dentro de cada equipo, porque es el que decide quién juega más.
 */
function repartirPorHandicap(cantidad, jugadores) {
  const formato = FORMATOS[cantidad];
  if (!formato) throw new ErrorDeArmado(`No existe el formato de ${cantidad} jugadores.`);
  if (jugadores.length !== cantidad) {
    throw new ErrorDeArmado(`La práctica es de ${cantidad} jugadores y llegaron ${jugadores.length}.`);
  }

  const ordenDeEleccion = new Map(jugadores.map((j, i) => [j.id, i]));
  let pool = jugadores.slice();
  const asignados = [];

  if (formato.cupos.bicolor) {
    // El bicolor juega para los dos equipos, así que su handicap no desbalancea:
    // conviene que sea uno del medio de la tabla.
    const promedio = pool.reduce((a, j) => a + j.handicap, 0) / pool.length;
    const bicolor = pool.slice().sort((a, b) =>
      Math.abs(a.handicap - promedio) - Math.abs(b.handicap - promedio)
      || a.apodo.localeCompare(b.apodo))[0];
    asignados.push({ ...bicolor, color: 'bicolor' });
    pool = pool.filter((j) => j.id !== bicolor.id);
  }

  const equipos = formato.equipos.map((color) => ({
    color, cupo: formato.cupos[color], suma: 0, miembros: [],
  }));

  pool.slice()
    .sort((a, b) => b.handicap - a.handicap || a.apodo.localeCompare(b.apodo))
    .forEach((jugador) => {
      const destino = equipos
        .filter((e) => e.miembros.length < e.cupo)
        .sort((a, b) => a.suma - b.suma || a.color.localeCompare(b.color))[0];
      destino.miembros.push(jugador);
      destino.suma += jugador.handicap;
    });

  equipos.forEach((e) => {
    e.miembros.sort((a, b) => ordenDeEleccion.get(a.id) - ordenDeEleccion.get(b.id));
    e.miembros.forEach((j) => asignados.push({ ...j, color: e.color }));
  });

  return asignados;
}

/** Diferencia de handicap entre el equipo más fuerte y el más flojo. */
function desbalance(asignados, cantidad) {
  const formato = FORMATOS[cantidad];
  const bicolor = asignados.filter((j) => j.color === 'bicolor')
    .reduce((a, j) => a + j.handicap, 0);
  const sumas = formato.equipos.map((e) =>
    asignados.filter((j) => j.color === e).reduce((a, j) => a + j.handicap, 0)
    + (e === 'colorado' ? 0 : bicolor));
  return Math.max(...sumas) - Math.min(...sumas);
}

/**
 * El handicap de una práctica, como lo calculaba la v1: por equipo se suman
 * los cuatro handicaps más altos —son los cuatro que están en cancha— y
 * después se promedia entre los equipos.
 *
 * `equipos` es { azul: [{handicap}], blanco: [...], colorado: [...] }.
 */
function hcpDeLaPractica(equipos) {
  const enCancha = (lista) => (lista || [])
    .map((j) => j.handicap || 0)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((a, b) => a + b, 0);

  // El bicolor juega para los dos, así que su handicap suma en los dos lados.
  const bicolor = enCancha(equipos.bicolor);
  const lados = ['azul', 'blanco', 'colorado']
    .filter((e) => (equipos[e] || []).length)
    .map((e) => enCancha(equipos[e]) + (e === 'colorado' ? 0 : bicolor));

  if (!lados.length) return null;
  const promedio = lados.reduce((a, b) => a + b, 0) / lados.length;
  return Math.round(promedio * 100) / 100;
}

/**
 * Los partidos que se juegan en una práctica.
 *
 * En las de 8, 9 y 10 es uno solo, azul contra blanco. En las de 12 son tres,
 * uno por franja de chukkers. Es lo que define cuántos resultados se cargan y
 * cuántos puntos hay en juego.
 */
function enfrentamientos(cantidad) {
  const formato = FORMATOS[cantidad];
  if (!formato) throw new ErrorDeArmado(`No existe el formato de ${cantidad} jugadores.`);
  if (cantidad === 12) {
    return FRANJAS_12.map((f, i) => ({
      orden: i + 1, equipoA: f.juegan[0], equipoB: f.juegan[1], desde: f.desde, hasta: f.hasta,
    }));
  }
  return [{ orden: 1, equipoA: 'azul', equipoB: 'blanco', desde: 1, hasta: formato.chukkers }];
}

/**
 * Lo que vale un partido para el que lo jugó: 3 el ganado, 1 el empatado.
 * En las de 12 cada uno disputa dos de los tres enfrentamientos, así que valen
 * la mitad y el máximo por práctica sigue siendo 3.
 */
function puntosDelPartido(cantidad, equipo, partido) {
  if (partido.golesA === null || partido.golesA === undefined) return 0;
  if (partido.golesB === null || partido.golesB === undefined) return 0;

  const gana = (propios, ajenos) => (propios > ajenos ? 3 : propios === ajenos ? 1 : 0);
  const deA = gana(partido.golesA, partido.golesB);
  const deB = gana(partido.golesB, partido.golesA);

  let propios;
  // El bicolor juega para los dos equipos: se lleva el promedio.
  if (equipo === 'bicolor') propios = (deA + deB) / 2;
  else if (equipo === partido.equipoA) propios = deA;
  else if (equipo === partido.equipoB) propios = deB;
  else propios = 0;   // el equipo que descansaba esa franja

  return propios * (cantidad === 12 ? 0.5 : 1);
}

/**
 * Rearma la planilla desde lo que quedó guardado en la base.
 *
 * No recalcula la rotación: la reconstruye con los chukkers que cada uno salió
 * según se guardaron. Si algún día cambia el motor, las planillas viejas siguen
 * mostrando lo que se repartió ese día.
 *
 * `filas` son las de practica_jugador, ya con apodo y nombre del jugador.
 */
function desdeGuardado(cantidad, filas) {
  const formato = FORMATOS[cantidad];
  if (!formato) throw new ErrorDeArmado(`No existe el formato de ${cantidad} jugadores.`);
  const { chukkers } = formato;

  const jugadores = filas
    .slice()
    .sort((a, b) => {
      const orden = [...formato.equipos, 'bicolor'];
      return orden.indexOf(a.equipo) - orden.indexOf(b.equipo) || a.orden - b.orden;
    })
    .map((f) => {
      const sale = (f.sale || []).map(Number).sort((a, b) => a - b);
      const juega = rango(1, chukkers).filter((c) => !sale.includes(c));
      return {
        id: f.jugador_id,
        nombre: f.nombre,
        apodo: f.apodo,
        handicap: f.hcp_interno || 0,
        color: f.equipo,
        orden: f.orden,
        sale,
        juega,
        todos: sale.length === 0,
        juegaDe: f.juega_de || undefined,
      };
    });

  const sumaBicolor = jugadores
    .filter((j) => j.color === 'bicolor')
    .reduce((a, j) => a + j.handicap, 0);
  const hcpPorEquipo = {};
  formato.equipos.forEach((e) => {
    hcpPorEquipo[e] = jugadores.filter((j) => j.color === e).reduce((a, j) => a + j.handicap, 0)
      + (e === 'colorado' ? 0 : sumaBicolor);
  });
  const hcpPractica =
    formato.equipos.reduce((a, e) => a + hcpPorEquipo[e], 0) / formato.equipos.length;

  return {
    cantidad,
    formato,
    chukkers,
    jugadores,
    franjas: cantidad === 12 ? FRANJAS_12 : null,
    hcpPorEquipo,
    hcpPractica: Math.round(hcpPractica * 100) / 100,
    // Si el handicap interno no vino (lo pidió alguien que no es admin), las
    // sumas dan cero y no significan nada: mejor decirlo que mostrar un 0.
    hcpConocido: filas.some((f) => f.hcp_interno !== null && f.hcp_interno !== undefined),
  };
}

/**
 * La planilla lista para mandar al navegador.
 *
 * El motor vive solo acá, del lado del servidor: la pantalla no recalcula nada,
 * dibuja lo que le llega. Por eso el `x7` y los paréntesis se resuelven acá y
 * viajan ya escritos.
 */
function paraPantalla(planilla) {
  const jugadores = enOrdenDeHoja(planilla);
  return {
    cantidad: planilla.cantidad,
    chukkers: planilla.chukkers,
    equipos: planilla.formato.equipos,
    tieneBicolor: !!planilla.formato.cupos.bicolor,
    franjas: planilla.franjas,
    hcpPorEquipo: planilla.hcpPorEquipo,
    hcpPractica: planilla.hcpPractica,
    hcpConocido: planilla.hcpConocido !== false,
    desbalance: desbalance(planilla.jugadores, planilla.cantidad),
    jugadores: jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      apodo: j.apodo,
      color: j.color,
      orden: j.orden,
      sale: j.sale,
      juega: j.juega,
      todos: j.todos,
      juegaDe: j.juegaDe || null,
      nota: anotacion(planilla, j),
    })),
    formacion: formacionPorChukker(planilla),
  };
}

/* ===========================================================================
   El handicap interno que se mueve solo.

   El administrador fija el HCP **base** de cada jugador. Encima de eso, la app
   calcula un **ajuste** con los resultados de la temporada, y lo que manda para
   armar equipos es la suma de los dos.

   El ajuste se recalcula entero cada vez, desde el primer partido: si mañana se
   corrige un marcador viejo, todo lo que vino después se acomoda solo y el
   número que puso el admin nunca se pierde.

   Las reglas, como las definió el club:

     · ganar o perder por 5 goles o más mueve el handicap un punto, en el acto;
     · dos partidos ajustados seguidos —4 goles o menos— para el mismo lado
       también mueven un punto;
     · salir MVP suma un punto;
     · el empate no mueve nada y corta la racha.

   El bicolor no entra: juega para los dos equipos, así que su partido no es ni
   victoria ni derrota (la vista `v_resultado_jugador` ya lo deja afuera).
   =========================================================================== */

/** Una diferencia de 5 goles o más es paliza y mueve el handicap sola. */
const PALIZA = 5;
/** Cuánto se puede mover el ajuste, para arriba y para abajo. */
const TOPE_AJUSTE = 3;
/** Cuántos partidos mira la flecha. */
const FLECHA_MIRA = 3;

const acotar = (n, tope) => Math.max(-tope, Math.min(tope, n));

/**
 * El ajuste del handicap interno.
 *
 * `resultados` viene de `v_resultado_jugador`, del más viejo al más nuevo, con
 * `{ diferencia, mvp, practicaId }`. El MVP es de la práctica y no del partido:
 * en una de 12 el jugador tiene dos filas y el punto se cuenta una sola vez.
 */
function ajusteDeHandicap(resultados) {
  let ajuste = 0;
  let racha = 0;             // ajustados seguidos: + los ganados, − los perdidos

  resultados.forEach((r) => {
    const d = Number(r.diferencia);

    if (d >= PALIZA) { ajuste += 1; racha = 0; }
    else if (d <= -PALIZA) { ajuste -= 1; racha = 0; }
    else if (d === 0) { racha = 0; }
    else if (d > 0) { racha = racha > 0 ? racha + 1 : 1; }
    else { racha = racha < 0 ? racha - 1 : -1; }

    if (racha >= 2) { ajuste += 1; racha = 0; }
    if (racha <= -2) { ajuste -= 1; racha = 0; }
  });

  // Un punto por cada práctica en la que salió MVP.
  const premiadas = new Set();
  resultados.forEach((r) => { if (r.mvp) premiadas.add(r.practicaId); });

  return acotar(ajuste + premiadas.size, TOPE_AJUSTE);
}

/**
 * Hacia dónde apunta la flecha: 2 arriba, 1 en 45° para arriba, 0 horizontal,
 * −1 en 45° para abajo, −2 abajo.
 *
 * Mira los últimos tres partidos y los va aplicando: cada victoria la sube un
 * escalón, cada derrota la baja uno, el empate la acerca un escalón a la
 * horizontal y el MVP la sube uno más. El que todavía no jugó arranca arriba.
 */
function flechaDe(resultados) {
  if (!resultados.length) return 2;

  const yaPremiada = new Set();
  let donde = 0;

  resultados.slice(-FLECHA_MIRA).forEach((r) => {
    const d = Number(r.diferencia);
    if (d === 0) donde += (donde > 0 ? -1 : donde < 0 ? 1 : 0);
    else donde += (d > 0 ? 1 : -1);
    if (r.mvp && !yaPremiada.has(r.practicaId)) {
      yaPremiada.add(r.practicaId);
      donde += 1;
    }
    donde = acotar(donde, 2);
  });
  return donde;
}

/** Las dos cuentas juntas, ordenando por si vinieran desordenados. */
function comoViene(resultados) {
  const orden = (resultados || []).slice().sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha))
    || String(a.hora || '').localeCompare(String(b.hora || ''))
    || (a.orden || 0) - (b.orden || 0));
  return { ajuste: ajusteDeHandicap(orden), flecha: flechaDe(orden) };
}

module.exports = {
  COLORES, FORMATOS, FRANJAS_12, CANTIDADES,
  esCantidadValida, generarPlanilla, formacionPorChukker, verificarPlanilla,
  anotacion, repartirPorHandicap, desbalance, paraPantalla, desdeGuardado,
  enfrentamientos, puntosDelPartido, hcpDeLaPractica, ErrorDeArmado,
  ajusteDeHandicap, flechaDe, comoViene, PALIZA, TOPE_AJUSTE, FLECHA_MIRA,
};
