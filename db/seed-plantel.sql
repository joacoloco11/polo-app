-- ============================================================================
--  Plantel del club — correr después de db/schema.sql.
--  Se puede correr de nuevo sin duplicar a nadie: al que ya está le repone el
--  apodo, el handicap de la AAP, la categoría y el permiso de admin desde este
--  archivo. El HCP interno solo se pisa si sigue en 0, así no se pierde el
--  trabajo de ajustarlos a mano.
--  El HCP interno arranca igual al de la AAP: hay que ajustarlo a mano después.
--  Los apodos están puestos a ojo salvo los que aparecen en las planillas de
--  Tito (Joaco, Tabru, Seba B., Diego K., Ventu. Edu, Colo): revisarlos.
-- ============================================================================

insert into jugador (nombre, apodo, handicap, hcp_interno, categoria, es_admin) values
  ('Venturino Eduardo', 'Ventu. Edu', 5, 5, 'socio', false),
  ('Crespo Juan', 'Crespo', 5, 5, 'temporario', false),
  ('Sanchez Ezequiel', 'Sanchez E.', 4, 4, 'socio', false),
  ('Neves Facundo', 'Neves F.', 4, 4, 'temporario', false),
  ('Greguoli Juan Cruz', 'Greguoli', 4, 4, 'temporario', false),
  ('Flores Catalino', 'Flores', 3, 3, 'temporario', false),
  ('Tassara Bruno', 'Tabru', 2, 2, 'socio', true),
  ('Sanchez Mili', 'Mili', 2, 2, 'socio', false),
  ('Neves Gaston', 'Neves G.', 2, 2, 'temporario', false),
  ('Gomez Juan', 'Gomez J.', 2, 2, 'temporario', false),
  ('Abiad David', 'David', 2, 2, 'temporario', false),
  ('Bogado Rafael', 'Bogado', 2, 2, 'temporario', false),
  ('Ardissone Joaquin', 'Joaco', 1, 1, 'socio', true),
  ('Orrico Anibal', 'Colo', 1, 1, 'socio', true),
  ('Sanchez Juan Carlos', 'Sanchez JC', 1, 1, 'socio', false),
  ('Puentes Lucas', 'Puentes', 1, 1, 'temporario', false),
  ('Bigio Sebastian', 'Seba B.', 0, 0, 'socio', true),
  ('Gerike Maria', 'Gerike', 0, 0, 'socio', false),
  ('Recupero Emiliano', 'Emi', 0, 0, 'socio', true),
  ('Martinez Omar', 'Omar', 0, 0, 'socio', false),
  ('Giglio Esteban', 'Giglio', 0, 0, 'temporario', false),
  ('Kondujian Diego', 'Diego K.', 0, 0, 'temporario', false),
  ('Ventana Nicolas', 'Ventana', 0, 0, 'temporario', false),
  ('Gomez Barroso Rodrigo', 'Barroso', 0, 0, 'temporario', false),
  ('Luque Diego', 'Luque', 0, 0, 'temporario', false),
  ('Barreto Marcos', 'Barreto M.', 0, 0, 'temporario', false),
  ('Giacoppo Fabricio', 'Giacoppo', 0, 0, 'temporario', false),
  ('Orrico Matias', 'Orrico M.', -1, -1, 'socio', false),
  ('Prieri Ivo', 'Prieri', -1, -1, 'socio', false),
  ('Villegas Noelia', 'Noe', -1, -1, 'socio', false),
  ('Martinoglio Thomas', 'Tommy', -1, -1, 'socio', false),
  ('Rovira Alberto', 'Rovira', -1, -1, 'temporario', false),
  ('Roman Gualdoni', 'Gualdoni', -1, -1, 'temporario', false),
  ('Barreto Carlos', 'Barreto C.', -2, -2, 'temporario', false),
  ('Bogado Tito', 'Tito', 0, 0, 'temporario', true)
on conflict (nombre) do update set
  apodo       = excluded.apodo,
  handicap    = excluded.handicap,
  categoria   = excluded.categoria,
  es_admin    = excluded.es_admin,
  -- El HCP interno se ajusta a mano: solo se pisa si todavía está sin tocar.
  hcp_interno = case when jugador.hcp_interno = 0 then excluded.hcp_interno else jugador.hcp_interno end;

-- Control. El editor de Supabase solo muestra el resultado de la última
-- consulta, así que el chequeo va como select y no como aviso.
select
  count(*)                                                as jugadores,
  count(*) filter (where es_admin)                        as admins,
  string_agg(apodo, ', ') filter (where es_admin)          as quienes,
  case when count(*) filter (where es_admin) = 6
       then 'OK' else 'REVISAR: tendrían que ser 6 admins' end as control
from jugador;
