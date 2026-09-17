/**
 * Guardar los caballos de una jornada.
 *
 *   POST /api/jornada
 *     { practicaId | jornadaId, uso: {chukker: caballoId},
 *       puntajes: {caballoId: 1..10}, observaciones }
 *
 * Se guarda entera y de una: lo que llega reemplaza lo que había. Es lo que
 * espera la pantalla, donde el jugador toca chukkers hasta que queda como
 * jugó y recién ahí guarda.
 *
 * La jornada de una práctica se crea sola la primera vez que alguien carga
 * algo: no tiene sentido pedirle al jugador que la abra antes.
 */

const { unaFila, transaccion } = require('../db');
const { ok, error, conSesion, cuerpo, soloMetodo } = require('../http');
const { leerLugar, mediosDe, chukkerDe } = require('../lugares');
const { companerosDe } = require('../caballada');

const rango = (n) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Qué lugares se pueden llenar. Un chukker que me tocó se puede cargar entero
 * —"3"— o partido en dos medios —"3a" y "3b"—, así que los tres valen. Lo que
 * no se puede es llenar el entero Y además una de sus mitades: eso sumaría de
 * más en la carga del caballo, y se revisa aparte.
 */
const abiertos = (chukkers, soloMedios) => new Set(chukkers.flatMap((c) =>
  (soloMedios ? mediosDe(c) : [String(c), ...mediosDe(c)])));

module.exports = conSesion(async (req, res, sesion) => {
  if (!soloMetodo(req, res, 'POST')) return;

  const datos = cuerpo(req);
  const uso = datos.uso && typeof datos.uso === 'object' ? datos.uso : {};
  const puntajes = datos.puntajes && typeof datos.puntajes === 'object' ? datos.puntajes : {};
  const observaciones = String(datos.observaciones || '').trim().slice(0, 400);

  /* ---- de qué jornada estamos hablando, y qué chukkers le tocaron */

  let jornada;
  let misChukkers;
  let soloMedios = false;

  if (datos.practicaId) {
    const fila = await unaFila(
      `select p.id, to_char(p.fecha, 'YYYY-MM-DD') as fecha, p.chukkers, pj.sale
       from practica p
       join practica_jugador pj on pj.practica_id = p.id and pj.jugador_id = $2
       where p.id = $1`,
      [datos.practicaId, sesion.id],
    );
    if (!fila) return error(res, 404, 'No jugaste esa práctica.');
    // Que la práctica esté cerrada es cosa de la planilla, no del cuaderno de
    // caballos: el jugador anota los suyos cuando puede, incluso semanas
    // después. Por eso acá no se mira el estado.
    const sale = (fila.sale || []).map(Number);
    misChukkers = rango(fila.chukkers).filter((c) => !sale.includes(c));

    jornada = await unaFila(
      `insert into jornada (jugador_id, practica_id, fecha, chukkers, observaciones)
       values ($1, $2, $3, $4, nullif($5, ''))
       on conflict (jugador_id, practica_id)
         do update set observaciones = nullif($5, ''), actualizada_en = now()
       returning id`,
      [sesion.id, fila.id, fila.fecha, fila.chukkers, observaciones],
    );
  } else if (datos.jornadaId) {
    jornada = await unaFila(
      `update jornada set observaciones = nullif($3, ''), actualizada_en = now()
       where id = $1 and jugador_id = $2
       returning id, chukkers, medios`,
      [datos.jornadaId, sesion.id, observaciones],
    );
    if (!jornada) return error(res, 404, 'Esa jornada no es tuya.');
    // En el partido de a medio se juegan todos los chukkers, pero cada uno se
    // llena por mitades: no hay lugar entero que valga.
    misChukkers = rango(jornada.chukkers);
    soloMedios = !!jornada.medios;
  } else {
    return error(res, 400, 'Falta decir de qué práctica o partido es.');
  }

  /* ---- validar antes de escribir */

  const puestos = Object.entries(uso)
    .filter(([, caballoId]) => caballoId)
    .map(([lugar, caballoId]) => ({
      lugar: String(lugar), sitio: leerLugar(lugar), caballoId: String(caballoId),
    }));

  const raro = puestos.find((p) => !p.sitio);
  if (raro) return error(res, 400, `No entiendo el lugar "${raro.lugar}".`);

  const puedo = abiertos(misChukkers, soloMedios);
  const fuera = puestos.find((p) => !puedo.has(p.lugar));
  if (fuera) {
    return error(res, 400, `El lugar ${fuera.lugar} no es tuyo en esa jornada.`);
  }

  // El chukker entero y su mitad no pueden estar los dos: serían 1,5 chukkers
  // donde se jugó 1. La pantalla no deja, pero esto es lo que lo garantiza.
  const porChukker = new Map();
  puestos.forEach((p) => {
    const lista = porChukker.get(p.sitio.chukker) || [];
    lista.push(p.sitio.mitad);
    porChukker.set(p.sitio.chukker, lista);
  });
  for (const [chukker, mitades] of porChukker) {
    if (mitades.includes(0) && mitades.length > 1) {
      return error(res, 400, `El chukker ${chukker} está cargado entero y por mitades.`);
    }
  }

  const usados = [...new Set([...puestos.map((p) => p.caballoId), ...Object.keys(puntajes)])];
  if (usados.length) {
    // La caballada con la que puedo trabajar es la mía más la de los del grupo,
    // si acepté compartirla. Sin grupo, esto es exactamente lo de siempre.
    const companeros = await companerosDe(sesion.id);
    const mios = await unaFila(
      `select count(*)::int as cuantos from caballo
        where jugador_id = any($1::uuid[]) and id = any($2::uuid[])`,
      [companeros, usados],
    );
    if (mios.cuantos !== usados.length) {
      return error(res, 400, 'Hay un caballo que no es de tu caballada.');
    }
  }

  const notas = Object.entries(puntajes)
    .filter(([, n]) => n !== null && n !== undefined && n !== '')
    .map(([caballoId, n]) => [String(caballoId), Number(n)]);
  if (notas.some(([, n]) => !Number.isInteger(n) || n < 1 || n > 10)) {
    return error(res, 400, 'El puntaje va del 1 al 10.');
  }

  /* ---- guardar: lo que llega reemplaza lo que había */

  await transaccion(async (tx) => {
    await tx.consultar('delete from jornada_chukker where jornada_id = $1', [jornada.id]);
    await tx.consultar('delete from jornada_puntaje where jornada_id = $1', [jornada.id]);
    for (const p of puestos) {
      await tx.consultar(
        `insert into jornada_chukker (jornada_id, chukker, mitad, caballo_id)
         values ($1, $2, $3, $4)`,
        [jornada.id, p.sitio.chukker, p.sitio.mitad, p.caballoId],
      );
    }
    for (const [caballoId, puntaje] of notas) {
      await tx.consultar(
        'insert into jornada_puntaje (jornada_id, caballo_id, puntaje) values ($1, $2, $3)',
        [jornada.id, caballoId, puntaje],
      );
    }
  });

  // `faltan` cuenta chukkers sin nada cargado, no lugares: con las mitades, un
  // chukker puede estar a medio llenar y no es lo mismo que vacío.
  const tocados = new Set(puestos.map((p) => chukkerDe(p.lugar)));
  ok(res, {
    jornadaId: jornada.id,
    chukkers: puestos.length,
    faltan: misChukkers.filter((c) => !tocados.has(c)).length,
  });
});
