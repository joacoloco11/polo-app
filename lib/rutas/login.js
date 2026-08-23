/**
 * Entrar.
 *
 * La primera vez que alguien toca su nombre, el PIN que escribe queda como el
 * suyo. Las siguientes, tiene que coincidir. A los 5 errores seguidos la cuenta
 * queda trabada 15 minutos: con 4 dígitos, sin ese freno, probar las 10.000
 * combinaciones es cuestión de un rato.
 */

const { unaFila, consultar } = require('../db');
const { ok, error, publico, cuerpo, soloMetodo } = require('../http');
const { hashDePin, pinCoincide, pinValido, cookieDeSesion, configuracionOk } = require('../sesion');

const INTENTOS_PERMITIDOS = 5;
const MINUTOS_DE_ESPERA = 15;

module.exports = publico(async (req, res) => {
  if (!soloMetodo(req, res, 'POST')) return;

  // Antes que nada: si no se puede firmar la sesión, no tiene sentido seguir.
  // Si esto se chequeara al final, el PIN quedaría guardado y el jugador afuera.
  if (!configuracionOk()) {
    return error(res, 500, 'Falta cargar SESSION_SECRET en Vercel (Settings → Environment Variables) y volver a publicar.');
  }

  const { jugadorId, pin } = cuerpo(req);
  if (!jugadorId) return error(res, 400, 'Elegí tu nombre de la lista.');
  if (!pinValido(pin)) return error(res, 400, 'El PIN son 4 números.');

  const jugador = await unaFila(
    `select id, nombre, apodo, es_admin, activo, pin_hash, pin_puesto_en,
            pin_intentos, pin_bloqueado_hasta
     from jugador where id = $1`,
    [jugadorId],
  );
  if (!jugador || !jugador.activo) return error(res, 404, 'Ese jugador no está en el plantel.');

  if (jugador.pin_bloqueado_hasta && new Date(jugador.pin_bloqueado_hasta) > new Date()) {
    const faltan = Math.ceil((new Date(jugador.pin_bloqueado_hasta) - new Date()) / 60000);
    return error(res, 429, `Demasiados intentos. Probá de nuevo en ${faltan} minutos.`);
  }

  const primeraVez = !jugador.pin_puesto_en;

  if (primeraVez) {
    await consultar(
      `update jugador
         set pin_hash = $2, pin_puesto_en = now(), pin_intentos = 0, pin_bloqueado_hasta = null
       where id = $1`,
      [jugador.id, hashDePin(pin)],
    );
  } else if (pinCoincide(pin, jugador.pin_hash)) {
    if (jugador.pin_intentos > 0) {
      await consultar(
        'update jugador set pin_intentos = 0, pin_bloqueado_hasta = null where id = $1',
        [jugador.id],
      );
    }
  } else {
    const intentos = (jugador.pin_intentos || 0) + 1;
    const traba = intentos >= INTENTOS_PERMITIDOS;
    await consultar(
      `update jugador
         set pin_intentos = $2,
             pin_bloqueado_hasta = case when $3 then now() + interval '${MINUTOS_DE_ESPERA} minutes' else null end
       where id = $1`,
      [jugador.id, traba ? 0 : intentos, traba],
    );
    return error(
      res,
      401,
      traba
        ? `PIN incorrecto. Por seguridad la cuenta queda trabada ${MINUTOS_DE_ESPERA} minutos.`
        : 'PIN incorrecto.',
    );
  }

  ok(
    res,
    {
      jugador: {
        id: jugador.id, nombre: jugador.nombre, apodo: jugador.apodo, admin: !!jugador.es_admin,
      },
      primeraVez,
    },
    { 'Set-Cookie': cookieDeSesion(jugador) },
  );
});
