/** Ayudas comunes a todas las funciones de servidor. */

const { sesionDe } = require('./sesion');
const { explicar } = require('./diagnostico');

function responder(res, codigo, datos, cabeceras = {}) {
  Object.entries(cabeceras).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(codigo).send(JSON.stringify(datos));
}

const ok = (res, datos, cabeceras) => responder(res, 200, datos, cabeceras);
const error = (res, codigo, mensaje) => responder(res, codigo, { error: mensaje });

/** Envuelve un handler: corta si no hay sesión, y si `soloAdmin`, si no es admin. */
function conSesion(handler, { soloAdmin = false } = {}) {
  return async (req, res) => {
    let sesion;
    try {
      sesion = sesionDe(req);
    } catch (e) {
      return error(res, 500, explicar(e) || 'El servidor está mal configurado.');
    }
    if (!sesion) return error(res, 401, 'Entrá de nuevo.');
    if (soloAdmin && !sesion.admin) return error(res, 403, 'Esto es solo para administradores.');
    try {
      return await handler(req, res, sesion);
    } catch (e) {
      console.error(e);
      return error(res, 500, explicar(e) || 'Algo falló del lado del servidor.');
    }
  };
}

/** Igual pero sin exigir sesión, con el mismo manejo de errores. */
function publico(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (e) {
      console.error(e);
      return error(res, 500, explicar(e) || 'Algo falló del lado del servidor.');
    }
  };
}

function cuerpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return req.body;
}

const soloMetodo = (req, res, metodo) => {
  if (req.method !== metodo) { error(res, 405, 'Método no permitido.'); return false; }
  return true;
};

module.exports = { ok, error, conSesion, publico, cuerpo, soloMetodo };
