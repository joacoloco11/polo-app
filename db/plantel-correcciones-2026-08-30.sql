-- ============================================================================
--  PLANTEL — correcciones de la planilla del 30 de agosto de 2026
--  ------------------------------------------------------------------------
--  Cómo se usa:
--    1. Entrá a supabase.com y abrí tu proyecto.
--    2. Barra de la izquierda → SQL Editor → + New query.
--    3. Borrá lo que haya en el recuadro y pegá TODO este archivo.
--    4. Tocá Run. Abajo te queda una tabla de control: fijate que los
--       números coincidan con los que dice el final de este archivo.
--
--  Va todo junto o no va nada: si algo falla, la base queda como estaba.
--  Se puede correr dos veces sin romper nada.
--
--  33 jugadores corregidos · 4 nuevos · 2 que salen
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) LOS 33 QUE SIGUEN. Se busca por nombre y apellido, que es lo único
--    que no cambia. El PIN, el cumpleaños y todo lo que jugaron no se tocan.
-- ---------------------------------------------------------------------------
update jugador set apodo = 'Ventu. Edu', handicap = 5, hcp_interno = 6, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Venturino Eduardo');
update jugador set apodo = 'Portu', handicap = 5, hcp_interno = 8, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Crespo Juan');
update jugador set apodo = 'Sanchez E.', handicap = 4, hcp_interno = 6, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Sanchez Ezequiel');
update jugador set apodo = 'Neves F.', handicap = 4, hcp_interno = 5, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Neves Facundo');
update jugador set apodo = 'Greguoli', handicap = 4, hcp_interno = 6, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Greguoli Juan Cruz');
update jugador set apodo = 'Cacha', handicap = 3, hcp_interno = 5, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Flores Catalino');
update jugador set apodo = 'Tabru', handicap = 2, hcp_interno = 4, categoria = 'socio', es_admin = true, activo = true
  where lower(nombre) = lower('Tassara Bruno');
update jugador set apodo = 'Mili', handicap = 2, hcp_interno = 3, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Sanchez Mili');
update jugador set apodo = 'Neves G.', handicap = 2, hcp_interno = 5, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Neves Gaston');
update jugador set apodo = 'Gomez J.', handicap = 2, hcp_interno = 5, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Gomez Juan');
update jugador set apodo = 'David', handicap = 2, hcp_interno = 4, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Abiad David');
update jugador set apodo = 'Bogado', handicap = 2, hcp_interno = 2, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Bogado Rafael');
update jugador set apodo = 'Joaco', handicap = 1, hcp_interno = 4, categoria = 'socio', es_admin = true, activo = true
  where lower(nombre) = lower('Ardissone Joaquin');
update jugador set apodo = 'Colo', handicap = 1, hcp_interno = 4, categoria = 'socio', es_admin = true, activo = true
  where lower(nombre) = lower('Orrico Anibal');
update jugador set apodo = 'Sanchez JC', handicap = 1, hcp_interno = 3, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Sanchez Juan Carlos');
update jugador set apodo = 'Puentes', handicap = 1, hcp_interno = 3, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Puentes Lucas');
update jugador set apodo = 'Seba B.', handicap = 0, hcp_interno = 3, categoria = 'socio', es_admin = true, activo = true
  where lower(nombre) = lower('Bigio Sebastian');
update jugador set apodo = 'Gerike', handicap = 0, hcp_interno = 1, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Gerike Maria');
update jugador set apodo = 'Emi', handicap = 0, hcp_interno = 3, categoria = 'socio', es_admin = true, activo = true
  where lower(nombre) = lower('Recupero Emiliano');
update jugador set apodo = 'Omar', handicap = 0, hcp_interno = 2, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Martinez Omar');
update jugador set apodo = 'Giglio', handicap = 0, hcp_interno = 2, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Giglio Esteban');
update jugador set apodo = 'Diego K.', handicap = 0, hcp_interno = 3, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Kondujian Diego');
update jugador set apodo = 'Ventana', handicap = 0, hcp_interno = 2, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Ventana Nicolas');
update jugador set apodo = 'Luque', handicap = 0, hcp_interno = 3, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Luque Diego');
update jugador set apodo = 'Barreto M.', handicap = 0, hcp_interno = 1, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Barreto Marcos');
update jugador set apodo = 'Orrico M.', handicap = 0, hcp_interno = 0, categoria = 'socio', es_admin = false, activo = false
  where lower(nombre) = lower('Orrico Matias');   -- de baja
