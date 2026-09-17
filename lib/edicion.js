/**
 * Editar una práctica ya publicada.
 *
 * Editar no es volver a armar: la práctica ya se jugó, y lo que hay guardado
 * —el resultado, el MVP, los caballos que cada uno cargó— es lo que de verdad
 * pasó. Lo que se arregla acá es la planilla: el que se anotó y no vino, el que
 * entró en su lugar, de cuántos se terminó jugando.
 *
 * Las tres reglas, que son las del club:
 *
 *  1. Las de **8, 9 y 10** se pueden pasar entre sí. Las de **12** no: son tres
 *     equipos, tres enfrentamientos y la cuenta de puntos es otra. En una de 12
 *     solo se cambia un jugador por otro.
 *  2. **Los colores se mantienen**, pero se pueden mover: el que sale deja su
 *     lugar y el que entra lo toma.
 *  3. **El resultado y el MVP quedan.** Lo único que se pierde son los caballos
 *     de los chukkers que dejan de existir, y eso se avisa antes de guardar.
 *
 * Este archivo hace las cuentas. Escribir es cosa de `rutas/practica.js`.
 */

const { FORMATOS, generarPlanilla, verificarPlanilla, ErrorDeArmado } = require('./polo');
const { lugarDe } = require('./lugares');

