// Supabase simulado para testes locais: mesmas chamadas do supabase-js v2, dados no localStorage e
// "tempo real" entre abas via BroadcastChannel. Aplica a mesma regra de acesso: só membros leem/gravam docs.
(function () {
  const LS = 'mock-sb-db', LSS = 'mock-sb-sessao';
  const bc = new BroadcastChannel('mock-sb');
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || { docs: {}, membros: {}, users: {} }; } catch { return { docs: {}, membros: {}, users: {} }; } };
  const save = db => localStorage.setItem(LS, JSON.stringify(db));
  const uid = () => 'u' + Math.random().toString(36).slice(2, 10);
  window.__mockSb = { load, save, chamadas: [] };
  function criar() {
    let sessao = JSON.parse(localStorage.getItem(LSS) || 'null');
    const canais = [], ouvAuth = [];
    const membro = () => sessao && load().membros[sessao.user.id];
    const emitirRT = ev => { for (const c of canais) for (const h of c.h) h(ev); };
    bc.onmessage = m => emitirRT(m.data);
    const publicar = ev => { emitirRT(ev); bc.postMessage(ev); };
    const valor = (row, col) => col.startsWith('data->>') ? (row.data || {})[col.slice(7)] : row[col];
    function builder(tabela) {
      const st = { filtros: [], de: 0, ate: 1e9, op: 'select', single: false };
      const b = {
        select() { st.op = st.op === 'select' ? 'select' : st.op; return b; },
        eq(c, v) { st.filtros.push([c, '==', v]); return b; }, neq(c, v) { st.filtros.push([c, '!=', v]); return b; },
        gt(c, v) { st.filtros.push([c, '>', v]); return b; }, gte(c, v) { st.filtros.push([c, '>=', v]); return b; },
        lt(c, v) { st.filtros.push([c, '<', v]); return b; }, lte(c, v) { st.filtros.push([c, '<=', v]); return b; },
        order() { return b; }, limit(n) { st.ate = st.de + n - 1; return b; },
        range(a, z) { st.de = a; st.ate = z; return b; }, maybeSingle() { st.single = true; return b; },
        upsert(obj) { st.op = 'upsert'; st.obj = obj; return b; },
        delete() { st.op = 'delete'; return b; },
        then(ok, fail) { return Promise.resolve().then(executar).then(ok, fail); }
      };
      const OPS = { '==': (a, v) => String(a) === String(v), '!=': (a, v) => String(a) !== String(v), '>': (a, v) => a > v, '>=': (a, v) => a >= v, '<': (a, v) => a < v, '<=': (a, v) => a <= v };
      async function executar() {
        await new Promise(r => setTimeout(r, 5));
        window.__mockSb.chamadas.push(tabela + ':' + st.op);
        const db = load();
        if (tabela === 'membros') {
          const rows = membro() ? Object.entries(db.membros).map(([user_id, m]) => ({ user_id, ...m })) : [];
          const f = rows.filter(r => st.filtros.every(([c, op, v]) => OPS[op](valor(r, c), v)));
          return st.single ? { data: f[0] || null, error: null } : { data: f.slice(st.de, st.ate + 1), error: null };
        }
        if (!membro()) {
          if (st.op === 'select') return { data: [], error: null };
          return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "docs"' } };
        }
        if (st.op === 'upsert') {
          const o = st.obj, existia = !!db.docs[o.path];
          const row = { ...o, atualizado_em: new Date().toISOString(), por: sessao.user.id };
          db.docs[o.path] = row; save(db);
          publicar({ eventType: existia ? 'UPDATE' : 'INSERT', new: row, old: {} });
          return { data: null, error: null };
        }
        const rows = Object.values(db.docs).filter(r => st.filtros.every(([c, op, v]) => OPS[op](valor(r, c), v)));
        if (st.op === 'delete') { for (const r of rows) { delete db.docs[r.path]; publicar({ eventType: 'DELETE', new: {}, old: r }); } save(db); return { data: null, error: null }; }
        rows.sort((a, b) => a.doc_id < b.doc_id ? -1 : 1);
        return { data: rows.slice(st.de, st.ate + 1).map(r => ({ doc_id: r.doc_id, data: r.data })), error: null };
      }
      return b;
    }
    const erroFn = (erro, status) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ erro }) } } });
    const fns = {
      async acesso(body) {
        const db = load(), temDono = Object.values(db.membros).some(m => m.papel === 'dono');
        if (body.acao === 'status') return { data: { temDono }, error: null };
        const criarUser = (papel) => {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || '')) return erroFn('E-mail inválido.', 400);
          if (String(body.senha || '').length < 8) return erroFn('A senha precisa ter pelo menos 8 caracteres.', 400);
          if (Object.values(db.users).some(u => u.email === body.email)) return erroFn('Já existe uma conta com este e-mail.', 400);
          const id = uid(); db.users[id] = { email: body.email, senha: body.senha }; db.membros[id] = { nome: body.nome || body.email, papel, criado_em: new Date().toISOString() }; save(db);
          return { data: { ok: true }, error: null };
        };
        if (body.acao === 'criar-dono') return temDono ? erroFn('O acesso da loja já foi criado. Entre com o e-mail e a senha.', 409) : criarUser('dono');
        const eu = sessao && db.membros[sessao.user.id];
        if (!eu) return erroFn('Entre no sistema primeiro.', 401);
        if (eu.papel !== 'dono') return erroFn('Só o dono pode gerenciar as pessoas.', 403);
        if (body.acao === 'listar') return { data: { lista: Object.entries(db.membros).map(([user_id, m]) => ({ user_id, ...m, email: db.users[user_id]?.email, ultimo: null })) }, error: null };
        if (body.acao === 'criar-func') return criarUser('func');
        if (body.acao === 'senha') { if (String(body.senha).length < 8) return erroFn('A senha precisa ter pelo menos 8 caracteres.', 400); db.users[body.user_id].senha = body.senha; save(db); return { data: { ok: true }, error: null }; }
        if (body.acao === 'remover') { delete db.membros[body.user_id]; delete db.users[body.user_id]; save(db); return { data: { ok: true }, error: null }; }
        return erroFn('Ação desconhecida.', 400);
      },
      async 'ler-nota'(body) {
        if (!membro()) return erroFn('Sem acesso ao sistema.', 403);
        window.__iaPedidos = (window.__iaPedidos || []).concat([{ col: body.col, n: (body.imagens || []).length, tamanhos: (body.imagens || []).map(i => i.dados.length), texto: (body.texto || '').length }]);
        if (!window.__iaResposta) return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 503, json: async () => ({ erro: 'A leitura com IA ainda não foi configurada.', codigo: 'ia-nao-configurada' }) } } };
        return { data: { dados: window.__iaResposta, modelo: 'teste' }, error: null };
      },
      async planilha() {
        if (!membro()) return erroFn('Sem acesso ao sistema.', 403);
        if (window.__planilhaFalha) return erroFn('A planilha não está compartilhada para qualquer pessoa com o link (o Google pediu login).', 502);
        return { data: { content: window.__xlsxB64, bytes: 1, lidoEm: Date.now() }, error: null };
      }
    };
    return {
      from: builder,
      functions: { invoke: async (nome, { body } = {}) => { await new Promise(r => setTimeout(r, 10)); window.__mockSb.chamadas.push('fn:' + nome + ':' + (body?.acao || '')); return fns[nome](body || {}); } },
      channel() { const c = { h: [], on(t, f, cb) { c.h.push(cb); return c; }, subscribe(cb) { canais.push(c); setTimeout(() => cb && cb('SUBSCRIBED'), 5); return c; } }; return c; },
      auth: {
        async getSession() { return { data: { session: sessao } }; },
        async signInWithPassword({ email, password }) {
          const db = load(); const e = Object.entries(db.users).find(([, u]) => u.email === email && u.senha === password);
          if (!e) return { data: {}, error: { message: 'Invalid login credentials' } };
          sessao = { user: { id: e[0], email }, access_token: 't' }; localStorage.setItem(LSS, JSON.stringify(sessao));
          ouvAuth.forEach(f => f('SIGNED_IN', sessao)); return { data: { session: sessao, user: sessao.user }, error: null };
        },
        async signOut() { sessao = null; localStorage.removeItem(LSS); ouvAuth.forEach(f => f('SIGNED_OUT', null)); return { error: null }; },
        async updateUser({ password }) { const db = load(); if (db.users[sessao.user.id].senha === password) return { error: { message: 'New password should be different from the old password (same).' } }; db.users[sessao.user.id].senha = password; save(db); return { data: {}, error: null }; },
        onAuthStateChange(cb) { ouvAuth.push(cb); return { data: { subscription: { unsubscribe() { } } } }; }
      }
    };
  }
  window.supabase = { createClient: () => criar() };
})();