update jugador set apodo = 'Ivo', handicap = 0, hcp_interno = 1, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Prieri Ivo');
update jugador set apodo = 'Noe', handicap = 0, hcp_interno = 0, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Villegas Noelia');
update jugador set apodo = 'Tomy', handicap = 0, hcp_interno = 1, categoria = 'socio', es_admin = false, activo = true
  where lower(nombre) = lower('Martinoglio Thomas');
update jugador set apodo = 'Rovira', handicap = 0, hcp_interno = 1, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Rovira Alberto');
update jugador set apodo = 'Roman', handicap = 0, hcp_interno = 1, categoria = 'temporario', es_admin = false, activo = true
  where lower(nombre) = lower('Roman Gualdoni');
update jugador set apodo = 'Barreto C.', handicap = 0, hcp_interno = 0, categoria = 'temporario', es_admin = false, activo = false
  where lower(nombre) = lower('Barreto Carlos');   -- de baja
update jugador set apodo = 'Tito', handicap = 0, hcp_interno = 0, categoria = 'temporario', es_admin = true, activo = true
  where lower(nombre) = lower('Bogado Tito');

-- ---------------------------------------------------------------------------
-- 2) LOS 4 NUEVOS. Si alguno ya estuviera cargado, se le corrigen los
--    datos en vez de duplicarlo.
-- ---------------------------------------------------------------------------
insert into jugador (nombre, apodo, handicap, hcp_interno, categoria, es_admin) values
  ('Galland Santiago', 'Galland', 2, 5, 'temporario', false),
  ('Crescimone Agustin', 'Agus C.', 0, 1, 'temporario', false),
  ('Estrada Martin', 'Martin E.', 2, 5, 'socio', false),
  ('Harriott Juan Eduardo (H)', 'Harriott J.', 6, 8, 'temporario', false)
on conflict (nombre) do update set
  apodo       = excluded.apodo,
  handicap    = excluded.handicap,
  hcp_interno = excluded.hcp_interno,
  categoria   = excluded.categoria,
  es_admin    = excluded.es_admin,
  activo      = true;

-- ---------------------------------------------------------------------------
-- 3) LOS 2 QUE SALEN DEL PLANTEL.
--
--    Se borran de verdad, PERO solo si no jugaron ninguna práctica. Al que
--    jugó no se lo puede borrar sin borrar también las prácticas donde está,
--    y una práctica de 8 a la que le falta un jugador queda rota para
--    siempre. A ese, el paso 4 lo deja de baja: desaparece de todas las
--    listas y no se pierde nada de lo que jugó.
--
--    Borrar a alguien se lleva puestos sus caballos y las jornadas que
--    cargó. Eso es a propósito: son suyos.
-- ---------------------------------------------------------------------------
delete from jugador j
 where lower(j.nombre) in (lower('Gomez Barroso Rodrigo'), lower('Giacoppo Fabricio'))
   and not exists (select 1 from practica_jugador pj where pj.jugador_id = j.id);

-- 4) El que no se pudo borrar porque ya había jugado, queda de baja.
update jugador set activo = false
 where lower(nombre) in (lower('Gomez Barroso Rodrigo'), lower('Giacoppo Fabricio'));

commit;

-- ---------------------------------------------------------------------------
-- EL CONTROL. Estos son los números que tienen que dar:
--   activos 35 · de baja 2 · administradores 6
--   'salieron del plantel' tiene que decir 0. Si dice 1 o 2, es que esos
--   ya habían jugado y quedaron de baja en vez de borrados.
-- ---------------------------------------------------------------------------
select
  (select count(*) from jugador where activo)               as activos,
  (select count(*) from jugador where not activo)           as de_baja,
  (select count(*) from jugador where es_admin)             as administradores,
  (select count(*) from jugador where lower(nombre) in (lower('Gomez Barroso Rodrigo'), lower('Giacoppo Fabricio')))
                                                            as no_se_pudieron_borrar,
  (select count(*) from jugador)                            as total;

-- Y el plantel como quedó, para mirarlo de un vistazo.
select apodo, nombre, handicap as aap, hcp_interno as interno, categoria,
       case when es_admin then 'admin' else '' end as rol,
       case when activo then '' else 'DE BAJA' end as estado
  from jugador order by activo desc, hcp_interno desc, apodo;

