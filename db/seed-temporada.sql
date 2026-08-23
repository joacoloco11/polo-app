-- ============================================================================
--  Temporada en curso — correr después del plantel.
--  Ajustá el nombre y las fechas antes de darle Run.
-- ============================================================================

insert into temporada (nombre, desde, hasta, activa)
select 'Primavera 2026', '2026-09-01', '2026-12-31', true
where not exists (select 1 from temporada where nombre = 'Primavera 2026');

select nombre, desde, hasta, activa from temporada order by desde desc;
