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

/* ------------------------------------------------------- la llave maestra */

/**
 * Las dos llaves de la copia de prueba: un PIN que entra a cualquier jugador y
 * otro que entra también a los administradores. Sirven para mostrar la app sin
 * tener que repartir la clave de nadie.
 *
 * TRES CANDADOS, y los tres tienen que estar abiertos para que exista:
 *
 *   1. `AMBIENTE` vale exactamente `prueba`. En la app del club esa variable no
 *      está puesta, así que acá adentro las llaves directamente no existen. Este
 *      es el candado que importa: aunque alguien copiara las variables de un
 *      proyecto al otro, sin `AMBIENTE=prueba` no abren nada.
 *   2. La variable está cargada. Sin `PIN_MAESTRO`, no hay llave de jugador;
 *      sin `PIN_MAESTRO_ADMIN`, no hay llave de admin. Son independientes.
 *   3. Son cuatro dígitos. Cualquier otra cosa se ignora en silencio —mejor que
 *      quede sin llave a que quede una a medio configurar—.
 *
 * Se cambian en Vercel y valen desde el Redeploy siguiente. Ojo con lo que son:
 * una llave compartida, no una cuenta por persona. Cambiarla se la saca a
 * todos a la vez, no a uno solo.
 */
function llaveMaestraDe(cual) {
  if (process.env.AMBIENTE !== 'prueba') return null;
  const valor = String(
    (cual === 'admin' ? process.env.PIN_MAESTRO_ADMIN : process.env.PIN_MAESTRO) || '',
  );
  return pinValido(valor) ? valor : null;
}

/** Comparación de tiempo constante, para no filtrar la llave dígito por dígito. */
function mismoTexto(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * ¿Este PIN es una llave maestra que alcanza para entrar como este jugador?
 * Devuelve `'admin'`, `'jugador'` o `null`.
 *
 * La de admin abre cualquier nombre. La de jugador **no abre los de los
 * administradores**: el que viene a mirar la app entra a una ficha común, no a
 * la pantalla donde se arman las prácticas y se ven los handicaps internos.
 */
function llaveMaestra(pin, jugador) {
  const admin = llaveMaestraDe('admin');
  if (admin && mismoTexto(pin, admin)) return 'admin';
  const comun = llaveMaestraDe('jugador');
  if (comun && mismoTexto(pin, comun) && !jugador.es_admin) return 'jugador';
  return null;
}

/**
 * ¿Hay alguna llave cargada? Cuando la hay, la copia de prueba se entra
 * **solamente** con llave: se apaga el "la primera vez, el PIN que pongas queda
 * como el tuyo".
 *
 * Sin esto la llave de jugador no serviría de nada. Como en la base de prueba
 * nadie tiene PIN, el primero que tocara el nombre de un admin entraría igual
 * —y de paso le dejaría puesto un PIN a esa cuenta—. Con esto, el único que
 * llega a la parte de administrador es el que tiene la llave de admin.
 */
const hayLlaves = () => !!(llaveMaestraDe('jugador') || llaveMaestraDe('admin'));

/** Para /api/diagnostico: qué llaves hay, sin decir cuáles son. */
function estadoDeLlaves() {
  if (process.env.AMBIENTE !== 'prueba') return 'apagadas (esta no es la copia de prueba)';
  const hay = [
    llaveMaestraDe('jugador') ? 'jugador' : null,
    llaveMaestraDe('admin') ? 'admin' : null,
  ].filter(Boolean);
  if (!hay.length) return 'ninguna cargada';
  return 'prendidas: ' + hay.join(' y ');
}

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
  llaveMaestra, estadoDeLlaves, hayLlaves,
  cookieDeSesion, cookieVacia, sesionDe,
  COOKIE, DIAS_DE_SESION,
};
