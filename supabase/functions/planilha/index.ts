import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// Lê a planilha "Precificação" do Google Drive e devolve o .xlsx em base64 para quem é da equipe.
// O ID da planilha fica no servidor (segredo PLANILHA_ID ou tabela privado.ajustes_servidor), fora do código público.
// Com o segredo GOOGLE_SA_JSON (chave JSON de uma conta de serviço do Google com acesso de Leitor à planilha),
// a leitura é feita pela API do Drive e a planilha pode ficar "Restrita". Sem ele, usa o link público.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

/* ---------- conta de serviço do Google (JWT RS256 assinado aqui, sem bibliotecas) ---------- */
const b64url = (b: Uint8Array) => encodeBase64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const txt = (s: string) => new TextEncoder().encode(s);
let tokenCache: { token: string; ate: number } | null = null;
async function tokenGoogle(sa: { client_email: string; private_key: string }) {
  if (tokenCache && tokenCache.ate > Date.now() + 60_000) return tokenCache.token;
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(txt(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const corpo = b64url(txt(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const ass = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, txt(cab + "." + corpo)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${corpo}.${b64url(ass)}` }),
  });
  if (!r.ok) throw new Error("token Google " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  tokenCache = { token: j.access_token, ate: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

Deno.serve(async (req: Request) => {
  const h = cabecalhos(req);
  const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (origemDeFora(req)) return resp({ erro: "Origem não permitida." }, 403);
  if (req.method !== "POST") return resp({ erro: "Use POST." }, 405);

  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (!(await dentroDoLimite(admin, "planilha:ip:" + ipDe(req), 60, 600))) return resp({ erro: "Muitas leituras seguidas. Espere alguns minutos." }, 429);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    const uid = u?.user?.id;
    const { data: m } = uid ? await admin.from("membros").select("papel").eq("user_id", uid).maybeSingle() : { data: null };
    if (!m) return resp({ erro: "Sem acesso ao sistema." }, 403);
    if (!(await dentroDoLimite(admin, "planilha:u:" + uid, 30, 600))) return resp({ erro: "Muitas leituras seguidas. Espere alguns minutos." }, 429);

    let id = Deno.env.get("PLANILHA_ID") || "";
    if (!id) { const { data } = await admin.rpc("ajuste_servidor", { p_chave: "planilha_id" }); id = String(data || ""); }
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) { console.error("planilha_id ausente ou inválido"); return resp({ erro: "A planilha não está configurada no servidor." }, 500); }
    const link = `https://docs.google.com/spreadsheets/d/${id}/edit`;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* corpo vazio */ }
    if (body && body.acao === "link") return resp({ link });

    const saTxt = Deno.env.get("GOOGLE_SA_JSON");
    let r: Response;
    try {
      if (saTxt) {
        const token = await tokenGoogle(JSON.parse(saTxt));
        r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(XLSX)}`, { headers: { Authorization: "Bearer " + token } });
      } else {
        r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, { redirect: "follow" });
      }
    } catch (e) {
      console.error("google:", (e as Error)?.message || e);
      return resp({ erro: "Não foi possível falar com o Google agora. Tente de novo em instantes." }, 502);
    }
    if (!r.ok) {
      console.error("google respondeu", r.status, (await r.text()).slice(0, 300));
      return resp({ erro: saTxt ? "O Google não liberou a planilha para a conta de serviço. Confira se ela foi compartilhada com o e-mail da conta como Leitor." : "O Google não liberou a planilha. Confira se ela continua compartilhada." }, 502);
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return resp({ erro: "O Google pediu login para abrir a planilha (ela está restrita e a conta de serviço ainda não foi configurada)." }, 502);
    }
    return resp({ content: encodeBase64(buf), bytes: buf.length, lidoEm: Date.now(), link, via: saTxt ? "conta-de-servico" : "link-publico" });
  } catch (e) {
    console.error("planilha:", (e as Error)?.message || e);
    return resp({ erro: "Erro no servidor ao ler a planilha. Tente de novo." }, 500);
  }
});
