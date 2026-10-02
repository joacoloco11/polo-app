/**
 * El cumpleaños de cada uno.
 *
 * Es un dato chico pero con tres lugares que lo tocan —la pantalla de entrada
 * donde cada uno carga el suyo, el plantel donde el administrador los corrige,
 * y el cartel que avisa quién cumple— así que la cuenta vive acá y no en cada
 * uno.
 *
 * **El año va.** La base guarda una fecha entera y eso es lo que se pide. Si
 * alguna vez hace falta cargar solo el día y el mes, es otra columna y otro
 * SQL; hoy no está.
 */

/** Hoy en el huso del club: a las 21 de Buenos Aires en UTC ya es otro día. */
function hoyEnArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Lee lo que llegó de una pantalla. Devuelve:
 *
 *   { fecha: '1979-03-12' }   una fecha buena
 *   { fecha: null }           vacío: es sacar la que había, y vale
 *   { error: '…' }            cualquier otra cosa
 *
 * Se devuelve un objeto y no la fecha pelada justamente para poder distinguir
 * "la borro" de "está mal escrita": las dos llegan como algo que no es fecha.
 */
function leerNacimiento(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor).trim();
  if (!texto) return { fecha: null };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { error: 'Poné la fecha como día, mes y año.' };
  }

  // Que el calendario exista: el 31 de febrero pasa el formato pero no es un día.
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return { error: 'Ese día no existe en el calendario.' };
  }

  const esteAno = Number(hoyEnArgentina().slice(0, 4));
  if (ano < 1920 || ano > esteAno) return { error: 'Esa fecha no puede ser.' };
  if (texto > hoyEnArgentina()) return { error: 'Esa fecha todavía no llegó.' };

  return { fecha: texto };
}

/**
 * Cuándo cumple y cuántos. `hoyISO` entra como argumento para poder probarlo
 * sin depender del día en que se corran las pruebas.
 */
function comoViene(fechaISO, hoyISO = hoyEnArgentina()) {
  if (!fechaISO) return null;
  const [ano, mes, dia] = String(fechaISO).slice(0, 10).split('-').map(Number);
  const hoy = new Date(hoyISO + 'T12:00:00');

  let cuando = new Date(hoy.getFullYear(), mes - 1, dia, 12);
  // El 29 de febrero en un año que no es bisiesto cae en el 1 de marzo. Es lo
  // que hace el calendario solo y es lo que el club festeja igual.
  if (cuando.getMonth() !== mes - 1) cuando = new Date(hoy.getFullYear(), mes, 0, 12);
  if (cuando < hoy) {
    cuando = new Date(hoy.getFullYear() + 1, mes - 1, dia, 12);
    if (cuando.getMonth() !== mes - 1) cuando = new Date(hoy.getFullYear() + 1, mes, 0, 12);
  }

  const dias = Math.round((cuando - hoy) / 86400000);
  return {
    // El día y el mes como están guardados: es lo que se muestra de "12/3".
    dia,
    mes,
    ano,
    dias,
    // Y el día en que se festeja, que puede no ser el mismo: el 29 de febrero,
    // en un año que no es bisiesto, el club lo festeja el 28.
    diaFestejo: cuando.getDate(),
    mesFestejo: cuando.getMonth() + 1,
    // Los que cumple ese día, no los que tiene hoy.
    cumple: cuando.getFullYear() - ano,
    diaSemana: DIAS[cuando.getDay()],
    nombreDelMes: MESES[cuando.getMonth()],
  };
}

/** La frase que se lee en la ficha: "Cumple 47 el jueves 12 de marzo". */
function enPalabras(fechaISO, hoyISO = hoyEnArgentina()) {
  const c = comoViene(fechaISO, hoyISO);
  if (!c) return null;
  const cuando = `el ${c.diaSemana} ${c.diaFestejo} de ${c.nombreDelMes}`;
  return {
    titulo: c.dias === 0 ? `Cumple ${c.cumple} hoy` : `Cumple ${c.cumple} ${cuando}`,
    cuando: c.dias === 0 ? 'Es hoy.'
      : c.dias === 1 ? 'Es mañana.'
        : `Faltan ${c.dias} días.`,
    dias: c.dias,
    edad: c.cumple,
  };
}

/**
 * Quiénes cumplen hoy y quién es el próximo, de una lista de jugadores. Se
 * calcula en JavaScript y no en SQL porque el 29 de febrero y el salto de año
 * se leen más claros así.
 */
function cumplesDe(filas, hoyISO = hoyEnArgentina()) {
  const conDias = filas
    .filter((j) => j.fecha_nacimiento)
    .map((j) => ({ apodo: j.apodo, nombre: j.nombre, ...comoViene(j.fecha_nacimiento, hoyISO) }))
    .sort((a, b) => a.dias - b.dias || a.apodo.localeCompare(b.apodo));

  return {
    hoy: conDias.filter((x) => x.dias === 0),
    proximo: conDias.find((x) => x.dias > 0) || null,
    cargados: conDias.length,
    total: filas.length,
  };
}

module.exports = { hoyEnArgentina, leerNacimiento, comoViene, enPalabras, cumplesDe, DIAS, MESES };
