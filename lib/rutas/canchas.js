/**
 * Las canchas del club.
 *
 *   GET  /api/canchas     cuánto se usó cada una
 *   POST /api/canchas     suma un partido de torneo (solo administradores)
 *
 * Cuenta dos cosas por cancha: las **prácticas**, que salen solas de lo que se
 * arma en la app, y los **partidos de torneo** —Copa San Diego, fechas de la
 * AAP—, que no se arman acá pero sí ocupan cancha y los carga un admin a mano.
 */

const { consultar, unaFila } = require('../db');
const { ok, error, conSesion, cuerpo } = require('../http');

const CANCHAS = 6;
const TIPOS = ['copa', 'aap'];

async function listar(res) {
  const temporada = await unaFila(
    `select id, nombre, to_char(desde, 'YYYY-MM-DD') as desde,
            to_char(hasta, 'YYYY-MM-DD') as hasta
     from temporada where activa limit 1`,
  );
  if (!temporada) return ok(res, { temporada: null, canchas: [], torneos: [], dias: [] });

  // Lo que importa de una cancha es cuánto se jugó encima: los chukkers.
  const canchas = await consultar(
    `with usos as (
       select p.cancha, 'practica' as clase, p.chukkers::int as chukkers
       from practica p where p.temporada_id = $1
       union all
       select t.cancha, 'torneo' as clase, t.chukkers::int
       from torneo t where t.temporada_id = $1
     )
     select cancha,
            count(*) filter (where clase = 'practica')::int as practicas,
            count(*) filter (where clase = 'torneo')::int   as partidos,
            count(*)::int                                   as total,
            sum(chukkers)::int                              as chukkers
     from usos
     group by cancha
     order by chukkers desc, cancha`,
    [temporada.id],
  );

  const torneos = await consultar(
    `select t.id, t.nombre, t.tipo, to_char(t.fecha, 'YYYY-MM-DD') as fecha,
            to_char(t.hora, 'HH24:MI') as hora, t.cancha, t.chukkers
     from torneo t
     where t.temporada_id = $1
     order by t.fecha desc, t.hora desc nulls last
     limit 60`,
    [temporada.id],
  );

  // Día por día: con qué se usó cada cancha y cuándo. El gráfico de la pantalla
  // agrupa por semana, pero necesita la fecha exacta para pararse en los días en
  // que realmente se jugó.
  const dias = await consultar(
    `select to_char(p.fecha, 'YYYY-MM-DD') as fecha, p.cancha, 'practica' as clase
     from practica p where p.temporada_id = $1 and p.cancha is not null
     union all
     select to_char(t.fecha, 'YYYY-MM-DD'), t.cancha, 'torneo'
     from torneo t where t.temporada_id = $1 and t.cancha is not null
     order by 1, 2`,
    [temporada.id],
  );

  ok(res, { temporada, canchas, torneos, dias });
}

async function sumarTorneo(req, res, sesion) {
  const datos = cuerpo(req);
  const nombre = String(datos.nombre || '').trim().slice(0, 80);
  if (nombre.length < 3) return error(res, 400, 'Poné el nombre del torneo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || ''))) {
    return error(res, 400, 'Falta la fecha del partido.');
  }
  const cancha = Number(datos.cancha);
  if (!Number.isInteger(cancha) || cancha < 1 || cancha > CANCHAS) {
    return error(res, 400, `La cancha es un número del 1 al ${CANCHAS}.`);
  }
  const tipo = TIPOS.includes(datos.tipo) ? datos.tipo : 'copa';
  const hora = /^\d{2}:\d{2}$/.test(String(datos.hora || '')) ? datos.hora : null;

  const chukkers = Number(datos.chukkers || 6);
  if (!Number.isInteger(chukkers) || chukkers < 1 || chukkers > 12) {
    return error(res, 400, 'Los chukkers van de 1 a 12.');
  }

  const temporada = await unaFila('select id from temporada where activa limit 1');
  if (!temporada) return error(res, 409, 'No hay temporada activa.');

  const torneo = await unaFila(
    `insert into torneo (temporada_id, nombre, tipo, fecha, hora, cancha, chukkers, creado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, nombre, tipo, to_char(fecha, 'YYYY-MM-DD') as fecha,
               to_char(hora, 'HH24:MI') as hora, cancha, chukkers`,
    [temporada.id, nombre, tipo, datos.fecha, hora, cancha, chukkers, sesion.id],
  );
  ok(res, { torneo });
}

async function borrarTorneo(req, res) {
  const id = new URL(req.url, 'http://app').searchParams.get('id');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return error(res, 400, 'Falta el partido.');
  const fila = await unaFila('delete from torneo where id = $1 returning id', [id]);
  if (!fila) return error(res, 404, 'Ese partido no existe.');
  ok(res, { borrado: fila.id });
}

module.exports = conSesion(async (req, res, sesion) => {
  if (req.method === 'GET') return listar(res);
  if (!sesion.admin) return error(res, 403, 'Cargar torneos es solo para administradores.');
  if (req.method === 'POST') return sumarTorneo(req, res, sesion);
  if (req.method === 'DELETE') return borrarTorneo(req, res);
  return error(res, 405, 'Método no permitido.');
});
