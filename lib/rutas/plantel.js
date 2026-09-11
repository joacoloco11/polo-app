/**
 * El plantel para la pantalla de entrada: nombre, apodo y si ya activó su PIN.
 * Es lo único que se sirve sin sesión, porque hay que elegirse de una lista
 * antes de poder entrar. No incluye handicaps ni nada del PIN.
 */

const { consultar } = require('../db');
const { ok, publico } = require('../http');
const { AMBIENTE } = require('../version');

module.exports = publico(async (req, res) => {
  const jugadores = await consultar(`
    select id, nombre, apodo, (pin_puesto_en is not null) as activado
    from jugador
    where activo
    order by apodo
  `);
  // El ambiente viaja también acá y no solo en /api/sesion: la pantalla de
  // entrada es justo donde alguien puede confundir una app con la otra.
  ok(res, { jugadores, ambiente: AMBIENTE });
});
