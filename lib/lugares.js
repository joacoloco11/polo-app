/**
 * El lugar de un caballo en una jornada.
 *
 * Un caballo puede hacer el chukker entero o media cancha y salir, y ahí entra
 * otro. Así que el lugar no es "el chukker 3": es "el 3 entero", "el primer
 * medio del 3" o "el segundo medio del 3".
 *
 * Adentro viaja como un texto corto, que es lo que se usa de clave en la
 * pantalla y en lo que se guarda:
 *
 *     "3"    el chukker 3 entero          vale 1
 *     "3a"   el primer medio del 3        vale 0,5
 *     "3b"   el segundo medio del 3       vale 0,5
 *
 * En la base son dos columnas —`chukker` y `mitad`, con 0 para el entero—
 * porque ahí hay que poder contar y agrupar; en el código es un texto, porque
 * ahí hay que poder usarlo de clave. Este archivo es el único que traduce.
 */

/** De las dos columnas de la base al texto. */
const lugarDe = (chukker, mitad) =>
  String(chukker) + (mitad === 1 ? 'a' : mitad === 2 ? 'b' : '');

/** Del texto a las dos columnas. Devuelve null si no es un lugar. */
function leerLugar(clave) {
  const m = /^(\d{1,2})([ab]?)$/.exec(String(clave || ''));
  if (!m) return null;
  const chukker = Number(m[1]);
  if (chukker < 1 || chukker > 24) return null;
  return { chukker, mitad: m[2] === 'a' ? 1 : m[2] === 'b' ? 2 : 0 };
}

/** Cuánto pesa ese lugar en la carga del caballo. */
const pesoDeLugar = (clave) => (/[ab]$/.test(String(clave)) ? 0.5 : 1);

/** Los dos medios de un chukker: 3 → ["3a", "3b"]. */
const mediosDe = (chukker) => [chukker + 'a', chukker + 'b'];

/** El número de chukker de un lugar: "3b" → 3. */
const chukkerDe = (clave) => Number(String(clave).replace(/[ab]$/, ''));

module.exports = { lugarDe, leerLugar, pesoDeLugar, mediosDe, chukkerDe };
