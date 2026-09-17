/**
 * Editar una práctica ya publicada.
 *
 * Lo que se prueba acá son las cuentas: qué formato se puede cambiar por cuál,
 * cómo queda la planilla después del cambio, y —lo que más importa— qué
 * caballos se conservan y cuáles se pierden. Escribir en la base es cosa de
 * `rutas/practica.js`; lo que decide qué se borra es esto.
 *
 *   node --test app/tests/
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  cambioDeFormatoValido, planillaEditada, chukkersPorJugador,
  balanceDeLaEdicion, balanceEnPalabras,
} = require('../lib/edicion');
const { ErrorDeArmado } = require('../lib/polo');

/* Los diez de una práctica de 10, con el orden de la planilla. */
const DIEZ = [
  'Crespo', 'Diego K.', 'Flores', 'Mili', 'Tabru',
  'Sanchez E.', 'Ventu. Edu', 'Emi', 'David', 'Neves F.',
];
const plantel = (apodos) => apodos.map((a, i) => ({
  id: a, apodo: a, nombre: a, handicap: (i % 4) + 1,
}));
const elegidos = (pares) => pares.map(([id, color]) => ({ id, color }));

const DE_DIEZ = elegidos([
  ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Mili', 'azul'], ['Tabru', 'azul'],
  ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
  ['Neves F.', 'blanco'],
]);

/** La práctica tal como estaba guardada antes de tocarla. */
const PLANILLA_DE_DIEZ = planillaEditada(10, DE_DIEZ, plantel(DIEZ));
const ANTES_DE_DIEZ = {
  formato: 10,
  chukkers: 8,
  jugadores: DE_DIEZ.map(({ id, color }) => ({ id, apodo: id, color })),
};

/** Una jornada con los chukkers cargados enteros. */
const jornadaCon = (apodo, chukkers) => ({
  jornadaId: 'j-' + apodo,
  jugadorId: apodo,
  apodo,
  lugares: chukkers.map((c) => ({ chukker: c, mitad: 0 })),
});

/**
 * La jornada de alguien que cargó un caballo en cada chukker que le tocó. Es
 * lo normal y es contra lo que hay que medir qué se pierde: cargar un chukker
 * que uno no jugó no se puede.
 */
const jornadaCompleta = (apodo) =>
  jornadaCon(apodo, PLANILLA_DE_DIEZ.jugadores.find((j) => j.id === apodo).juega);

/* --------------------------------------------------- qué formato por cuál */

test('las de 8, 9 y 10 se pasan entre sí', () => {
  assert.equal(cambioDeFormatoValido(10, 9), null);
  assert.equal(cambioDeFormatoValido(9, 8), null);
  assert.equal(cambioDeFormatoValido(8, 10), null);
  assert.equal(cambioDeFormatoValido(10, 10), null);
});

test('una de 12 no cambia de formato, ni para adentro ni para afuera', () => {
  assert.match(cambioDeFormatoValido(12, 10), /no se puede pasar a otro formato/);
  assert.match(cambioDeFormatoValido(10, 12), /se arman aparte/);
  assert.equal(cambioDeFormatoValido(12, 12), null, 'cambiar jugadores sí se puede');
});

/* ------------------------------------------------------ la planilla nueva */

test('de 10 a 9: sale uno, uno pasa a bicolor y quedan 7 chukkers', () => {
  const nueve = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  const planilla = planillaEditada(9, nueve, plantel(DIEZ));

  assert.equal(planilla.cantidad, 9);
  assert.equal(planilla.chukkers, 7);
  assert.equal(planilla.jugadores.find((j) => j.id === 'Neves F.').color, 'bicolor');
  assert.equal(planilla.jugadores.length, 9);
  // El primero de cada equipo sigue siendo el que juega de más.
  assert.deepEqual(planilla.jugadores.find((j) => j.id === 'Crespo').sale, []);
});

test('la planilla editada respeta el orden en que llegan los jugadores', () => {
  // Diego K. primero: pasa a ser el que juega los 7 del azul.
  const nueve = elegidos([
    ['Diego K.', 'azul'], ['Crespo', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  const planilla = planillaEditada(9, nueve, plantel(DIEZ));
  assert.deepEqual(planilla.jugadores.find((j) => j.id === 'Diego K.').sale, []);
  assert.deepEqual(planilla.jugadores.find((j) => j.id === 'Crespo').sale, [1]);
});

test('si los cupos no cierran, no se arma nada', () => {
  const mal = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'azul'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  assert.throws(() => planillaEditada(9, mal, plantel(DIEZ)), ErrorDeArmado);
});

test('no se puede editar metiendo a alguien que no está en el plantel', () => {
  const nueve = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Fantasma', 'bicolor'],
  ]);
  assert.throws(() => planillaEditada(9, nueve, plantel(DIEZ)), /ya no están en el plantel/);
});

/* --------------------------------------------------- qué se conserva y qué no */

test('de 10 a 9 sacando a Mili: se caen los caballos del chukker 8', () => {
  const nueve = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  const planilla = planillaEditada(9, nueve, plantel(DIEZ));

  // Los cuatro cargaron un caballo en cada chukker que les tocó en la de 10.
  const jornadas = ['Crespo', 'Emi', 'Ventu. Edu', 'Mili'].map(jornadaCompleta);

  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ, planilla, jornadas, mvp: { id: 'Crespo', apodo: 'Crespo' },
  });

  assert.deepEqual(b.chukkersQueSeCaen, [8]);
  assert.equal(b.mvpSeVa, false);
  assert.deepEqual(b.sacados.map((s) => s.apodo), ['Mili']);
  assert.equal(b.sacados[0].lugares, 6, 'los seis caballos de Mili se van con ella');

  // El 8 lo pierden todos los que lo tenían; y el que cambió de lugar en la
  // rotación pierde además el chukker que pasó a descansar.
  const pierde = new Map(b.pierden.map((p) => [p.apodo, p.chukkers]));
  assert.deepEqual(pierde.get('Crespo'), [8]);
  assert.deepEqual(pierde.get('Emi'), [6, 8]);
  assert.deepEqual(pierde.get('Ventu. Edu'), [5, 8]);
  assert.equal(b.conservados, 15);
});

