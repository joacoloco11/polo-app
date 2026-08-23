-- ============================================================================
--  Club de Campo San Diego — app de prácticas, v2
--  Esquema para Supabase (PostgreSQL).
--  Se puede correr las veces que haga falta: si algo ya existe, lo deja como
--  está en lugar de fallar. No borra datos.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- catálogos

do $$ begin
  create type color_equipo as enum ('azul', 'blanco', 'colorado', 'bicolor');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type categoria_jugador as enum ('socio', 'temporario', 'invitado');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type tipo_practica as enum ('practica', 'copa', 'aap');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type estado_practica as enum ('borrador', 'publicada', 'cerrada');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- temporadas

create table if not exists temporada (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                    -- 'Primavera 2026'
  desde       date not null,
  hasta       date,
  activa      boolean not null default false,
  creada_en   timestamptz not null default now()
);

-- Una sola temporada activa a la vez.
create unique index if not exists temporada_activa_unica on temporada (activa) where activa;

-- ---------------------------------------------------------------- jugadores

create table if not exists jugador (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,                  -- 'Ardissone Joaquin'
  apodo         text not null,                  -- 'Joaco' — es lo que sale en la planilla
  handicap      smallint not null default 0,    -- el oficial de la AAP
  -- El del club. Es el que manda para ordenar el plantel y balancear equipos:
  -- el de la AAP se guarda pero no se usa para armar.
  hcp_interno   smallint not null default 0,
  categoria     categoria_jugador not null default 'invitado',
  invitado_por  uuid references jugador (id) on delete set null,
  -- Acceso del jugador: elige su nombre de la lista y, la primera vez, elige su
  -- PIN de 4 dígitos. Nunca se guarda el PIN en claro.
  pin_hash      text,
  pin_puesto_en timestamptz,                    -- null = todavía no activó su cuenta
  es_admin      boolean not null default false, -- puede armar y cerrar prácticas
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  -- Dos jugadores no comparten nombre completo: es lo que hace que el seed
  -- se pueda correr de nuevo sin duplicar el plantel.
  constraint jugador_nombre_unico unique (nombre)
);

-- Si la tabla ya existía de una corrida anterior, le falta lo que se agregó
-- después. Esto la pone al día sin tocar los datos.
alter table jugador add column if not exists hcp_interno   smallint not null default 0;
alter table jugador add column if not exists pin_puesto_en timestamptz;
-- Freno a la fuerza bruta sobre el PIN.
alter table jugador add column if not exists pin_intentos        smallint not null default 0;
alter table jugador add column if not exists pin_bloqueado_hasta timestamptz;

alter table jugador drop constraint if exists jugador_nombre_unico;
alter table jugador add  constraint jugador_nombre_unico unique (nombre);

create index if not exists jugador_activo_idx on jugador (activo) where activo;

-- ----------------------------------------------------------------- caballos

create table if not exists caballo (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  jugador_id uuid not null references jugador (id) on delete cascade,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  unique (jugador_id, nombre)
);

-- Un caballo lesionado sigue siendo del jugador y conserva su historia: se
-- marca, no se apaga. `activo` es otra cosa — es el que ya no está más.
alter table caballo add column if not exists lesionado        boolean not null default false;
alter table caballo add column if not exists lesionado_desde  date;

-- ---------------------------------------------------------------- prácticas

create table if not exists practica (
  id            uuid primary key default gen_random_uuid(),
  temporada_id  uuid not null references temporada (id) on delete restrict,
  fecha         date not null,
  hora          time not null,
  cancha        smallint not null,
  tipo          tipo_practica not null default 'practica',
  -- El formato define todo lo demás: equipos, chukkers y rotación.
  formato       smallint not null check (formato in (8, 9, 10, 12)),
  chukkers      smallint not null check (chukkers between 6 and 9),
  estado        estado_practica not null default 'borrador',
  mvp_id        uuid references jugador (id) on delete set null,
  notas         text,
  creada_por    uuid references jugador (id) on delete set null,
  creada_en     timestamptz not null default now(),
  cerrada_en    timestamptz
);

