#!/bin/sh
# Gera docs/inicio3d.js (cena 3D da tela de início) a partir de src/inicio3d/cena.js.
# Precisa de uma pasta node_modules com three@0.170.0 e esbuild: ./src/inicio3d/build.sh <pasta node_modules>
# O modelo docs/carro.glb sai de modelo.js (ver exporta.html) e é comprimido com: gltf-transform weld + meshopt.
NM="$1"
NODE_PATH="$NM" "$NM/.bin/esbuild" "$(dirname "$0")/cena.js" --bundle --format=esm --minify --target=es2020 --legal-comments=none \
  --banner:js="/* PneusBR: tela de início. Inclui three.js r170 (MIT License, Copyright © 2010-2024 three.js authors, https://threejs.org/) */" \
  --outfile="$(dirname "$0")/../../docs/inicio3d.js"
