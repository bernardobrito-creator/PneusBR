import { createClient } from "jsr:@supabase/supabase-js@2";

// Contas do sistema: status do primeiro acesso, criação do dono e (só o dono) a lista de pessoas.
// verify_jwt fica desligado porque o primeiro acesso acontece antes de existir login; cada ação confere o papel aqui dentro.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* ---------- segurança comum ---------- */
const ORIGENS = ["https://bernardobrito-creator.github.io"];
function cabecalhos(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (ORIGENS.includes(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
const origemDeFora = (req: Request) => { const o = req.headers.get("Origin"); return !!o && !ORIGENS.includes(o); };
const ipDe = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "sem-ip";
// deno-lint-ignore no-explicit-any
async function dentroDoLimite(admin: any, chave: string, max: number, seg: number) {
  const { data, error } = await admin.rpc("limite_ok", { p_chave: chave, p_max: max, p_seg: seg });
  if (error) { console.error("limite_ok:", error.message); return true; }
  return data === true;
}

/* ---------- regras de senha ---------- */
const COMUNS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "12121212", "11223344",
  "password", "password1", "password123", "senha123", "senha1234", "senha12345", "mudar123", "trocar123", "admin123", "teste123",
  "qwerty123", "abc12345", "abcd1234", "asdf1234", "a1b2c3d4", "iloveyou1", "brasil123", "brasil2026", "pneusbr1", "pneusbr123", "pneus123",
]);
function problemaSenha(senha: string, email = "") {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/\p{L}/u.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  const n = senha.toLowerCase();
  if (COMUNS.has(n) || /^(.)\1+$/.test(senha)) return "Essa senha é muito comum. Escolha outra.";
  const usuario = email.split("@")[0].toLowerCase();
  if (usuario.length >= 4 && n.includes(usuario)) return "A senha não pode conter o e-mail.";
  return null;
}
function validar(body: Record<string, unknown>) {
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const senha = String(body.senha || "");
  const nome = String(body.nome || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  const p = problemaSenha(senha, email); if (p) throw new Error(p);
  return { email, senha, nome };
}
/* ---------- senha das telas (Caixa, Faturamento, Balanço, Preços): conferida aqui, com limite de tentativas ---------- */
const TRAVA_ITER = 310000;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
async function pbkdf2(senha: string, salHex: string, iter: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const sal = Uint8Array.from((salHex.match(/../g) || []).map((x) => parseInt(x, 16)));
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, k, 256)));
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const normTrava = (s: unknown) => String(s || "").trim().toUpperCase().slice(0, 100);

