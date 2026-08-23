/**
 * Sesiones y PIN.
 *
 * El PIN nunca se guarda en claro: se guarda un hash con sal (scrypt). La
 * sesión es una cookie firmada con SESSION_SECRET — el navegador no la puede
 * fabricar ni modificar sin la clave, que vive solo en el servidor.
 */

const crypto = require('crypto');

const DIAS_DE_SESION = 90;
const COOKIE = 'sd_sesion';

/* ------------------------------------------------------------------- PIN */

function hashDePin(pin, sal = crypto.randomBytes(16).toString('hex')) {
  const derivada = crypto.scryptSync(String(pin), sal, 32).toString('hex');
  return `scrypt$${sal}$${derivada}`;
}

function pinCoincide(pin, guardado) {
  if (!guardado) return false;
  const [algoritmo, sal, esperado] = String(guardado).split('$');
  if (algoritmo !== 'scrypt' || !sal || !esperado) return false;
  const derivada = crypto.scryptSync(String(pin), sal, 32).toString('hex');
  // Comparación de tiempo constante: comparar con === filtra por el tiempo que
  // tarda en fallar y deja adivinar el hash carácter por carácter.
  const a = Buffer.from(derivada, 'hex');
  const b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const pinValido = (pin) => /^\d{4}$/.test(String(pin || ''));

/* --------------------------------------------------------------- sesión */

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('Falta SESSION_SECRET (poné un texto largo y random).');
  }
  return s;
}

const b64 = (texto) => Buffer.from(texto, 'utf8').toString('base64url');
const deB64 = (texto) => Buffer.from(texto, 'base64url').toString('utf8');

function firmar(datos) {
  const cuerpo = b64(JSON.stringify(datos));
  const firma = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

function verificar(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma || '');
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(deB64(cuerpo));
    if (!datos.exp || datos.exp < Date.now()) return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function cookieDeSesion(jugador) {
  const token = firmar({
    id: jugador.id,
    admin: !!jugador.es_admin,
    exp: Date.now() + DIAS_DE_SESION * 86400000,
  });
  const partes = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${DIAS_DE_SESION * 86400}`,
  ];
  if (process.env.VERCEL) partes.push('Secure');
  return partes.join('; ');
}

const cookieVacia = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Lee la sesión de la cookie. Devuelve null si no hay o si no es válida. */
function sesionDe(req) {
  const crudo = req.headers.cookie || '';
  const par = crudo.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!par) return null;
  return verificar(par.slice(COOKIE.length + 1));
}

/** ¿Está el servidor en condiciones de firmar sesiones? */
function configuracionOk() {
  const s = process.env.SESSION_SECRET;
  return !!s && s.length >= 16;
}

module.exports = {
  hashDePin, pinCoincide, pinValido, configuracionOk,
  cookieDeSesion, cookieVacia, sesionDe,
  COOKIE, DIAS_DE_SESION,
};
