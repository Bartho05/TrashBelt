-- =====================================================================
-- Trashbelt — esquema do banco (Supabase / PostgreSQL)
-- =====================================================================
-- Como usar: no painel do Supabase (SQL Editor), rode este script uma vez
-- em um projeto novo. Ele cria as duas tabelas usadas pelo painel e aplica
-- as travas de segurança.
--
-- Segurança (importante):
--   • RLS habilitada nas duas tabelas e SEM políticas — com isso as chaves
--     públicas (anon / authenticated) não enxergam nem inserem nada;
--   • todos os privilégios de anon / authenticated revogados;
--   • o backend PHP (api/supabase.php) usa a CHAVE SECRETA, que age como
--     service_role e não passa pelo RLS. Ela vive apenas em
--     api/credenciais.php (fora do Git) — veja api/credenciais.exemplo.php.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estado atual da esteira — sempre uma única linha (id = 1)
-- ---------------------------------------------------------------------
create table public.trash_belt_status (
    id         smallint    not null primary key,
    total      int         not null default 0 check (total    >= 0),
    papel      int         not null default 0 check (papel    >= 0),
    plastico   int         not null default 0 check (plastico >= 0),
    vidro      int         not null default 0 check (vidro    >= 0),
    updated_at timestamptz null default now()
);

-- O id é fixo em 1: impede uma segunda linha e valores negativos
alter table public.trash_belt_status
    add constraint trash_belt_status_id_check check (id = 1);

-- Linha inicial do estado
insert into public.trash_belt_status (id) values (1);

-- ---------------------------------------------------------------------
-- Histórico de coletas — um registro por evento de separação
-- ---------------------------------------------------------------------
create table public.trash_belt_historico (
    id        bigint      generated always as identity primary key,
    evento_em timestamptz not null default now(),
    papel     int         not null default 0 check (papel     >= 0),
    plastico  int         not null default 0 check (plastico  >= 0),
    vidro     int         not null default 0 check (vidro     >= 0)
);

-- Consultas do painel agrupam por dia/semana/mês a partir de evento_em
create index trash_belt_historico_evento_em_idx
    on public.trash_belt_historico (evento_em);

-- ---------------------------------------------------------------------
-- Fechamento das chaves públicas (RLS + revokes)
-- ---------------------------------------------------------------------
alter table public.trash_belt_status    enable row level security;
alter table public.trash_belt_historico enable row level security;

-- Nenhuma política é criada de propósito: sem políticas, as chaves
-- públicas (anon/authenticated) não têm acesso a nenhuma linha.
revoke all on public.trash_belt_status    from anon, authenticated;
revoke all on public.trash_belt_historico from anon, authenticated;
