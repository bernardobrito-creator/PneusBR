import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// Planilha "Precificação" no Google Drive (compartilhada para qualquer pessoa com o link).
const PLANILHA = "19zziFSFz1rA9uV8KimRcQI7Z8Sl3Pxbi_-nrUkQm5kk";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  // Membros enxergam a tabela de membros; quem não é membro recebe lista vazia.
  const { data: ms, error } = await sb.from("membros").select("user_id").limit(1);
  if (error || !ms || !ms.length) return resp({ erro: "Sem acesso ao sistema." }, 403);
  let r: Response;
  try {
    r = await fetch(`https://docs.google.com/spreadsheets/d/${PLANILHA}/export?format=xlsx`, { redirect: "follow" });
  } catch {
    return resp({ erro: "Não foi possível falar com o Google agora. Tente de novo em instantes." }, 502);
  }
  if (!r.ok) return resp({ erro: `O Google respondeu ${r.status}. Confira se a planilha continua compartilhada para qualquer pessoa com o link.` }, 502);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return resp({ erro: "A planilha não está compartilhada para qualquer pessoa com o link (o Google pediu login)." }, 502);
  }
  return resp({ content: encodeBase64(buf), bytes: buf.length, lidoEm: Date.now() });
});