create index if not exists practica_temporada_fecha_idx on practica (temporada_id, fecha desc);

-- La cantidad de chukkers no es libre: sale del formato.
create or replace function chukkers_del_formato(formato smallint)
returns smallint language sql immutable as $$
  select case formato when 8 then 6 when 9 then 7 when 10 then 8 when 12 then 9 end::smallint;
$$;

alter table practica drop constraint if exists practica_chukkers_coherentes;
alter table practica
  add constraint practica_chukkers_coherentes
  check (chukkers = chukkers_del_formato(formato));

-- ------------------------------------------------- jugadores de una práctica

create table if not exists practica_jugador (
  practica_id uuid not null references practica (id) on delete cascade,
  jugador_id  uuid not null references jugador (id) on delete restrict,
  equipo      color_equipo not null,
  -- Orden dentro del equipo: define la rotación (el primero es el que más juega).
  orden       smallint not null,
  -- Chukkers que NO juega — lo que en la planilla va entre paréntesis.
  sale        smallint[] not null default '{}',
  -- Solo para el bicolor: de qué lado juega cada chukker, {"1":"azul","5":"blanco"}.
  juega_de    jsonb,
  primary key (practica_id, jugador_id),
  unique (practica_id, equipo, orden)
);

-- El bicolor existe únicamente en las prácticas de 9.
create or replace function equipo_valido_para_formato()
returns trigger language plpgsql as $$
declare f smallint;
begin
  select formato into f from practica where id = new.practica_id;
  if new.equipo = 'bicolor' and f <> 9 then
    raise exception 'El bicolor solo existe en las prácticas de 9 jugadores (esta es de %).', f;
  end if;
  if new.equipo = 'colorado' and f <> 12 then
    raise exception 'El colorado solo existe en las prácticas de 12 jugadores (esta es de %).', f;
  end if;
  return new;
end;
$$;

drop trigger if exists practica_jugador_equipo_valido on practica_jugador;
create trigger practica_jugador_equipo_valido
  before insert or update on practica_jugador
  for each row execute function equipo_valido_para_formato();

-- --------------------------------------------------------------- resultados
--
-- Una práctica de 8, 9 o 10 es un partido solo: azul contra blanco. Una de 12
-- son tres, uno por franja de chukkers — por eso el resultado no cuelga del
-- equipo sino del enfrentamiento.

create table if not exists practica_partido (
  practica_id uuid not null references practica (id) on delete cascade,
  orden       smallint not null check (orden between 1 and 3),
  equipo_a    color_equipo not null check (equipo_a <> 'bicolor'),
  equipo_b    color_equipo not null check (equipo_b <> 'bicolor'),
  goles_a     smallint check (goles_a >= 0),
  goles_b     smallint check (goles_b >= 0),
  primary key (practica_id, orden),
  constraint partido_entre_dos check (equipo_a <> equipo_b),
  -- O están los dos marcadores o no está ninguno: medio resultado no sirve.
  constraint partido_resultado_entero check ((goles_a is null) = (goles_b is null))
);

-- La versión anterior guardaba un gol por equipo y no servía para las de 12.
-- Nunca llegó a usarse.
drop table if exists practica_resultado;

-- ------------------------------------------------------------------- torneos
--
-- Los partidos de torneo del club —Copa San Diego, fechas de la AAP— que no se
-- arman con la app pero sí ocupan cancha. Se cargan a mano y son los que en la
-- solapa Canchas aparecen como "partidos", al lado de las prácticas.

create table if not exists torneo (
  id           uuid primary key default gen_random_uuid(),
  temporada_id uuid not null references temporada (id) on delete restrict,
  nombre       text not null,                    -- 'Copa San Diego'
  tipo         tipo_practica not null default 'copa' check (tipo <> 'practica'),
  fecha        date not null,
  hora         time,
  cancha       smallint not null check (cancha between 1 and 6),
  jugadores    smallint check (jugadores between 0 and 24),
  creado_por   uuid references jugador (id) on delete set null,
  creado_en    timestamptz not null default now()
);

