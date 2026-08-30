-- ===========================================================================
--  VOLVER A CARGAR LOS DATOS DEL RESPALDO
--  ---------------------------------------------------------------------
--  Esto va DESPUÉS de haber corrido `schema.sql` en la base nueva. Primero
--  las tablas vacías, después los datos.
--
--  Cómo se usa:
--
--    1. Abrí el archivo del respaldo (el que bajaste con
--       `respaldo-de-datos.sql`) con el Bloc de notas o TextEdit.
--       Con Word no: cambia las comillas y no funciona.
--    2. Copiá TODO lo que hay adentro, desde la primera llave `{` hasta la
--       última `}`. Si el archivo es un CSV y arriba de todo dice "respaldo"
--       en un renglón solo, ese renglón NO va: empezá desde la llave.
--    3. En este archivo, más abajo, donde dice PEGAR EL RESPALDO ACÁ,
--       borrá esa línea y pegá lo que copiaste. Queda entre las dos marcas
--       $json$ — no las toques, son las que aguantan las comillas de adentro.
--    4. Pegá todo este archivo en el SQL Editor de Supabase y tocá Run.
--
--  Se puede correr dos veces sin duplicar nada: lo que ya está, se saltea.
--  Y va todo junto o no va nada, así que si algo falla la base queda como
--  estaba. Al final te devuelve una tabla con cuántas filas quedó cada cosa:
--  esos números tienen que ser los mismos que tenías antes.
-- ===========================================================================

begin;

create temporary table _respaldo (j jsonb) on commit drop;

insert into _respaldo (j) values ($json$
PEGAR EL RESPALDO ACÁ (borrá este renglón y pegá desde la llave { hasta la } )
$json$::jsonb);

-- El orden no es capricho: cada tabla necesita que ya estén las de arriba.
insert into temporada
  select * from jsonb_populate_recordset(null::temporada, (select j->'temporada' from _respaldo))
  on conflict do nothing;

insert into jugador
  select * from jsonb_populate_recordset(null::jugador, (select j->'jugador' from _respaldo))
  on conflict do nothing;

insert into caballo
  select * from jsonb_populate_recordset(null::caballo, (select j->'caballo' from _respaldo))
  on conflict do nothing;

insert into lesion
  select * from jsonb_populate_recordset(null::lesion, (select j->'lesion' from _respaldo))
  on conflict do nothing;

insert into practica
  select * from jsonb_populate_recordset(null::practica, (select j->'practica' from _respaldo))
  on conflict do nothing;

insert into practica_jugador
  select * from jsonb_populate_recordset(null::practica_jugador, (select j->'practica_jugador' from _respaldo))
  on conflict do nothing;

insert into practica_partido
  select * from jsonb_populate_recordset(null::practica_partido, (select j->'practica_partido' from _respaldo))
  on conflict do nothing;

insert into torneo
  select * from jsonb_populate_recordset(null::torneo, (select j->'torneo' from _respaldo))
  on conflict do nothing;

insert into jornada
  select * from jsonb_populate_recordset(null::jornada, (select j->'jornada' from _respaldo))
  on conflict do nothing;

insert into jornada_chukker
  select * from jsonb_populate_recordset(null::jornada_chukker, (select j->'jornada_chukker' from _respaldo))
  on conflict do nothing;

insert into jornada_puntaje
  select * from jsonb_populate_recordset(null::jornada_puntaje, (select j->'jornada_puntaje' from _respaldo))
  on conflict do nothing;

insert into lluvia
  select * from jsonb_populate_recordset(null::lluvia, (select j->'lluvia' from _respaldo))
  on conflict do nothing;

insert into cancha_trabajo
  select * from jsonb_populate_recordset(null::cancha_trabajo, (select j->'cancha_trabajo' from _respaldo))
  on conflict do nothing;

insert into cancha_observacion
  select * from jsonb_populate_recordset(null::cancha_observacion, (select j->'cancha_observacion' from _respaldo))
  on conflict do nothing;

insert into observacion_cancha
  select * from jsonb_populate_recordset(null::observacion_cancha, (select j->'observacion_cancha' from _respaldo))
  on conflict do nothing;

commit;

-- El control: cuántas filas quedó cada tabla.
select 'jugador' as tabla, count(*) from jugador
union all select 'caballo', count(*) from caballo
union all select 'temporada', count(*) from temporada
union all select 'practica', count(*) from practica
union all select 'practica_jugador', count(*) from practica_jugador
union all select 'practica_partido', count(*) from practica_partido
union all select 'torneo', count(*) from torneo
union all select 'jornada', count(*) from jornada
union all select 'jornada_chukker', count(*) from jornada_chukker
union all select 'jornada_puntaje', count(*) from jornada_puntaje
union all select 'lesion', count(*) from lesion
union all select 'lluvia', count(*) from lluvia
union all select 'cancha_trabajo', count(*) from cancha_trabajo
union all select 'cancha_observacion', count(*) from cancha_observacion
union all select 'observacion_cancha', count(*) from observacion_cancha
order by tabla;