const uuid = (s: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
function erroConta(m: string) {
  if (/already|registered|exists/i.test(m)) return "Já existe uma conta com este e-mail.";
  if (/password/i.test(m)) return "A senha não foi aceita: use pelo menos 8 caracteres, misturando letras e números.";
  return "Não foi possível criar a conta agora.";
}

Deno.serve(async (req: Request) => {
  const h = cabecalhos(req);
  const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (origemDeFora(req)) return resp({ erro: "Origem não permitida." }, 403);
  if (req.method !== "POST") return resp({ erro: "Use POST." }, 405);

  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = ipDe(req);
  if (!(await dentroDoLimite(admin, "acesso:ip:" + ip, 60, 300))) return resp({ erro: "Muitas tentativas. Espere alguns minutos e tente de novo." }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return resp({ erro: "Pedido inválido." }, 400); }
  if (!body || typeof body !== "object") return resp({ erro: "Pedido inválido." }, 400);
  const acao = String(body.acao || "");

  try {
    const { count, error: eCount } = await admin.from("membros").select("user_id", { count: "exact", head: true }).eq("papel", "dono");
    if (eCount) { console.error("contar dono:", eCount.message); return resp({ erro: "Banco indisponível. Tente de novo." }, 503); }
    const temDono = (count ?? 0) > 0;
    if (acao === "status") return resp({ temDono });

    if (acao === "criar-dono") {
      if (temDono) return resp({ erro: "O acesso da loja já foi criado. Entre com o e-mail e a senha." }, 409);
      if (!(await dentroDoLimite(admin, "acesso:criar-dono:" + ip, 5, 3600))) return resp({ erro: "Muitas tentativas. Espere e tente de novo." }, 429);
      let d;
      try { d = validar(body); } catch (e) { return resp({ erro: (e as Error).message }, 400); }
      const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.senha, email_confirm: true, user_metadata: { nome: d.nome } });
      if (error || !data?.user) { console.error("criar dono:", error?.message); return resp({ erro: erroConta(error?.message || "") }, 400); }
      const { error: e2 } = await admin.from("membros").insert({ user_id: data.user.id, nome: d.nome || "Dono", papel: "dono" });
      if (e2) { console.error("membro dono:", e2.message); await admin.auth.admin.deleteUser(data.user.id); return resp({ erro: "Não foi possível registrar o acesso." }, 500); }
      return resp({ ok: true });
    }

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    const uid = u?.user?.id;
    if (!uid) return resp({ erro: "Entre no sistema primeiro." }, 401);
    const { data: eu } = await admin.from("membros").select("papel").eq("user_id", uid).maybeSingle();
    if (!eu) return resp({ erro: "Esta conta não tem acesso ao sistema." }, 403);

    if (acao === "trava-conferir") {
      if (!(await dentroDoLimite(admin, "trava:u:" + uid, 8, 600)) || !(await dentroDoLimite(admin, "trava:ip:" + ip, 20, 600))) {
        return resp({ erro: "Muitas tentativas de senha. Espere 10 minutos e tente de novo." }, 429);
      }
      const { data: t } = await admin.rpc("ajuste_servidor", { p_chave: "trava" });
      if (!t) return resp({ configurada: false });
      const cfg = JSON.parse(String(t));
      const ok = iguais(await pbkdf2(normTrava(body.senha), cfg.sal, cfg.iter || TRAVA_ITER), cfg.hash);
      return resp({ configurada: true, ok });
    }
    if (acao === "trava-status") {
      const { data: t } = await admin.rpc("ajuste_servidor", { p_chave: "trava" });
      return resp({ configurada: !!t });
    }

    if (eu.papel !== "dono") return resp({ erro: "Só o dono pode fazer isso." }, 403);
    if (!(await dentroDoLimite(admin, "acesso:dono:" + uid, 40, 300))) return resp({ erro: "Muitas ações seguidas. Espere alguns minutos." }, 429);

    if (acao === "trava-definir") {
      const nova = normTrava(body.senha);
      if (nova.length < 6) return resp({ erro: "A senha das telas precisa ter pelo menos 6 caracteres." }, 400);
      if (/^(.)\1+$/.test(nova) || ["123456", "1234567", "12345678", "PNEUSBR", "SENHA123"].includes(nova)) return resp({ erro: "Essa senha é muito fácil. Escolha outra." }, 400);
      const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
      const valor = JSON.stringify({ sal, iter: TRAVA_ITER, hash: await pbkdf2(nova, sal, TRAVA_ITER), em: new Date().toISOString() });
      const { error } = await admin.rpc("ajuste_servidor_gravar", { p_chave: "trava", p_valor: valor });
      if (error) { console.error("trava-definir:", error.message); return resp({ erro: "Não foi possível salvar a senha agora." }, 500); }
      return resp({ ok: true });
    }
    if (acao === "listar") {
      const { data: ms } = await admin.from("membros").select("user_id,nome,papel,criado_em").order("criado_em");
      const lista = [];
      for (const m of ms || []) {
        const { data: au } = await admin.auth.admin.getUserById(m.user_id);
        lista.push({ ...m, email: au?.user?.email || "", ultimo: au?.user?.last_sign_in_at || null });
      }
      return resp({ lista });
    }
    if (acao === "criar-func") {
      let d;
      try { d = validar(body); } catch (e) { return resp({ erro: (e as Error).message }, 400); }
      const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.senha, email_confirm: true, user_metadata: { nome: d.nome } });
      if (error || !data?.user) { console.error("criar func:", error?.message); return resp({ erro: erroConta(error?.message || "") }, 400); }
      const { error: e2 } = await admin.from("membros").insert({ user_id: data.user.id, nome: d.nome || d.email, papel: "func" });
      if (e2) { console.error("membro func:", e2.message); await admin.auth.admin.deleteUser(data.user.id); return resp({ erro: "Não foi possível registrar o acesso." }, 500); }
      return resp({ ok: true });
    }
    if (acao === "senha") {
      const alvo = String(body.user_id || "");
      if (!uuid(alvo)) return resp({ erro: "Pessoa não encontrada." }, 404);
      const { data: m } = await admin.from("membros").select("user_id").eq("user_id", alvo).maybeSingle();
      if (!m) return resp({ erro: "Pessoa não encontrada." }, 404);
      const { data: au } = await admin.auth.admin.getUserById(alvo);
      const p = problemaSenha(String(body.senha || ""), au?.user?.email || ""); if (p) return resp({ erro: p }, 400);
      const { error } = await admin.auth.admin.updateUserById(alvo, { password: String(body.senha) });
      if (error) { console.error("senha:", error.message); return resp({ erro: "Não foi possível trocar a senha agora." }, 400); }
      return resp({ ok: true });
    }
    if (acao === "remover") {
      const alvo = String(body.user_id || "");
      if (alvo === uid) return resp({ erro: "Você não pode remover o seu próprio acesso." }, 400);
      if (!uuid(alvo)) return resp({ erro: "Pessoa não encontrada." }, 404);
      const { data: m } = await admin.from("membros").select("papel").eq("user_id", alvo).maybeSingle();
      if (!m) return resp({ erro: "Pessoa não encontrada." }, 404);
      if (m.papel === "dono") return resp({ erro: "O acesso do dono não pode ser removido aqui." }, 400);
      const { error } = await admin.auth.admin.deleteUser(alvo);
      if (error) { console.error("remover:", error.message); return resp({ erro: "Não foi possível remover agora." }, 400); }
      return resp({ ok: true });
    }
    return resp({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("acesso:", (e as Error)?.message || e);
    return resp({ erro: "Erro no servidor. Tente de novo." }, 500);
  }
});