create index if not exists torneo_temporada_fecha_idx on torneo (temporada_id, fecha desc);

-- ------------------------------------------------------------------ jornadas
--
-- Una jornada es un día de caballos de UN jugador. Hay de dos clases y se
-- guardan iguales, porque para el caballo son lo mismo:
--
--   * la práctica del club  -> practica_id apunta a la planilla
--   * el partido de torneo  -> nombre lleva el torneo
--
-- En el torneo se juega de a medio chukker: cada caballo hace la mitad y sale.
-- Por eso `medios` — un partido de 6 chukkers son 12 lugares para llenar, y
-- cada uno pesa medio chukker en la carga del animal.
--
-- Los dos casos comparten la carga por chukker, el puntaje y la observación,
-- así las estadísticas del caballo salen de un solo lado.

create table if not exists jornada (
  id             uuid primary key default gen_random_uuid(),
  jugador_id     uuid not null references jugador (id) on delete cascade,
  practica_id    uuid references practica (id) on delete cascade,
  nombre         text,                             -- el torneo, solo en las AAP
  fecha          date not null,
  chukkers       smallint not null check (chukkers between 1 and 12),
  observaciones  text,
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  -- O es una práctica del club, o es un partido con nombre. Nunca las dos.
  constraint jornada_de_una_clase check ((practica_id is null) <> (nombre is null)),
  -- Un jugador tiene una sola jornada por práctica.
  constraint jornada_practica_unica unique (jugador_id, practica_id)
);

-- Si se juega de a medio chukker, los lugares son el doble y cada uno vale 0,5.
alter table jornada add column if not exists medios boolean not null default false;

create index if not exists jornada_jugador_fecha_idx on jornada (jugador_id, fecha desc);

create table if not exists jornada_chukker (
  jornada_id uuid not null references jornada (id) on delete cascade,
  -- El lugar, no el chukker: en un partido de medios, del 1 al 12 son los dos
  -- medios de cada uno de los 6 chukkers.
  chukker    smallint not null check (chukker between 1 and 24),
  caballo_id uuid not null references caballo (id) on delete cascade,
  -- Un lugar, un caballo.
  primary key (jornada_id, chukker)
);

create index if not exists jornada_chukker_caballo_idx on jornada_chukker (caballo_id);

-- Cómo anduvo el caballo ese día. Es por jornada y no por chukker: el jugador
-- lo puntúa una vez, al terminar.
create table if not exists jornada_puntaje (
  jornada_id uuid not null references jornada (id) on delete cascade,
  caballo_id uuid not null references caballo (id) on delete cascade,
  puntaje    smallint not null check (puntaje between 1 and 10),
  primary key (jornada_id, caballo_id)
);

-- La versión anterior guardaba los caballos colgando de la práctica y no servía
-- para los partidos de torneo. Nunca llegó a usarse.
drop view  if exists v_carga_caballo;
drop table if exists chukker_caballo;

-- ------------------------------------------------------------------- vistas

-- Lo que vale un partido para el que lo jugó: 3 el ganado, 1 el empatado.
create or replace function puntos_de(propios smallint, ajenos smallint)
returns numeric language sql immutable as $$
  select case
    when propios is null or ajenos is null then 0
    when propios > ajenos then 3
    when propios = ajenos then 1
    else 0
  end::numeric;
$$;

