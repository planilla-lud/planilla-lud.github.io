-- Casilla de sugerencias: cualquiera con cuenta manda; solo el creador las lee.
-- (Aplicado en Supabase el 2026-11-05.)
create table public.pm_sugerencias (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  club text, rol text, nombre text,
  texto text not null check (char_length(texto) between 3 and 2000),
  creado timestamptz not null default now(),
  leida boolean not null default false
);
alter table public.pm_sugerencias enable row level security;
create or replace function public.pm_sugerencia_autor() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.user_id := auth.uid();
  select m.club, m.rol, m.nombre into new.club, new.rol, new.nombre from public.pm_miembros m where m.user_id = auth.uid();
  new.leida := false; new.creado := now();
  return new;
end $$;
create trigger pm_sugerencia_autor before insert on public.pm_sugerencias for each row execute function public.pm_sugerencia_autor();
create policy "sugerencias: mandar" on public.pm_sugerencias for insert to authenticated
  with check (exists (select 1 from public.pm_miembros m where m.user_id = (select auth.uid())));
create policy "sugerencias: leer" on public.pm_sugerencias for select to authenticated using ((select public.pm_es_creador()));
create policy "sugerencias: marcar" on public.pm_sugerencias for update to authenticated using ((select public.pm_es_creador())) with check ((select public.pm_es_creador()));
create policy "sugerencias: borrar" on public.pm_sugerencias for delete to authenticated using ((select public.pm_es_creador()));
