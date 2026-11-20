#!/bin/sh
# Copia o site gerado para a pasta de testes. O supabase-js é trocado pelo mock nos testes,
# então só a impressão digital (SRI) dele sai da cópia; o CSP continua valendo.
SP="$1"; mkdir -p "$SP/site"
sed 's# integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"##' "$(dirname "$0")/../docs/index.html" > "$SP/site/index.html"
D="$(dirname "$0")/../docs"
cp "$D/sw.js" "$D/manifest.webmanifest" "$D"/*.svg "$D"/*.png "$D/favicon.ico" "$D/404.html" "$D/inicio3d.js" "$D/carro.glb" "$SP/site/" 2>/dev/null
cp -r "$D/fonts" "$SP/site/"
cp "$(dirname "$0")/mock-supabase.js" "$SP/teste/mock-supabase.js"
echo "site de teste pronto em $SP/site"
