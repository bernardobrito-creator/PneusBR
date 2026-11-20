-- Termo de uso e sigilo (pedido do dono, 19/11/2026): cada funcionário aceita no primeiro acesso e fica
-- registrado quem aceitou, qual versão do texto e a data e a hora (do servidor, não do aparelho).
-- Só inclusão: ninguém altera nem apaga um aceite pelo site. Cada pessoa vê o próprio; o dono vê todos.
-- Sem chave estrangeira para auth.users de propósito: o aceite continua guardado mesmo se o dono remover o acesso.
create table if not exists public.termo_aceites (
  user_id uuid not null,
  versao text not null check (char_length(versao) between 1 and 40),
  nome text,
  email text,
  aceito_em timestamptz not null default now(),
  primary key (user_id, versao)
);
comment on table public.termo_aceites is 'Aceites do termo de uso e sigilo do sistema PneusBR (só inclusão; quem e quando gravados pelo servidor).';

alter table public.termo_aceites enable row level security;
revoke all on public.termo_aceites from anon, authenticated;
grant select, insert on public.termo_aceites to authenticated;

-- quem e quando vêm do servidor: o aparelho não escolhe a pessoa nem a data
create or replace function privado.termo_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := (select auth.uid());
  new.aceito_em := now();
  select m.nome into new.nome from public.membros m where m.user_id = new.user_id;
  select u.email into new.email from auth.users u where u.id = new.user_id;
  return new;
end $$;
revoke all on function privado.termo_carimbo() from public, anon, authenticated;

drop trigger if exists termo_carimbo on public.termo_aceites;
create trigger termo_carimbo before insert on public.termo_aceites for each row execute function privado.termo_carimbo();

drop policy if exists "membro registra o proprio aceite" on public.termo_aceites;
create policy "membro registra o proprio aceite" on public.termo_aceites for insert to authenticated
  with check ((select privado.eh_membro()) and user_id = (select auth.uid()));
drop policy if exists "cada um ve o seu e o dono ve todos" on public.termo_aceites;
create policy "cada um ve o seu e o dono ve todos" on public.termo_aceites for select to authenticated
  using (user_id = (select auth.uid()) or (select privado.eh_dono()));
