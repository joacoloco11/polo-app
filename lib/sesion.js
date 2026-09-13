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
 * La llave de la copia de prueba: **un solo PIN que abre cualquier nombre de la
 * lista**, sea jugador o administrador. Sirve para mostrar la app entera sin
 * repartir la clave de nadie — y la parte que vale la pena mostrar es
 * justamente la de administrador, donde se arman las prácticas.
 *
 * Hubo una versión con dos llaves, una que abría solo jugadores y otra que
 * abría todo. Se descartó: para lo que se usa esto —enseñar la app— la
 * distinción no servía de nada y eran dos cosas que explicar y dos que
 * mantener.
 *
 * TRES CANDADOS, y los tres tienen que estar abiertos para que exista:
 *
 *   1. `AMBIENTE` vale exactamente `prueba`. En la app del club esa variable no
 *      está puesta, así que acá adentro la llave directamente no existe. Este es
 *      el candado que importa: aunque alguien copiara `PIN_MAESTRO` de un
 *      proyecto al otro, sin `AMBIENTE=prueba` no abre nada.
 *   2. `PIN_MAESTRO` está cargada.
 *   3. Son cuatro dígitos. Cualquier otra cosa se ignora en silencio —mejor que
 *      quede sin llave a que quede una a medio configurar—.
 *
 * Se cambia en Vercel y vale desde el Redeploy siguiente. Ojo con lo que es:
 * una llave compartida, no una cuenta por persona. Cambiarla se la saca a
 * todos a la vez, no a uno solo.
 */
function laLlave() {
  if (process.env.AMBIENTE !== 'prueba') return null;
  const valor = String(process.env.PIN_MAESTRO || '');
  return pinValido(valor) ? valor : null;
}

/** Comparación de tiempo constante, para no filtrar la llave dígito por dígito. */
function mismoTexto(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** ¿Este PIN es la llave maestra? */
function esLlaveMaestra(pin) {
  const llave = laLlave();
  return !!llave && mismoTexto(pin, llave);
}

/**
 * ¿Hay llave cargada? Cuando la hay, la copia de prueba se entra **solamente**
 * con la llave: se apaga el "la primera vez, el PIN que pongas queda como el
 * tuyo".
 *
 * Sin eso, como en la base de prueba nadie tiene PIN, el primero que tocara un
 * nombre entraría igual —y de paso le dejaría puesto un PIN a esa cuenta,
 * cerrándosela al resto—.
 */
const hayLlave = () => !!laLlave();

/** Para /api/diagnostico: si hay llave, sin decir cuál es. */
function estadoDeLlave() {
  if (process.env.AMBIENTE !== 'prueba') return 'apagada (esta no es la copia de prueba)';
  return laLlave() ? 'prendida' : 'falta cargar PIN_MAESTRO';
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

/**
 * La huella de una llave: un resumen corto que no permite reconstruirla.
 *
 * Es lo que hace que cambiar una llave **eche a los que habían entrado con
 * ella**. La sesión se guarda con la huella de la llave que se usó, y en cada
 * pedido se vuelve a calcular: si el PIN cambió, ya no coincide y la sesión deja
 * de valer en el acto. Sin esto, cambiar el PIN solo cerraba la puerta de
 * entrada y el que ya estaba adentro seguía 90 días.
 */
function huellaDeLlave() {
  const valor = laLlave();
  if (!valor) return null;
  return crypto.createHmac('sha256', secreto())
    .update('llave:' + valor)
    .digest('base64url')
    .slice(0, 16);
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
    // La sesión que entró con la llave vale mientras esa llave siga siendo la
    // misma. Cambiar el PIN en Vercel deja afuera en el acto a todos los que
    // estaban adentro con el anterior. En la app del club ninguna sesión lleva
    // huella, así que las cookies de los 37 no se tocan.
    if (datos.huella && datos.huella !== huellaDeLlave()) return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function cookieDeSesion(jugador, conLlave) {
  const token = firmar({
    id: jugador.id,
    admin: !!jugador.es_admin,
    exp: Date.now() + DIAS_DE_SESION * 86400000,
    ...(conLlave ? { huella: huellaDeLlave() } : {}),
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
  esLlaveMaestra, estadoDeLlave, hayLlave,
  cookieDeSesion, cookieVacia, sesionDe,
  COOKIE, DIAS_DE_SESION,
};
