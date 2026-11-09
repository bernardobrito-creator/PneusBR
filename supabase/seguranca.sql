-- Regras de segurança do banco (Supabase) aplicadas em 09/11/2026.
-- Este arquivo é a cópia de referência das migrações "seguranca_permissoes_e_validacao",
-- "seguranca_revogar_extras" e "seguranca_ajuste_gravar". Valores secretos NÃO ficam aqui.

-- 1) quem é dono (usado nas regras)
create or replace function privado.eh_dono() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.user_id = (select auth.uid()) and m.papel = 'dono');
$$;
revoke all on function privado.eh_dono() from public, anon;
grant execute on function privado.eh_dono() to authenticated;

-- 2) menor privilégio: visitante (anon) não tem nada; quem entrou só o necessário
revoke all on table public.docs, public.membros from anon;
revoke all on table public.docs, public.membros from authenticated;
grant select, insert, update, delete on table public.docs to authenticated;
grant select on table public.membros to authenticated;

-- 3) regras por papel: configurações só o dono altera; apagar só onde o sistema apaga
alter policy "membros criam" on public.docs
  with check ((select privado.eh_membro()) and (colecao <> 'config' or (select privado.eh_dono())));
alter policy "membros alteram" on public.docs
  using ((select privado.eh_membro()) and (colecao <> 'config' or (select privado.eh_dono())))
  with check ((select privado.eh_membro()) and (colecao <> 'config' or (select privado.eh_dono())));
alter policy "membros apagam" on public.docs
  using ((select privado.eh_membro()) and colecao in ('produtos', 'retornos', 'planilha'));

-- 4) validação no servidor: formato do caminho, coleções conhecidas, tipo e tamanho
alter table public.docs add constraint docs_caminho_ok check (path = colecao || '/' || doc_id);
alter table public.docs add constraint docs_colecao_ok check (colecao in ('caixa','clientes','config','lancamentos','notasfiscais','pagar','planilha','produtos','receber','retornos','rotina','servicos','vinculos'));
alter table public.docs add constraint docs_id_ok check (doc_id ~ '^[A-Za-z0-9_.:~@+-]{1,200}$');
alter table public.docs add constraint docs_dados_objeto check (jsonb_typeof(data) = 'object');
alter table public.docs add constraint docs_tamanho_ok check (pg_column_size(data) <= 2000000);

-- 5) histórico (invisível para o app): versão anterior de financeiro e configurações, e tudo que for apagado
create table if not exists privado.docs_historico (
  id bigserial primary key, path text not null, colecao text not null, op text not null,
  dados_antes jsonb, por uuid, em timestamptz not null default now()
);
revoke all on table privado.docs_historico from public, anon, authenticated;
create or replace function privado.docs_guardar_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.colecao in ('config','receber','pagar','notasfiscais','caixa','servicos','clientes') then
    insert into privado.docs_historico(path, colecao, op, dados_antes, por)
    values (old.path, old.colecao, tg_op, old.data, (select auth.uid()));
  end if;
  return null;
end $$;
revoke all on function privado.docs_guardar_historico() from public, anon, authenticated;
create trigger docs_historico after update or delete on public.docs
  for each row execute function privado.docs_guardar_historico();

-- 6) limite de tentativas usado pelas funções do servidor (só o servidor chama)
create table if not exists privado.limites (chave text primary key, inicio timestamptz not null, n integer not null);
revoke all on table privado.limites from public, anon, authenticated;
create or replace function public.limite_ok(p_chave text, p_max integer, p_seg integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  insert into privado.limites as l (chave, inicio, n) values (left(p_chave, 200), now(), 1)
  on conflict (chave) do update set
    n = case when l.inicio < now() - make_interval(secs => p_seg) then 1 else l.n + 1 end,
    inicio = case when l.inicio < now() - make_interval(secs => p_seg) then now() else l.inicio end
  returning n into v_n;
  return v_n <= p_max;
end $$;
revoke all on function public.limite_ok(text, integer, integer) from public, anon, authenticated;
grant execute on function public.limite_ok(text, integer, integer) to service_role;

-- 7) ajustes do servidor (ID da planilha, resumo da senha das telas): só o servidor lê e grava
create table if not exists privado.ajustes_servidor (chave text primary key, valor text not null);
revoke all on table privado.ajustes_servidor from public, anon, authenticated;
create or replace function public.ajuste_servidor(p_chave text) returns text
language sql stable security definer set search_path = '' as $$
  select valor from privado.ajustes_servidor where chave = p_chave;
$$;
revoke all on function public.ajuste_servidor(text) from public, anon, authenticated;
grant execute on function public.ajuste_servidor(text) to service_role;
create or replace function public.ajuste_servidor_gravar(p_chave text, p_valor text) returns void
language sql security definer set search_path = '' as $$
  insert into privado.ajustes_servidor(chave, valor) values (p_chave, p_valor)
  on conflict (chave) do update set valor = excluded.valor;
$$;
revoke all on function public.ajuste_servidor_gravar(text, text) from public, anon, authenticated;
grant execute on function public.ajuste_servidor_gravar(text, text) to service_role;
-- o ID da planilha foi gravado direto no banco: insert into privado.ajustes_servidor values ('planilha_id', '<ID>');

-- 8) funções antigas e de gatilho fora do alcance de visitantes
revoke all on function public.docs_carimbo() from public, anon, authenticated;
revoke all on function public.eh_dono(), public.eh_membro(), public.tem_dono() from public, anon, authenticated;
