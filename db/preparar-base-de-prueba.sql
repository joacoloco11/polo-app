-- ===========================================================================
--  DEJAR LISTA LA BASE DE PRUEBA
--  ---------------------------------------------------------------------
--  Esto va SOLAMENTE en la base de prueba. NUNCA en la del club.
--
--  Se corre al final, después de:
--     1. `schema.sql`          (crea las tablas)
--     2. `restaurar-datos.sql` (trae la copia de los datos de verdad)
--
--  Qué hace: borra las claves de todos. Los jugadores, las prácticas, los
--  resultados y los caballos quedan igual que en la app del club —por eso la
--  de prueba se ve viva cuando se la mostrás a alguien—, pero las claves de la
--  gente no quedan guardadas en un segundo lado.
--
--  Cada uno que entre a la de prueba se va a encontrar con la misma pantalla
--  que la primera vez: elige el PIN que quiera y listo. Puede ser distinto del
--  de verdad; son dos apps separadas y no se hablan.
--
--  ANTES DE CORRERLO, PARÁ UN SEGUNDO Y FIJATE ARRIBA A LA IZQUIERDA QUE EL
--  PROYECTO DE SUPABASE SEA EL DE PRUEBA. Corrido en el del club, deja a los
--  37 afuera hasta que cada uno se ponga un PIN nuevo.
-- ===========================================================================

begin;

-- El freno que vive en la propia base: si alguien abre este archivo en el
-- proyecto equivocado, esto lo corta antes de tocar nada. La base de prueba se
-- marca corriendo, una sola vez, el `comment on database` de acá abajo.
do $$
begin
  if coalesce(shobj_description((select oid from pg_database
        where datname = current_database()), 'pg_database'), '') <> 'polo-prueba' then
    raise exception
      'Esta base no está marcada como la de prueba. Si de verdad es la de prueba, corré primero: comment on database postgres is ''polo-prueba'';';
  end if;
end $$;

update jugador
   set pin_hash = null,
       pin_puesto_en = null,
       pin_intentos = 0,
       pin_bloqueado_hasta = null;

commit;

-- El control: los dos números tienen que ser iguales, y "con_pin" cero.
select count(*)::int                                          as jugadores,
       count(*) filter (where pin_puesto_en is null)::int      as sin_pin,
       count(*) filter (where pin_hash is not null)::int       as con_pin
from jugador;