const rango = (n) => Array.from({ length: n }, (_, i) => i + 1);
const enLista = (xs) => (xs.length < 2
  ? xs.join('')
  : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

// Medio plantel tiene el apodo abreviado —"Ventu. Edu", "Diego K."— así que la
// frase que termina en un nombre ya viene con su punto puesto.
const punto = (texto) => (texto.endsWith('.') ? texto : texto + '.');

/**
 * ¿Se puede pasar de un formato al otro? Las de 12 son un mundo aparte: entran
 * y salen jugadores, pero la práctica sigue siendo de 12.
 */
function cambioDeFormatoValido(antes, ahora) {
  if (antes === ahora) return null;
  if (antes === 12) {
    return 'Una práctica de 12 no se puede pasar a otro formato: son tres equipos y '
      + 'tres partidos. Lo que sí se puede es cambiar un jugador por otro.';
  }
  if (ahora === 12) {
    return 'Una práctica no se puede pasar a 12: las de 12 se arman aparte.';
  }
  return null;
}

/**
 * La planilla que quedaría. `elegidos` llega como [{ id, color }] en el orden
 * en que se los ve en pantalla; acá se agrupa por color, que es lo que espera
 * el motor, y dentro de cada color se respeta ese orden — es el que decide
 * quién juega de más.
 */
function planillaEditada(formato, elegidos, delPlantel) {
  const porId = new Map(delPlantel.map((j) => [j.id, j]));
  const faltan = elegidos.filter((e) => !porId.has(e.id));
  if (faltan.length) {
    throw new ErrorDeArmado('Hay jugadores elegidos que ya no están en el plantel.');
  }

  const equipos = [...FORMATOS[formato].equipos, 'bicolor'];
  const ordenados = equipos.flatMap((color) => elegidos
    .filter((e) => e.color === color)
    .map((e) => ({ ...porId.get(e.id), color })));

  const planilla = generarPlanilla(formato, ordenados);

  const problemas = verificarPlanilla(planilla);
  if (problemas.length) throw new ErrorDeArmado(`La planilla no cierra: ${problemas[0]}`);

  return planilla;
}

/**
 * Qué chukkers le tocan a cada uno con la planilla nueva. La clave es el
 * jugador; el valor, el conjunto de números de chukker que juega.
 */
function chukkersPorJugador(planilla) {
  const mapa = new Map();
  planilla.jugadores.forEach((j) => {
    const sale = new Set((j.sale || []).map(Number));
    mapa.set(j.id, new Set(rango(planilla.chukkers).filter((c) => !sale.has(c))));
  });
  return mapa;
}

/**
 * El balance: qué se conserva y qué no, dicho antes de tocar nada.
 *
 * `jornadas` son las que ya están cargadas, cada una con sus lugares:
 *   [{ jugadorId, apodo, jornadaId, lugares: [{ chukker, mitad }] }]
 *
 * Lo que se pierde son los lugares que quedan fuera de los chukkers que el
 * jugador pasa a jugar. Pasa por dos motivos y se cuentan igual: porque la
 * práctica achicó —de 10 a 9 se cae el chukker 8— o porque el jugador cambió
 * de lugar en la rotación y ahora descansa otro chukker.
 */
function balanceDeLaEdicion({ antes, planilla, jornadas, mvp }) {
  const juegaAhora = chukkersPorJugador(planilla);
  const quedan = new Set(planilla.jugadores.map((j) => j.id));
  const estaban = new Set(antes.jugadores.map((j) => j.id));
  const apodoDe = new Map([
    ...antes.jugadores.map((j) => [j.id, j.apodo]),
    ...planilla.jugadores.map((j) => [j.id, j.apodo]),
  ]);

  const salen = antes.jugadores.filter((j) => !quedan.has(j.id));
  const entran = planilla.jugadores.filter((j) => !estaban.has(j.id));

  const sacados = [];
  const pierden = [];
  let conservados = 0;

  jornadas.forEach((jor) => {
    const lugares = jor.lugares || [];
    if (!quedan.has(jor.jugadorId)) {
      sacados.push({
        id: jor.jugadorId,
        apodo: apodoDe.get(jor.jugadorId) || jor.apodo,
        lugares: lugares.length,
      });
      return;
    }
    const mios = juegaAhora.get(jor.jugadorId) || new Set();
    const caen = lugares.filter((l) => !mios.has(l.chukker));
    conservados += lugares.length - caen.length;
    if (caen.length) {
      pierden.push({
        id: jor.jugadorId,
        apodo: apodoDe.get(jor.jugadorId) || jor.apodo,
        lugares: caen.length,
        chukkers: [...new Set(caen.map((l) => l.chukker))].sort((a, b) => a - b),
        cuales: caen.map((l) => lugarDe(l.chukker, l.mitad)),
      });
    }
  });

  // Los que salen y nunca cargaron nada igual se nombran: el que mira quiere
  // saber a quién está sacando, haya cargado caballos o no.
  salen.forEach((j) => {
    if (!sacados.some((s) => s.id === j.id)) sacados.push({ id: j.id, apodo: j.apodo, lugares: 0 });
  });

  const mvpSeVa = !!(mvp && !quedan.has(mvp.id));

  return {
    formatoAntes: antes.formato,
    formatoAhora: planilla.cantidad,
    chukkersAntes: antes.chukkers,
    chukkersAhora: planilla.chukkers,
    // Los chukkers que directamente dejan de existir. Es lo primero que se
    // mira cuando una práctica se achica.
    chukkersQueSeCaen: rango(antes.chukkers).filter((c) => c > planilla.chukkers),
    sacados,
    entran: entran.map((j) => ({ id: j.id, apodo: j.apodo, color: j.color })),
    pierden,
    conservados,
    mvp: mvp ? { id: mvp.id, apodo: mvp.apodo } : null,
    mvpSeVa,
    // Cuántas jornadas quedan en pie, para decirlo en criollo en la pantalla.
    jornadasQueQuedan: jornadas.filter((j) => quedan.has(j.jugadorId)).length,
  };
}

/**
 * El balance en castellano, para que la pantalla no tenga que armar las frases
 * y para que digan lo mismo en la app y en las pruebas.
 */
function balanceEnPalabras(b) {
  const conserva = [];
  const pierde = [];

  conserva.push(b.formatoAhora === b.formatoAntes
    ? `Sigue siendo de ${b.formatoAntes} y de ${b.chukkersAhora} chukkers.`
    : `Pasa de ${b.formatoAntes} a ${b.formatoAhora} jugadores: de ${b.chukkersAntes} `
      + `a ${b.chukkersAhora} chukkers.`);
  conserva.push('El resultado queda como está.');
  if (b.mvp && !b.mvpSeVa) conserva.push(punto(`El MVP sigue siendo ${b.mvp.apodo}`));
  if (b.conservados) {
    conserva.push(`Se conservan ${b.conservados} ${b.conservados === 1 ? 'caballo cargado' : 'caballos cargados'}`
      + `, de ${b.jornadasQueQuedan} ${b.jornadasQueQuedan === 1 ? 'jugador' : 'jugadores'}.`);
  }
  if (b.entran.length) {
    const uno = b.entran.length === 1;
    conserva.push(`${enLista(b.entran.map((j) => j.apodo))} `
      + `${uno ? 'entra' : 'entran'} y ${uno ? 'puede' : 'pueden'} cargar `
      + `${uno ? 'sus caballos' : 'los suyos'} desde su app.`);
  }

  if (b.mvpSeVa) pierde.push(`${b.mvp.apodo} era el MVP y sale: la práctica queda sin MVP.`);
  b.pierden.forEach((j) => {
    pierde.push(`${j.apodo} pierde ${j.chukkers.length === 1 ? 'el caballo del chukker' : 'los caballos de los chukkers'} `
      + `${enLista(j.chukkers.map(String))}.`);
  });
  b.sacados.forEach((j) => {
    pierde.push(j.lugares
      ? `${j.apodo} sale de la práctica: se borran los ${j.lugares} caballos que había cargado ese día.`
      : punto(`${j.apodo} sale de la práctica`));
  });

  return { conserva, pierde };
}

module.exports = {
  cambioDeFormatoValido, planillaEditada, chukkersPorJugador,
  balanceDeLaEdicion, balanceEnPalabras,
};
