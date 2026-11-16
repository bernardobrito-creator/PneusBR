// Materiais e luz de estúdio do carro (pintura vermelho Ferrari com verniz, vidro escuro, borracha, aro usinado, luzes)
import * as THREE from 'three';
export function materiais(cor = '#C40A0A') {
  const preto = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  const M = {
    pintura: new THREE.MeshPhysicalMaterial({ color: cor, metalness: 0.0, roughness: 0.38, clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.0 }),
    vidro: new THREE.MeshPhysicalMaterial({ color: '#06080a', metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.25 }),
    caixa: preto('#050506'),
    pretoFosco: new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.8, metalness: 0.05 }),
    pretoBrilho: new THREE.MeshPhysicalMaterial({ color: '#060708', roughness: 0.12, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 }),
    grade: new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }),
    fresta: new THREE.MeshBasicMaterial({ color: '#1a0203' }),
    farolLente: new THREE.MeshPhysicalMaterial({ color: '#111418', roughness: 0.04, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.4 }),
    farolLuz: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef5ff', emissiveIntensity: 3.0, roughness: 0.2 }),
    lanterna: new THREE.MeshStandardMaterial({ color: '#ff2020', emissive: '#ff0a0a', emissiveIntensity: 2.4, roughness: 0.3, side: THREE.DoubleSide }),
    lanternaLente: new THREE.MeshPhysicalMaterial({ color: '#2a0204', roughness: 0.06, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide }),
    pneu: new THREE.MeshStandardMaterial({ color: '#151617', roughness: 0.9, metalness: 0.0 }),
    rodaFundo: preto('#0a0a0b'),
    disco: new THREE.MeshStandardMaterial({ color: '#8a8e94', roughness: 0.38, metalness: 0.95, side: THREE.DoubleSide }),
    aro: new THREE.MeshPhysicalMaterial({ color: '#f2f4f6', roughness: 0.2, metalness: 1.0, clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 1.7 }),
    aroLabio: new THREE.MeshStandardMaterial({ color: '#eef0f3', roughness: 0.12, metalness: 1.0 }),
    aroCubo: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.3, metalness: 0.6 }),
    pinca: new THREE.MeshPhysicalMaterial({ color: '#141518', roughness: 0.3, metalness: 0.2, clearcoat: 1 }),
    cromo: new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.1, metalness: 1.0 }),
    ponteira: new THREE.MeshStandardMaterial({ color: '#d6d9dd', roughness: 0.18, metalness: 1.0, side: THREE.DoubleSide })
  };
  const por = { 'pintura': M.pintura, 'vidro': M.vidro, 'caixa-roda': M.caixa, 'preto-fosco': M.pretoFosco, 'preto-brilho': M.pretoBrilho, 'grade': M.grade, 'fresta': M.fresta, 'farol-lente': M.farolLente, 'farol-luz': M.farolLuz, 'lanterna': M.lanterna, 'lanterna-lente': M.lanternaLente, 'pneu': M.pneu, 'roda-fundo': M.rodaFundo, 'disco': M.disco, 'aro': M.aro, 'aro-labio': M.aroLabio, 'aro-cubo': M.aroCubo, 'pinca': M.pinca, 'ponteira': M.ponteira, 'cromo': M.cromo };
  return { M, por };
}
// o GLTFLoader acrescenta _1, _2... em nomes repetidos: a peça vale pelo nome sem esse final
export const nomeBase = n => String(n || '').replace(/_\d+$/, '');
export function vestir(carro, por) { carro.traverse(o => { if (o.isMesh) { const m = por[nomeBase(o.name)]; if (m) o.material = m; } }); }

// estúdio: cúpula escura com caixas de luz (os reflexos longos na pintura é que dão o ar de foto)
export function estudio(renderer) {
  const cena = new THREE.Scene();
  const cupula = new THREE.SphereGeometry(60, 48, 24), cores = [], p = cupula.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 60; const k = y < 0 ? 0.035 : 0.06 + 0.16 * y; cores.push(k, k, k * 1.04); }
  cupula.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  cena.add(new THREE.Mesh(cupula, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const luz = (w, h, intens, pos, alvo) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intens, intens, intens), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(...alvo); cena.add(m); };
  luz(34, 10, 5.5, [0, 22, 0], [0, 0, 0]);            // caixa grande no teto
  luz(46, 2.2, 3.2, [2, 7, 24], [0, 1, 0]);           // tira lateral (lado da câmera)
  luz(46, 2.2, 2.0, [0, 7, -24], [0, 1, 0]);          // tira do outro lado
  luz(14, 6, 1.6, [30, 5, 8], [0, 1, 0]);             // luz de frente
  luz(10, 5, 0.9, [-30, 6, -6], [0, 1, 0]);           // contraluz
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(cena, 0.035).texture; pm.dispose();
  return env;
}
