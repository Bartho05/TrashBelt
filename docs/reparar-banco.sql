-- =====================================================================
-- Trashbelt — reparo do banco depois de mexer nas tabelas/permissões
-- =====================================================================
-- Rode no SQL Editor do Supabase (projeto novo). Pode rodar mais de uma vez.
--
-- Corrige os dois erros vistos na API:
--   • 42501 / HTTP 403 → service_role sem permissão em trash_belt_status;
--   • PGRST205 / HTTP 404 → tabela trash_belt_historico ausente.
--
-- Não apaga coletas já registradas.

-- ---------------------------------------------------------------------
-- 1) Estado da esteira (linha única, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.trash_belt_status (
    id         smallint    not null primary key,
    total      int         not null default 0 check (total    >= 0),
    papel      int         not null default 0 check (papel    >= 0),
    plastico   int         not null default 0 check (plastico >= 0),
    vidro      int         not null default 0 check (vidro    >= 0),
    updated_at timestamptz null default now()
);

alter table public.trash_belt_status
    add column if not exists total      int         not null default 0,
    add column if not exists papel      int         not null default 0,
    add column if not exists plastico   int         not null default 0,
    add column if not exists vidro      int         not null default 0,
    add column if not exists updated_at timestamptz null default now();

-- O id é fixo em 1: remove linhas espúrias antes de criar a constraint
delete from public.trash_belt_status where id is distinct from 1;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'trash_belt_status_id_check'
          and conrelid = 'public.trash_belt_status'::regclass
    ) then
        alter table public.trash_belt_status
            add constraint trash_belt_status_id_check check (id = 1);
    end if;
end $$;

insert into public.trash_belt_status (id) values (1)
    on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Histórico de coletas
-- ---------------------------------------------------------------------
create table if not exists public.trash_belt_historico (
    id        bigint      generated always as identity primary key,
    evento_em timestamptz not null default now(),
    papel     int         not null default 0 check (papel     >= 0),
    plastico  int         not null default 0 check (plastico  >= 0),
    vidro     int         not null default 0 check (vidro     >= 0)
);

alter table public.trash_belt_historico
    add column if not exists evento_em timestamptz not null default now(),
    add column if not exists papel     int         not null default 0,
    add column if not exists plastico  int         not null default 0,
    add column if not exists vidro     int         not null default 0;

create index if not exists trash_belt_historico_evento_em_idx
    on public.trash_belt_historico (evento_em);

-- ---------------------------------------------------------------------
-- 3) Permissões: anon/authenticated fora, service_role dentro
-- ---------------------------------------------------------------------
alter table public.trash_belt_status    enable row level security;
alter table public.trash_belt_historico enable row level security;

revoke all on public.trash_belt_status    from anon, authenticated;
revoke all on public.trash_belt_historico from anon, authenticated;

grant all on public.trash_belt_status    to service_role;
grant all on public.trash_belt_historico to service_role;

do $$
begin
    if exists (
        select 1 from pg_class
        where relname = 'trash_belt_historico_id_seq' and relkind = 'S'
    ) then
        execute 'grant usage, select on sequence public.trash_belt_historico_id_seq to service_role';
    end if;
end $$;
