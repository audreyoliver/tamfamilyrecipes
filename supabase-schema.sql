-- Tam Family Recipes: shared recipe storage
-- Run this in the Supabase SQL editor before enabling USE_SUPABASE in config.js.

create table if not exists public.recipes (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;

-- Anyone may browse the family recipe collection.
create policy "recipes_are_publicly_readable"
on public.recipes for select
using (true);

-- Only authenticated family members may add, update, or delete recipes.
-- Account creation and family membership approval are intentionally deferred.
create policy "authenticated_family_can_insert"
on public.recipes for insert
to authenticated
with check (true);

create policy "authenticated_family_can_update"
on public.recipes for update
to authenticated
using (true)
with check (true);

create policy "authenticated_family_can_delete"
on public.recipes for delete
to authenticated
using (true);

-- Optional image bucket for a later authentication phase. The current static
-- prototype stores optimized photo data inside recipe JSON in demo mode.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

