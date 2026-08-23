/** Cerrar sesión en este teléfono. */

const { ok, publico } = require('../http');
const { cookieVacia } = require('../sesion');

module.exports = publico(async (req, res) => {
  ok(res, { listo: true }, { 'Set-Cookie': cookieVacia() });
});
