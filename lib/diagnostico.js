/**
 * Traduce las fallas de conexión a algo que se pueda leer sin abrir los logs.
 * Nunca devuelve la dirección de la base ni la contraseña: solo qué está mal.
 */

function explicar(e) {
  const mensaje = String((e && e.message) || e);
  const codigo = e && e.code;

  if (/Falta DATABASE_URL/i.test(mensaje)) {
    return 'Falta cargar DATABASE_URL en Vercel (Settings → Environment Variables) y volver a publicar.';
  }
  if (/Falta SESSION_SECRET/i.test(mensaje)) {
    return 'Falta cargar SESSION_SECRET en Vercel (Settings → Environment Variables) y volver a publicar.';
  }
  if (codigo === '28P01' || /password authentication failed/i.test(mensaje)) {
    return 'La contraseña de la base no coincide. Revisá que en DATABASE_URL hayas reemplazado [YOUR-PASSWORD] por la tuya, sin los corchetes.';
  }
  if (codigo === '3D000' || /database .* does not exist/i.test(mensaje)) {
    return 'La dirección apunta a una base que no existe. Copiá de nuevo la línea de Supabase.';
  }
  if (codigo === 'ENOTFOUND' || /getaddrinfo/i.test(mensaje)) {
    return 'No se encuentra el servidor de la base. La dirección de DATABASE_URL está incompleta o mal copiada.';
  }
  if (codigo === 'ETIMEDOUT' || codigo === 'ECONNREFUSED' || /timeout/i.test(mensaje)) {
    return 'La base no responde. Si el proyecto de Supabase estuvo una semana sin uso puede estar pausado: entrá al panel y reanudalo.';
  }
  if (codigo === '42P01' || /relation .* does not exist/i.test(mensaje)) {
    return 'La base está conectada pero le faltan las tablas. Corré db/schema.sql en el SQL Editor de Supabase.';
  }
  if (/SASL|SCRAM|client password must be a string/i.test(mensaje)) {
    return 'A DATABASE_URL le falta la contraseña. Fijate que entre los dos puntos y el arroba haya algo.';
  }
  return null;
}

module.exports = { explicar };