-- Ranking de la temporada. Lo ve todo el club, así que sale del plantel
-- público: sin PIN y sin handicap interno.
--
-- Las prácticas cuentan desde que se publican; los puntos, recién cuando se
-- carga el resultado. En las de 12 cada jugador disputa dos de los tres
-- enfrentamientos, así que valen la mitad y el máximo sigue siendo 3 por
-- práctica. El bicolor juega para los dos equipos: se lleva el promedio.
drop view if exists v_participacion;
create view v_participacion with (security_invoker = false) as
with jugadas as (
  select p.temporada_id, pj.jugador_id,
         count(*)                                                as practicas,
         sum(p.chukkers - coalesce(array_length(pj.sale, 1), 0)) as chukkers
  from practica_jugador pj
  join practica p on p.id = pj.practica_id
  group by p.temporada_id, pj.jugador_id
),
puntos as (
  select p.temporada_id, pj.jugador_id,
         sum(
           (case when p.formato = 12 then 0.5 else 1 end)
           * (case
                when pj.equipo = 'bicolor'
                  then (puntos_de(pp.goles_a, pp.goles_b) + puntos_de(pp.goles_b, pp.goles_a)) / 2
                when pj.equipo = pp.equipo_a then puntos_de(pp.goles_a, pp.goles_b)
                when pj.equipo = pp.equipo_b then puntos_de(pp.goles_b, pp.goles_a)
                else 0   -- el equipo que descansaba esa franja
              end)
         ) as puntos
  from practica_partido pp
  join practica p on p.id = pp.practica_id
  join practica_jugador pj on pj.practica_id = pp.practica_id
  where pp.goles_a is not null
  group by p.temporada_id, pj.jugador_id
),
mvps as (
  select temporada_id, mvp_id as jugador_id, count(*) as mvps
  from practica where mvp_id is not null
  group by temporada_id, mvp_id
)
select
  ju.temporada_id,
  j.id as jugador_id,
  j.nombre,
  j.apodo,
  j.handicap,
  j.categoria,
  ju.practicas,
  ju.chukkers,
  coalesce(pt.puntos, 0) as puntos,
  coalesce(mv.mvps, 0)   as mvps
from jugadas ju
join jugador j on j.id = ju.jugador_id
left join puntos pt on pt.temporada_id = ju.temporada_id and pt.jugador_id = ju.jugador_id
left join mvps   mv on mv.temporada_id = ju.temporada_id and mv.jugador_id = ju.jugador_id;

-- Carga de trabajo por caballo: es el dato que hoy el club no tiene. Cuenta
-- prácticas y partidos de torneo juntos, que es como los siente el caballo.
drop view if exists v_carga_caballo;
create view v_carga_caballo as
with peso as (
  -- En el torneo se juega de a medio chukker: ese lugar pesa la mitad.
  select jc.caballo_id, j.id as jornada_id, j.fecha, j.practica_id,
         case when j.medios then 0.5 else 1 end as chukkers
  from jornada_chukker jc
  join jornada j on j.id = jc.jornada_id
)
select
  c.id as caballo_id,
  c.nombre,
  c.jugador_id,
  c.lesionado,
  sum(p.chukkers)                                            as chukkers_total,
  sum(p.chukkers) filter (where p.practica_id is not null)   as chukkers_practicas,
  sum(p.chukkers) filter (where p.practica_id is null)       as chukkers_torneos,
  sum(p.chukkers) filter (where p.fecha > current_date - 7)  as chukkers_ultimos_7_dias,
  sum(p.chukkers) filter (where p.fecha > current_date - 30) as chukkers_ultimos_30_dias,
  count(distinct p.jornada_id)                               as jornadas,
  max(p.fecha)                                               as ultimo_uso
from peso p
join caballo c on c.id = p.caballo_id
group by c.id;

-- --------------------------------------------------------------------- RLS
-- Todo pasa por el servidor de la app, que valida el PIN y setea
-- `request.jwt.claims.sub` con el id del jugador.

alter table jugador           enable row level security;
alter table caballo           enable row level security;
alter table practica          enable row level security;
alter table practica_jugador  enable row level security;
alter table practica_partido  enable row level security;
alter table torneo            enable row level security;
alter table jornada           enable row level security;
alter table jornada_chukker   enable row level security;
alter table jornada_puntaje   enable row level security;
alter table temporada         enable row level security;

create or replace function jugador_actual() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function es_admin() returns boolean language sql stable as $$
  select coalesce((select es_admin from jugador where id = jugador_actual()), false);
$$;

