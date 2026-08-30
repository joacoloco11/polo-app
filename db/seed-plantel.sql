-- ============================================================================
--  Plantel del club — correr después de db/schema.sql.
--  Se puede correr de nuevo sin duplicar a nadie: al que ya está le repone el
--  apodo, los dos handicaps, la categoría y el permiso de admin desde este
--  archivo.
--
--  Los apodos y los HCP internos son los que revisó Joaquín en la planilla del
--  30 de agosto de 2026: acá ya están como van. El HCP interno es el del club
--  —el que arma los equipos parejos— y no tiene por qué parecerse al de la AAP.
--
--  Los dos que figuran de baja al final no juegan más, pero no se borran:
--  siguen en el ranking con todo lo que jugaron.
-- ============================================================================

insert into jugador (nombre, apodo, handicap, hcp_interno, categoria, es_admin, activo) values
  ('Harriott Juan Eduardo (H)', 'Harriott J.',  6,  8, 'temporario', false, true ),
  ('Crespo Juan'              , 'Portu'      ,  5,  8, 'temporario', false, true ),
  ('Greguoli Juan Cruz'       , 'Greguoli'   ,  4,  6, 'temporario', false, true ),
  ('Sanchez Ezequiel'         , 'Sanchez E.' ,  4,  6, 'socio'     , false, true ),
  ('Venturino Eduardo'        , 'Ventu. Edu' ,  5,  6, 'socio'     , false, true ),
  ('Flores Catalino'          , 'Cacha'      ,  3,  5, 'temporario', false, true ),
  ('Galland Santiago'         , 'Galland'    ,  2,  5, 'temporario', false, true ),
  ('Gomez Juan'               , 'Gomez J.'   ,  2,  5, 'temporario', false, true ),
  ('Estrada Martin'           , 'Martin E.'  ,  2,  5, 'socio'     , false, true ),
  ('Neves Facundo'            , 'Neves F.'   ,  4,  5, 'temporario', false, true ),
  ('Neves Gaston'             , 'Neves G.'   ,  2,  5, 'temporario', false, true ),
  ('Orrico Anibal'            , 'Colo'       ,  1,  4, 'socio'     , true , true ),
  ('Abiad David'              , 'David'      ,  2,  4, 'temporario', false, true ),
  ('Ardissone Joaquin'        , 'Joaco'      ,  1,  4, 'socio'     , true , true ),
  ('Tassara Bruno'            , 'Tabru'      ,  2,  4, 'socio'     , true , true ),
  ('Kondujian Diego'          , 'Diego K.'   ,  0,  3, 'temporario', false, true ),
  ('Recupero Emiliano'        , 'Emi'        ,  0,  3, 'socio'     , true , true ),
  ('Luque Diego'              , 'Luque'      ,  0,  3, 'temporario', false, true ),
  ('Sanchez Mili'             , 'Mili'       ,  2,  3, 'socio'     , false, true ),
  ('Puentes Lucas'            , 'Puentes'    ,  1,  3, 'temporario', false, true ),
  ('Sanchez Juan Carlos'      , 'Sanchez JC' ,  1,  3, 'socio'     , false, true ),
  ('Bigio Sebastian'          , 'Seba B.'    ,  0,  3, 'socio'     , true , true ),
  ('Bogado Rafael'            , 'Bogado'     ,  2,  2, 'temporario', false, true ),
  ('Giglio Esteban'           , 'Giglio'     ,  0,  2, 'temporario', false, true ),
  ('Martinez Omar'            , 'Omar'       ,  0,  2, 'socio'     , false, true ),
  ('Ventana Nicolas'          , 'Ventana'    ,  0,  2, 'temporario', false, true ),
  ('Crescimone Agustin'       , 'Agus C.'    ,  0,  1, 'temporario', false, true ),
  ('Barreto Marcos'           , 'Barreto M.' ,  0,  1, 'temporario', false, true ),
  ('Gerike Maria'             , 'Gerike'     ,  0,  1, 'socio'     , false, true ),
  ('Prieri Ivo'               , 'Ivo'        ,  0,  1, 'socio'     , false, true ),
  ('Roman Gualdoni'           , 'Roman'      ,  0,  1, 'temporario', false, true ),
  ('Rovira Alberto'           , 'Rovira'     ,  0,  1, 'temporario', false, true ),
  ('Martinoglio Thomas'       , 'Tomy'       ,  0,  1, 'socio'     , false, true ),
  ('Barreto Carlos'           , 'Barreto C.' ,  0,  0, 'temporario', false, false),
  ('Villegas Noelia'          , 'Noe'        ,  0,  0, 'socio'     , false, true ),
  ('Orrico Matias'            , 'Orrico M.'  ,  0,  0, 'socio'     , false, false),
  ('Bogado Tito'              , 'Tito'       ,  0,  0, 'temporario', true , true )
on conflict (nombre) do update set
  apodo       = excluded.apodo,
  handicap    = excluded.handicap,
  hcp_interno = excluded.hcp_interno,
  categoria   = excluded.categoria,
  es_admin    = excluded.es_admin,
  activo      = excluded.activo;

-- Control. El editor de Supabase solo muestra el resultado de la última
-- consulta, así que el chequeo va como select y no como aviso.
select
  count(*)                                                 as jugadores,
  count(*) filter (where activo)                           as activos,
  count(*) filter (where es_admin)                         as admins,
  string_agg(apodo, ', ') filter (where es_admin)          as quienes,
  case when count(*) filter (where es_admin) = 6
       then 'OK' else 'REVISAR: tendrían que ser 6 admins' end as control
from jugador;
