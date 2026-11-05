import { createClient } from "jsr:@supabase/supabase-js@2";

// Lê uma nota escaneada (imagens das páginas) com o Claude e devolve os campos em JSON.
// A chave da Anthropic fica no segredo ANTHROPIC_API_KEY do projeto; o modelo pode ser trocado em ANTHROPIC_MODEL.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const N = (t: string) => ({ anyOf: [{ type: t }, { type: "null" }] });
const CAMPOS: Record<string, unknown> = {
  tipo_documento: { type: "string", enum: ["nota_fiscal", "boleto", "nota_e_boleto", "pedido_ou_notinha", "outro"] },
  parte_nome: N("string"),
  parte_documento: N("string"),
  parte_telefone: N("string"),
  numero: N("string"),
  emissao: N("string"),
  valor_total: N("number"),
  parcelas: {
    type: "array",
    items: { type: "object", additionalProperties: false, properties: { vencimento: N("string"), valor: N("number") }, required: ["vencimento", "valor"] },
  },
  chave_nfe: N("string"),
  linha_digitavel: N("string"),
  itens_resumo: N("string"),
  descricao: N("string"),
  legivel: { type: "boolean" },
  observacao: N("string"),
};
const SCHEMA = { type: "object", additionalProperties: false, properties: CAMPOS, required: Object.keys(CAMPOS) };

const instrucoes = (col: string) => `Você lê documentos escaneados de uma loja de pneus e autopeças do Brasil (PneusBR) e devolve os dados de uma nota a ${col === "receber" ? "receber" : "pagar"}.
${col === "receber"
    ? "Nota a receber: a loja é a vendedora. \"parte\" é o CLIENTE: o destinatário da nota fiscal, o pagador (sacado) do boleto ou o nome escrito no pedido ou na notinha. Nunca é a própria PneusBR."
    : "Nota a pagar: a loja é a compradora. \"parte\" é o FORNECEDOR: o emitente da nota fiscal ou o beneficiário (cedente) do boleto. Nunca é a própria PneusBR."}
Regras:
- Datas em AAAA-MM-DD. Valores em reais como número com ponto decimal (1.234,56 vira 1234.56).
- parte_documento: só os dígitos do CNPJ ou do CPF da parte. parte_telefone: telefone ou WhatsApp da parte, se aparecer.
- numero: número da nota fiscal (sem zeros à esquerda) ou do pedido.
- parcelas: as duplicatas (fatura) da nota ou os vencimentos do boleto ou do pedido, em ordem. Um só vencimento vira uma parcela. Sem vencimento, lista vazia.
- chave_nfe: os 44 dígitos da chave de acesso, sem espaços. linha_digitavel: os 47 ou 48 dígitos do boleto, sem espaços.
- itens_resumo: até 120 caracteres com os principais itens e quantidades. descricao: até 60 caracteres, por exemplo "NF-e 9497 · peças de suspensão".
- Letra de mão vale: leia com cuidado. Não invente: use null quando não conseguir ler um campo.
- legivel: false se o documento estiver ilegível. observacao: algo curto que o lojista deve conferir, ou null.`;

async function chamarClaude(key: string, corpo: Record<string, unknown>) {
  return await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(100000),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ms, error } = await sb.from("membros").select("user_id").limit(1);
  if (error || !ms || !ms.length) return resp({ erro: "Sem acesso ao sistema." }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return resp({ erro: "A leitura com IA ainda não foi configurada.", codigo: "ia-nao-configurada" }, 503);

  let body: { col?: string; texto?: string; imagens?: { tipo?: string; dados?: string }[] };
  try { body = await req.json(); } catch { return resp({ erro: "Pedido inválido." }, 400); }
  const col = body.col === "receber" ? "receber" : "pagar";
  const imagens = (Array.isArray(body.imagens) ? body.imagens : []).slice(0, 5)
    .filter((i) => i && typeof i.dados === "string" && /^image\/(jpeg|png|webp)$/.test(i.tipo || ""));
  if (!imagens.length) return resp({ erro: "Nenhuma página para ler." }, 400);
  if (imagens.some((i) => i.dados!.length > 6_500_000)) return resp({ erro: "A imagem escaneada é grande demais." }, 413);

  // texto do PDF digital (quando existe) ajuda a ler números e nomes sem erro
  const texto = typeof body.texto === "string" ? body.texto.slice(0, 20000).trim() : "";
  const modelo = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const corpo: Record<string, unknown> = {
    model: modelo,
    max_tokens: 6000,
    system: instrucoes(col),
    messages: [{
      role: "user",
      content: [
        ...imagens.map((i) => ({ type: "image", source: { type: "base64", media_type: i.tipo, data: i.dados } })),
        ...(texto ? [{ type: "text", text: "Texto extraído do PDF (pode conter os mesmos dados, use para conferir):\n" + texto }] : []),
        { type: "text", text: `Leia ${imagens.length > 1 ? "estas " + imagens.length + " páginas" : "este documento"} e preencha os campos.` },
      ],
    }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  };
  let r: Response;
  try {
    r = await chamarClaude(key, corpo);
    if (r.status === 400) {
      const t = await r.clone().text();
      if (/effort/i.test(t)) { corpo.output_config = { format: { type: "json_schema", schema: SCHEMA } }; r = await chamarClaude(key, corpo); }
    }
  } catch {
    return resp({ erro: "A IA demorou demais ou não respondeu. Tente de novo." }, 504);
  }
  if (!r.ok) {
    const t = await r.text();
    let detalhe = ""; try { detalhe = String(JSON.parse(t)?.error?.message || "").slice(0, 160); } catch { /* sem detalhe */ }
    const msg = r.status === 401 ? "A chave da Anthropic está errada ou foi desativada."
      : r.status === 402 || /credit|billing|balance/i.test(t) ? "A conta da Anthropic está sem crédito."
      : r.status === 429 ? "Muitas leituras ao mesmo tempo. Espere um pouco e tente de novo."
      : r.status === 529 || r.status >= 500 ? "A IA está sobrecarregada agora. Tente de novo em instantes."
      : `A IA recusou o pedido (${r.status}${detalhe ? ": " + detalhe : ""}).`;
    return resp({ erro: msg, status: r.status }, 502);
  }
  const j = await r.json();
  if (j.stop_reason === "refusal") return resp({ erro: "A IA não quis ler este documento." }, 422);
  const saida = (j.content || []).find((b: { type: string }) => b.type === "text")?.text;
  let dados: unknown;
  try { dados = JSON.parse(saida); } catch { return resp({ erro: "A IA devolveu uma resposta que não deu para entender. Tente de novo." }, 502); }
  return resp({ dados, modelo: j.model || modelo, uso: j.usage || null });
});
