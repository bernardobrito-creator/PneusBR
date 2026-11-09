#!/bin/sh
# Copia o site gerado para a pasta de testes. O supabase-js é trocado pelo mock nos testes,
# então só a impressão digital (SRI) dele sai da cópia; o CSP continua valendo.
SP="$1"; mkdir -p "$SP/site"
sed 's# integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"##' "$(dirname "$0")/../docs/index.html" > "$SP/site/index.html"
cp "$(dirname "$0")/../docs/sw.js" "$(dirname "$0")/../docs/manifest.webmanifest" "$(dirname "$0")/../docs/icon.svg" "$SP/site/" 2>/dev/null
echo "site de teste pronto em $SP/site"
