/**
 * El cumpleaños: qué fecha vale y cuándo se festeja.
 *
 * El día de hoy entra siempre como argumento, así que estas pruebas dan lo
 * mismo hoy que en marzo. Los casos que importan son los dos que la fecha
 * tiene de raros: el salto de año —en octubre, un cumpleaños de enero es del
 * año que viene— y el 29 de febrero.
 *
 *   node --test app/tests/
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { leerNacimiento, comoViene, enPalabras, cumplesDe } = require('../lib/cumple');

/* ------------------------------------------------- qué fecha se acepta */

test('una fecha bien escrita entra tal cual', () => {
  assert.deepEqual(leerNacimiento('1979-03-12'), { fecha: '1979-03-12' });
});

test('vacío no es un error: es sacar la fecha que había', () => {
  assert.deepEqual(leerNacimiento(''), { fecha: null });
  assert.deepEqual(leerNacimiento(null), { fecha: null });
  assert.deepEqual(leerNacimiento(undefined), { fecha: null });
  assert.deepEqual(leerNacimiento('   '), { fecha: null });
});

test('lo que no es una fecha se rechaza', () => {
  assert.match(leerNacimiento('12/03/1979').error, /día, mes y año/);
  assert.match(leerNacimiento('1979-3-12').error, /día, mes y año/);
  assert.match(leerNacimiento('ayer').error, /día, mes y año/);
});

test('un día que no existe en el calendario se rechaza', () => {
  assert.match(leerNacimiento('1979-02-31').error, /no existe en el calendario/);
  assert.match(leerNacimiento('1979-13-01').error, /no existe en el calendario/);
  // El 29 de febrero de un año bisiesto sí existe.
  assert.deepEqual(leerNacimiento('1992-02-29'), { fecha: '1992-02-29' });
});

test('no se puede nacer antes de 1920 ni en el futuro', () => {
  assert.match(leerNacimiento('1919-05-05').error, /no puede ser/);
  assert.match(leerNacimiento('2099-05-05').error, /no puede ser/);
});

/* ----------------------------------------------------- cuándo cumple */

test('un cumpleaños que todavía no pasó es de este año', () => {
  const c = comoViene('1979-12-25', '2026-10-01');
  assert.equal(c.dias, 85);
  assert.equal(c.cumple, 47);
});

test('uno que ya pasó salta al año que viene', () => {
  // El 5 de enero visto desde octubre es el de 2027, no el de 2026.
  const c = comoViene('1979-01-05', '2026-10-01');
  assert.equal(c.dias, 96);
  assert.equal(c.cumple, 48, 'cumple los del año que viene');
});

test('el que cumple hoy queda en cero días', () => {
  const c = comoViene('1979-10-01', '2026-10-01');
  assert.equal(c.dias, 0);
  assert.equal(c.cumple, 47);
});

test('el 29 de febrero se festeja el 28 cuando el año no es bisiesto', () => {
  const noBisiesto = comoViene('1992-02-29', '2026-10-01');
  assert.equal(noBisiesto.dia, 29, 'guardado sigue siendo el 29');
  assert.equal(noBisiesto.diaFestejo, 28, 'pero en 2027 se festeja el 28');
  assert.equal(noBisiesto.mesFestejo, 2);

  const bisiesto = comoViene('1992-02-29', '2027-12-01');
  assert.equal(bisiesto.diaFestejo, 29, 'en 2028 cae el 29 de verdad');
});

/* ------------------------------------------------------ cómo se lee */

test('la frase dice los que cumple y qué día de la semana cae', () => {
  const p = enPalabras('1979-03-12', '2026-10-01');
  assert.equal(p.titulo, 'Cumple 48 el viernes 12 de marzo');
  assert.equal(p.cuando, 'Faltan 162 días.');
});

test('hoy y mañana se dicen con esas palabras, no con un número', () => {
  assert.equal(enPalabras('1979-10-01', '2026-10-01').titulo, 'Cumple 47 hoy');
  assert.equal(enPalabras('1979-10-01', '2026-10-01').cuando, 'Es hoy.');
  assert.equal(enPalabras('1979-10-02', '2026-10-01').cuando, 'Es mañana.');
});

test('sin fecha no hay frase', () => {
  assert.equal(enPalabras(null, '2026-10-01'), null);
  assert.equal(comoViene('', '2026-10-01'), null);
});

/* ------------------------------------------------ el cartel del plantel */

const PLANTEL = [
  { apodo: 'Crespo', nombre: 'Crespo Martín', fecha_nacimiento: '1980-10-14' },
  { apodo: 'Joaco', nombre: 'Ardissone Joaquín', fecha_nacimiento: '1979-10-01' },
  { apodo: 'Tabru', nombre: 'Brunet Tomás', fecha_nacimiento: '1985-03-12' },
  { apodo: 'Diego K.', nombre: 'Krasñansky Diego', fecha_nacimiento: '1977-10-01' },
  { apodo: 'Mili', nombre: 'Militello Juan', fecha_nacimiento: null },
  { apodo: 'Neves F.', nombre: 'Neves Facundo', fecha_nacimiento: null },
];

test('el cartel separa a los de hoy del próximo', () => {
  const c = cumplesDe(PLANTEL, '2026-10-01');
  assert.deepEqual(c.hoy.map((x) => x.apodo), ['Diego K.', 'Joaco'],
    'los dos de hoy, en orden alfabético');
  assert.equal(c.proximo.apodo, 'Crespo');
  assert.equal(c.proximo.dias, 13);
});

test('el cartel cuenta cuántos faltan', () => {
  const c = cumplesDe(PLANTEL, '2026-10-01');
  assert.equal(c.cargados, 4);
  assert.equal(c.total, 6);
});

test('sin nadie cargado, no hay próximo', () => {
  const c = cumplesDe([{ apodo: 'Mili', fecha_nacimiento: null }], '2026-10-01');
  assert.deepEqual(c.hoy, []);
  assert.equal(c.proximo, null);
  assert.equal(c.cargados, 0);
});
