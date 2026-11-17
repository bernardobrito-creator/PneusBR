// Materiais e luz de estúdio do carro (pintura vermelha metálica com verniz, vidro fumê, borracha, aro usinado, luzes)
import * as THREE from 'three';

// flocos metálicos da pintura: cada célula minúscula da superfície entorta um pouco a normal da camada de cor
// (o verniz por cima continua liso, então os reflexos seguem nítidos). As células acompanham o tamanho do pixel,
// para o brilho aparecer como "pó" fino e não virar chuvisco de longe.
const HASH = 'vec3 pbrHash(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }';
function flocos(mat, forca = 0.5) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloco;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloco = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloco;\n' + HASH)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 q = vFloco * 1500.0;
        float px = sqrt(length(dFdx(q)) * length(dFdy(q)));
        float esc = exp2(max(0.0, floor(log2(px / 0.6))));
        vec3 h = pbrHash(floor(q / esc));
        vec3 r = normalize(h * 2.0 - 1.0);
        normal = normalize(normal + r * ${forca.toFixed(3)} * step(0.45, h.z));
      }`);
  };
  mat.customProgramCacheKey = () => 'flocos' + forca;
  return mat;
}
// banda de rodagem e lateral do pneu desenhadas no próprio material (sulcos em V e canais), sem textura
function bandaPneu(mat, R) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPneu;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPneu = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPneu;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        float r = length(vPneu.xy), w = abs(vPneu.z), ang = atan(vPneu.y, vPneu.x);
        float sulco = 0.0;
        if (r > ${(R - 0.014).toFixed(4)}) {
          float canal = max(1.0 - smoothstep(0.004, 0.007, abs(w - 0.028)), 1.0 - smoothstep(0.004, 0.007, abs(w - 0.078)));
          float v = fract(ang * 9.5493 + w * 7.0);
          float lamela = (1.0 - smoothstep(0.08, 0.13, v)) * step(0.034, w) * (1.0 - step(0.13, w));
          float meio = (1.0 - smoothstep(0.06, 0.1, fract(ang * 9.5493 * 2.0 - w * 11.0))) * (1.0 - step(0.022, w));
          sulco = max(canal, max(lamela, meio));
        } else {
          sulco = 0.55 * (1.0 - smoothstep(0.0015, 0.003, abs(r - ${(R - 0.035).toFixed(4)})));
        }
        diffuseColor.rgb *= 1.0 - 0.72 * sulco;
        roughnessFactor = mix(roughnessFactor, 1.0, sulco);
      }`);
  };
  mat.customProgramCacheKey = () => 'pneu';
  return mat;
}
// disco de freio com três fileiras de furos (desenhados no material)
function furos(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDisco;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisco = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDisco;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        float r = length(vDisco.xy), ang = atan(vDisco.y, vDisco.x) / 6.2831853 + 0.5;
        float fila = floor((r - 0.125) / 0.026), dentro = step(0.0, fila) * step(fila, 2.5);
        float c = fract(ang * 30.0 + fila * 0.33);
        float d = length(vec2((c - 0.5) * r * 6.2831853 / 30.0, mod(r - 0.125, 0.026) - 0.013));
        float furo = dentro * (1.0 - smoothstep(0.0045, 0.0065, d));
        diffuseColor.rgb *= 1.0 - 0.85 * furo;
        roughnessFactor = mix(roughnessFactor, 1.0, furo);
      }`);
  };
  mat.customProgramCacheKey = () => 'disco';
  return mat;
}
export function materiais(cor = '#B3070F') {
  const preto = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const M = {
    // pintura vermelha metálica e funda: a camada de cor é metálica e meio fosca (brilho largo, escurece nas curvas)
    // e o verniz por cima é espelhado (os riscos de luz nítidos); os flocos dão o brilho de "purpurina" fina
    pintura: flocos(new THREE.MeshPhysicalMaterial({ color: cor, metalness: 0.55, roughness: 0.36, clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 1.25 }), 0.12),
    // vidro fumê: reflete o estúdio e deixa ver os bancos por dentro
    vidro: new THREE.MeshPhysicalMaterial({ color: '#0a0d11', metalness: 0.0, roughness: 0.16, clearcoat: 0, envMapIntensity: 0.45, transparent: true, opacity: 0.62, depthWrite: false }),
    teto: new THREE.MeshPhysicalMaterial({ color: '#040506', metalness: 0.0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.6 }),
    interior: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.75, metalness: 0.05 }),
    banco: new THREE.MeshPhysicalMaterial({ color: '#9a0c16', roughness: 0.48, metalness: 0.0, sheen: 0.4, sheenColor: '#ff6a6a', sheenRoughness: 0.5 }),
    bancoFriso: new THREE.MeshStandardMaterial({ color: '#121214', roughness: 0.6, metalness: 0.0 }),
    caixa: preto('#050506'),
    pretoFosco: new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.8, metalness: 0.05 }),
    pretoBrilho: new THREE.MeshPhysicalMaterial({ color: '#060708', roughness: 0.12, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 }),
    grade: new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }),
    fresta: new THREE.MeshBasicMaterial({ color: '#1a0203' }),
    farolLente: new THREE.MeshPhysicalMaterial({ color: '#111418', roughness: 0.04, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.4 }),
    farolLuz: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef5ff', emissiveIntensity: 3.0, roughness: 0.2 }),
    lanterna: new THREE.MeshStandardMaterial({ color: '#ff1a1a', emissive: '#ff0606', emissiveIntensity: 1.35, roughness: 0.3, side: THREE.DoubleSide }),
    lanternaLente: new THREE.MeshPhysicalMaterial({ color: '#2a0204', roughness: 0.06, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide }),
    pneu: bandaPneu(new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.78, metalness: 0.0 }), 0.35),
    rodaFundo: preto('#0a0a0b'),
    disco: furos(new THREE.MeshStandardMaterial({ color: '#9a9ea4', roughness: 0.42, metalness: 0.9, side: THREE.DoubleSide })),
    // aro: frente dos raios usinada (prata clara) e laterais grafite, com verniz
    aro: new THREE.MeshPhysicalMaterial({ color: '#f0f2f5', roughness: 0.3, metalness: 0.88, clearcoat: 0.8, clearcoatRoughness: 0.03, envMapIntensity: 2.4 }),
    aroLado: new THREE.MeshPhysicalMaterial({ color: '#2b2e33', roughness: 0.3, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 }),
    aroBarril: new THREE.MeshStandardMaterial({ color: '#5d6168', roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }),
    aroLabio: new THREE.MeshStandardMaterial({ color: '#f2f4f6', roughness: 0.08, metalness: 1.0, envMapIntensity: 2.6 }),
    aroCubo: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.3, metalness: 0.6 }),
    pinca: new THREE.MeshPhysicalMaterial({ color: '#c3121b', roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 }),
    // letreiro PneusBR: laca preta com verniz (as quinas acendem com a luz) e o BR em vermelho escuro
    letra: new THREE.MeshPhysicalMaterial({ color: '#0b0b0d', roughness: 0.28, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.2 }),
    letraLado: new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.4, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }),
    br: new THREE.MeshPhysicalMaterial({ color: '#5A0A13', roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.2 }),
    brLado: new THREE.MeshPhysicalMaterial({ color: '#3d060c', roughness: 0.42, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }),
    cromo: new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.1, metalness: 1.0 }),
    ponteira: new THREE.MeshStandardMaterial({ color: '#d6d9dd', roughness: 0.18, metalness: 1.0, side: THREE.DoubleSide })
  };
  const por = { 'pintura': M.pintura, 'vidro': M.vidro, 'caixa-roda': M.caixa, 'preto-fosco': M.pretoFosco, 'preto-brilho': M.pretoBrilho, 'grade': M.grade, 'fresta': M.fresta, 'farol-lente': M.farolLente, 'farol-luz': M.farolLuz, 'lanterna': M.lanterna, 'lanterna-lente': M.lanternaLente, 'pneu': M.pneu, 'roda-fundo': M.rodaFundo, 'disco': M.disco, 'aro': M.aro, 'aro-lado': M.aroLado, 'aro-barril': M.aroBarril, 'aro-labio': M.aroLabio, 'aro-cubo': M.aroCubo, 'pinca': M.pinca, 'ponteira': M.ponteira, 'cromo': M.cromo, 'letra': M.letra, 'letra-lado': M.letraLado, 'br': M.br, 'br-lado': M.brLado, 'interior': M.interior, 'banco': M.banco, 'banco-friso': M.bancoFriso, 'teto': M.teto };
  return { M, por };
}
// o GLTFLoader acrescenta _1, _2... em nomes repetidos: a peça vale pelo nome sem esse final
export const nomeBase = n => String(n || '').replace(/_\d+$/, '');
export function vestir(carro, por) { carro.traverse(o => { if (o.isMesh) { const m = por[nomeBase(o.name)]; if (m) o.material = m; } }); }

// estúdio: cúpula com chão escuro e horizonte claro (dá a linha de horizonte nas laterais, como nas fotos de carro)
// e várias caixas de luz compridas, que viram os reflexos longos e nítidos na pintura
export function estudio(renderer) {
  const cena = new THREE.Scene();
  const cupula = new THREE.SphereGeometry(60, 64, 32), cores = [], p = cupula.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 60;
    const k = y < -0.03 ? 0.018 : y < 0.0 ? 0.018 + (y + 0.03) / 0.03 * 0.30 : y < 0.12 ? 0.32 - 2.3 * y : Math.max(0.035, 0.07 - 0.05 * y);
    cores.push(k, k, k * 1.03);
  }
  cupula.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  cena.add(new THREE.Mesh(cupula, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const luz = (w, h, intens, pos, alvo) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intens, intens, intens), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(...alvo); cena.add(m); return m; };
  luz(30, 12, 1.6, [0, 24, 0], [0, 0, 0]);                       // difusor grande no teto
  for (const z of [-5, 0, 5]) luz(44, 1.3, 7.0, [0, 20, z], [0, 0, z]); // três tiras compridas no teto (riscos de luz no capô e no teto)
  luz(50, 1.8, 4.5, [0, 8, 24], [0, 1, 0]);                      // tira lateral alta (lado da câmera)
  luz(50, 0.7, 2.6, [0, 3.2, 24], [0, 1, 0]);                    // tira lateral baixa
  luz(50, 1.8, 2.2, [0, 8, -24], [0, 1, 0]);                     // tira do outro lado
  luz(14, 7, 2.0, [30, 6, 8], [0, 1, 0]);                        // luz de frente
  luz(10, 5, 1.0, [-30, 6, -6], [0, 1, 0]);                      // contraluz
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(cena, 0.008).texture; pm.dispose();
  return env;
}
