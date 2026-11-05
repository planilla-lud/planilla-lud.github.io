-- Un jugador puede crear, cambiar y borrar los análisis que hizo él (autor = su carné).
create or replace function public.pm_jugador_analisis(k text, valor jsonb)
returns boolean language sql stable security definer set search_path to '' as $$
  select k = 'analisis' and public.pm_yo_rol() = 'jug' and public.pm_yo_carne() is not null
    and (valor ->> 'autor') = public.pm_yo_carne()
$$;

drop policy "estado: agregar" on public.pm_estado;
create policy "estado: agregar" on public.pm_estado for insert with check (
  (select public.pm_es_creador()) or (club = (select public.pm_yo_club()) and (
    (select public.pm_yo_rol()) = any (array['admin','dt']) or public.pm_jugador_puede(k, sub) or public.pm_jugador_analisis(k, valor))));

drop policy "estado: cambiar" on public.pm_estado;
create policy "estado: cambiar" on public.pm_estado for update using (
  (select public.pm_es_creador()) or (club = (select public.pm_yo_club()) and (
    (select public.pm_yo_rol()) = any (array['admin','dt']) or public.pm_jugador_puede(k, sub) or public.pm_jugador_analisis(k, valor))))
  with check (
  (select public.pm_es_creador()) or (club = (select public.pm_yo_club()) and (
    (select public.pm_yo_rol()) = any (array['admin','dt']) or public.pm_jugador_puede(k, sub) or public.pm_jugador_analisis(k, valor))));

drop policy "estado: borrar" on public.pm_estado;
create policy "estado: borrar" on public.pm_estado for delete using (
  (select public.pm_es_creador()) or (club = (select public.pm_yo_club()) and (
    (select public.pm_yo_rol()) = any (array['admin','dt']) or public.pm_jugador_puede(k, sub) or public.pm_jugador_analisis(k, valor))));