-- La tabla de jugadores en crudo la leen SOLO los admin: ahí viven el hash del
-- PIN y el handicap interno del club, que el jugador no tiene que ver.
drop policy if exists leer_jugadores on jugador;
create policy leer_jugadores on jugador for select using (es_admin());

-- Lo que ve cualquiera del plantel. Es una vista security definer a propósito:
-- pasa por encima de la política de arriba y expone únicamente estas columnas,
-- así el HCP interno no sale de la base ni siquiera si la app se equivoca.
drop view if exists v_plantel;
create view v_plantel with (security_invoker = false) as
  select id, nombre, apodo, handicap, categoria, es_admin
  from jugador
  where activo;

-- Todos los del club ven el calendario y las planillas.
drop policy if exists leer_temporadas on temporada;
create policy leer_temporadas on temporada        for select using (true);
drop policy if exists leer_practicas on practica;
create policy leer_practicas on practica         for select using (true);
drop policy if exists leer_planilla on practica_jugador;
create policy leer_planilla on practica_jugador for select using (true);
drop policy if exists leer_resultados on practica_partido;
create policy leer_resultados on practica_partido for select using (true);
drop policy if exists leer_torneos on torneo;
create policy leer_torneos on torneo            for select using (true);
drop policy if exists admin_torneos on torneo;
create policy admin_torneos on torneo for all using (es_admin()) with check (es_admin());

drop policy if exists leer_caballos on caballo;
create policy leer_caballos on caballo          for select using (true);
-- Cada uno maneja su propia caballada y su propia carga. Los caballos de otro
-- no se ven: es información suya, y el ranking de participación no la usa.
drop policy if exists mi_caballada on caballo;
create policy mi_caballada on caballo for all
  using (jugador_id = jugador_actual() or es_admin())
  with check (jugador_id = jugador_actual() or es_admin());

drop policy if exists mis_jornadas on jornada;
create policy mis_jornadas on jornada for all
  using (jugador_id = jugador_actual() or es_admin())
  with check (jugador_id = jugador_actual() or es_admin());

-- Las dos tablas de abajo cuelgan de la jornada: valen las mismas reglas.
drop policy if exists mis_chukkers on jornada_chukker;
create policy mis_chukkers on jornada_chukker for all
  using (exists (select 1 from jornada j where j.id = jornada_id
                   and (j.jugador_id = jugador_actual() or es_admin())))
  with check (exists (select 1 from jornada j where j.id = jornada_id
                        and (j.jugador_id = jugador_actual() or es_admin())));

drop policy if exists mis_puntajes on jornada_puntaje;
create policy mis_puntajes on jornada_puntaje for all
  using (exists (select 1 from jornada j where j.id = jornada_id
                   and (j.jugador_id = jugador_actual() or es_admin())))
  with check (exists (select 1 from jornada j where j.id = jornada_id
                        and (j.jugador_id = jugador_actual() or es_admin())));

-- Armar, editar y cerrar prácticas es de los admin.
drop policy if exists admin_practicas on practica;
create policy admin_practicas on practica          for all using (es_admin()) with check (es_admin());
drop policy if exists admin_planilla on practica_jugador;
create policy admin_planilla on practica_jugador  for all using (es_admin()) with check (es_admin());
drop policy if exists admin_resultados on practica_partido;
create policy admin_resultados on practica_partido for all using (es_admin()) with check (es_admin());
drop policy if exists admin_jugadores on jugador;
create policy admin_jugadores on jugador           for all using (es_admin()) with check (es_admin());
drop policy if exists admin_temporadas on temporada;
create policy admin_temporadas on temporada         for all using (es_admin()) with check (es_admin());

-- Control de que quedó todo armado. Los avisos amarillos de "does not exist,
-- skipping" son normales: es el archivo fijándose qué falta antes de crearlo.
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE')  as tablas,
  (select count(*) from information_schema.views
     where table_schema = 'public')                                as vistas,
  (select count(*) from pg_policies where schemaname = 'public')   as politicas;
