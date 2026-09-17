/**
 * El plantel para la pantalla de entrada: nombre, apodo y si ya activó su PIN.
 * Es lo único que se sirve sin sesión, porque hay que elegirse de una lista
 * antes de poder entrar. No incluye handicaps ni nada del PIN.
 */

const { consultar } = require('../db');
const { ok, publico } = require('../http');
const { AMBIENTE, ANOTACION } = require('../version');
const { hayLlave } = require('../sesion');

module.exports = publico(async (req, res) => {
  const jugadores = await consultar(`
    select id, nombre, apodo, (pin_puesto_en is not null) as activado
    from jugador
    where activo
    order by apodo
  `);
  // El ambiente viaja también acá y no solo en /api/sesion: la pantalla de
  // entrada es justo donde alguien puede confundir una app con la otra.
  // `conLlave` le avisa a la pantalla que acá no se da de alta ningún PIN: hay
  // que entrar con el que te pasaron. Sin esto diría "el PIN que pongas ahora
  // queda como el tuyo", que en la copia de prueba ya no es cierto.
  ok(res, { jugadores, ambiente: AMBIENTE, conLlave: hayLlave(), conAnotacion: ANOTACION });
});