test('cambiar un jugador por otro sin tocar el formato no pierde ningún caballo', () => {
  const otros = DE_DIEZ.map((e) => (e.id === 'Mili' ? { id: 'Pedrito', color: 'azul' } : e));
  const planilla = planillaEditada(10, otros, plantel([...DIEZ, 'Pedrito']));

  const jornadas = ['Crespo', 'Emi'].map(jornadaCompleta);
  const b = balanceDeLaEdicion({ antes: ANTES_DE_DIEZ, planilla, jornadas, mvp: null });

  assert.deepEqual(b.chukkersQueSeCaen, []);
  assert.deepEqual(b.pierden, [], 'el que entra toma el lugar del que sale: nadie se corre');
  assert.equal(b.conservados, 13);
  assert.deepEqual(b.entran.map((j) => j.apodo), ['Pedrito']);
  assert.deepEqual(b.sacados.map((s) => s.apodo), ['Mili']);
});

test('el que se queda pero pasa a descansar otro chukker pierde ese caballo', () => {
  // Emi era el tercero del blanco (sale 1 y 2) y pasa a ser el primero: ahora
  // juega los 8 y descansa ninguno, pero Sanchez E. pasa a descansar el 5.
  const dados = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Mili', 'azul'], ['Tabru', 'azul'],
    ['Emi', 'blanco'], ['Ventu. Edu', 'blanco'], ['Sanchez E.', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'blanco'],
  ]);
  const planilla = planillaEditada(10, dados, plantel(DIEZ));
  const juega = chukkersPorJugador(planilla);

  assert.equal(juega.get('Emi').has(5), false, 'el primero del blanco descansa el 5');
  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ, planilla, jornadas: [jornadaCompleta('Emi')], mvp: null,
  });
  assert.deepEqual(b.pierden[0].chukkers, [5], 'Emi tenía cargado el 5 y ahora descansa ese');
  assert.equal(b.conservados, 5);
});

test('los medios chukkers se cuentan de a uno, no de a chukker', () => {
  const nueve = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  const planilla = planillaEditada(9, nueve, plantel(DIEZ));
  const conMedios = {
    jornadaId: 'j-Emi', jugadorId: 'Emi', apodo: 'Emi',
    lugares: [{ chukker: 7, mitad: 1 }, { chukker: 7, mitad: 2 }, { chukker: 8, mitad: 1 }],
  };
  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ, planilla, jornadas: [conMedios], mvp: null,
  });
  assert.equal(b.pierden[0].lugares, 1);
  assert.deepEqual(b.pierden[0].cuales, ['8a']);
  assert.equal(b.conservados, 2, 'los dos medios del 7 quedan');
});

test('si el MVP sale de la práctica, la práctica queda sin MVP', () => {
  const otros = DE_DIEZ.map((e) => (e.id === 'Crespo' ? { id: 'Pedrito', color: 'azul' } : e));
  const planilla = planillaEditada(10, otros, plantel([...DIEZ, 'Pedrito']));
  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ, planilla, jornadas: [], mvp: { id: 'Crespo', apodo: 'Crespo' },
  });
  assert.equal(b.mvpSeVa, true);
  assert.match(balanceEnPalabras(b).pierde.join(' '), /queda sin MVP/);
});

/* ------------------------------------------------------- lo que se lee */

test('el balance se dice en criollo, con nombres y números', () => {
  const nueve = elegidos([
    ['Crespo', 'azul'], ['Diego K.', 'azul'], ['Flores', 'azul'], ['Tabru', 'azul'],
    ['Sanchez E.', 'blanco'], ['Ventu. Edu', 'blanco'], ['Emi', 'blanco'], ['David', 'blanco'],
    ['Neves F.', 'bicolor'],
  ]);
  const planilla = planillaEditada(9, nueve, plantel(DIEZ));
  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ,
    planilla,
    jornadas: [jornadaCon('Emi', [7, 8]), jornadaCon('Mili', [1, 2])],
    mvp: { id: 'Crespo', apodo: 'Crespo' },
  });
  const { conserva, pierde } = balanceEnPalabras(b);

  assert.match(conserva.join(' '), /Pasa de 10 a 9 jugadores: de 8 a 7 chukkers/);
  assert.match(conserva.join(' '), /El resultado queda como está/);
  assert.match(conserva.join(' '), /El MVP sigue siendo Crespo/);
  assert.match(pierde.join(' '), /Emi pierde el caballo del chukker 8/);
  assert.match(pierde.join(' '), /Mili sale de la práctica: se borran los 2 caballos/);
});

test('sin cambios de formato ni de gente, no se pierde nada', () => {
  const planilla = planillaEditada(10, DE_DIEZ, plantel(DIEZ));
  const b = balanceDeLaEdicion({
    antes: ANTES_DE_DIEZ, planilla,
    jornadas: [jornadaCon('Crespo', [1, 2, 3])], mvp: null,
  });
  assert.deepEqual(balanceEnPalabras(b).pierde, []);
  assert.equal(b.conservados, 3);
  assert.match(balanceEnPalabras(b).conserva[0], /Sigue siendo de 10 y de 8 chukkers/);
});
