-- ===========================================================================
--  RESPALDO DE LOS DATOS
--  ---------------------------------------------------------------------
--  Esto NO es el código de la app: es lo que está cargado adentro. Los
--  jugadores, las prácticas, los caballos, las canchas, todo.
--
--  Cómo se usa (5 minutos, no rompe nada, se puede repetir cuando quieras):
--
--    1. Entrá a supabase.com y abrí tu proyecto.
--    2. Barra de la izquierda → SQL Editor → + New query.
--    3. Pegá TODO este archivo y tocá Run.
--    4. Abajo aparece una sola fila con una sola columna, "respaldo".
--    5. Arriba a la derecha del resultado hay un botón de descarga
--       (Download CSV / Export). Bajalo y guardá ese archivo.
--
--  Ese archivo es la foto de la base al momento de correrlo. Guardalo junto
--  al zip del código: con los dos se rearma todo.
--
--  OJO: adentro van los PIN encriptados de todos los jugadores. Guardalo
--  como guardás la clave del banco: no lo mandes por el grupo de WhatsApp.
--
--  Para volver a cargarlo hace falta darme el archivo: no es pegar y correr,
--  hay que respetar el orden de las tablas. Con el archivo alcanza.
-- ===========================================================================

select jsonb_pretty(jsonb_build_object(
  'sacado_el',           now(),
  'version_del_esquema', '15 tablas · 4 vistas · 26 politicas',

  -- El orden importa para volver a cargarlo: primero lo que otros cuelgan.
  'temporada',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from temporada t),
  'jugador',             (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from jugador t),
  'caballo',             (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from caballo t),
  'lesion',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from lesion t),
  'practica',            (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from practica t),
  'practica_jugador',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from practica_jugador t),
  'practica_partido',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from practica_partido t),
  'torneo',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from torneo t),
  'jornada',             (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from jornada t),
  'jornada_chukker',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from jornada_chukker t),
  'jornada_puntaje',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from jornada_puntaje t),
  'lluvia',              (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from lluvia t),
  'cancha_trabajo',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from cancha_trabajo t),
  'cancha_observacion',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from cancha_observacion t),
  'observacion_cancha',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from observacion_cancha t)
)) as respaldo;
