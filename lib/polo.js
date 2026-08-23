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

module.exports = {
  COLORES, FORMATOS, FRANJAS_12, CANTIDADES,
  esCantidadValida, generarPlanilla, formacionPorChukker, verificarPlanilla,
  anotacion, repartirPorHandicap, desbalance, paraPantalla, desdeGuardado,
  ErrorDeArmado,
};
