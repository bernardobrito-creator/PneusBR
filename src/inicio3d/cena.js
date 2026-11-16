// Tela de início (16/11/2026): o carro 3D (desenho próprio da PneusBR, vermelho Ferrari) visto na diagonal, como o jato
// do site de referência. Chega pela esquerda fazendo a curva e para; parado, a câmera flutua de leve; ao trocar de aba,
// recua, a traseira abaixa e ele arranca para a frente. O modelo vem de carro.glb (gerado por modelo.js).
// Este arquivo vira docs/inicio3d.js (esbuild) e é carregado só quando a tela de início aparece.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { materiais, vestir, estudio, nomeBase } from './materiais.js';

const RAIO = 0.35, ENTRE_EIXOS = 2.76;
const suave = (a, b, t) => a + (b - a) * t;
const saida = t => 1 - Math.pow(1 - t, 3);        // desacelera
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return p0 * u * u * u + 3 * p1 * u * u * t + 3 * p2 * u * t * t + p3 * t * t * t; };

export async function criarCena(palco, { url = 'carro.glb', cor = '#C40A0A' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'cp3d';
  palco.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.environment = estudio(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const carro = gltf.scene.getObjectByName('carro') || gltf.scene;
  const { por } = materiais(cor); vestir(carro, por);
  const corpo = carro.getObjectByName('corpo');
  const rodas = ['roda-dd', 'roda-de', 'roda-td', 'roda-te'].map(n => carro.getObjectByName(n)).filter(Boolean);
  const acha = (raiz, nome) => { let x = null; raiz.traverse(o => { if (!x && nomeBase(o.name) === nome) x = o; }); return x; };
  const giros = rodas.map(r => acha(r, 'gira')).filter(Boolean);
  const dianteiras = rodas.filter(r => /roda-d/.test(r.name));

  // o carro anda dentro de um "mover" (posição e direção); a sombra vai junto
  const mover = new THREE.Group(); mover.add(carro); cena.add(mover);
  const tela = document.createElement('canvas'); tela.width = tela.height = 256; const g = tela.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 6, 128, 128, 128); rg.addColorStop(0, 'rgba(0,0,0,0.75)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.38)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const texSombra = new THREE.CanvasTexture(tela);
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(5.7, 2.75), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, opacity: 0.9 }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.003; mover.add(sombra);
  for (const r of rodas) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.42), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, opacity: 0.85 })); s.rotation.x = -Math.PI / 2; s.position.set(r.position.x, 0.004, r.position.z); mover.add(s); }

  // câmera: diagonal de cima, como a foto de estúdio; no celular (tela em pé) ela se afasta para o carro caber
  const ALVO = new THREE.Vector3(0.15, 0.5, 0), DIR = new THREE.Vector3(5.2, 2.55, 6.2).multiplyScalar(0.86);
  let aspecto = 1, distancia = 1;
  function redimensionar() {
    const w = palco.clientWidth || 1, h = palco.clientHeight || 1;
    renderer.setSize(w, h, false); aspecto = w / h; camera.aspect = aspecto;
    distancia = aspecto < 1 ? 1.45 / aspecto : Math.max(1.06, 1.75 / aspecto); // tela deitada: o carro inteiro com folga nas bordas camera.updateProjectionMatrix();
  }
  redimensionar();
  const ro = new ResizeObserver(() => { redimensionar(); if (!E.rodando && E.modo === 'parado') { E.rodando = true; quadro(); } }); ro.observe(palco);

  // ---------- estado e animações ----------
  const E = { modo: 'parado', t0: 0, dist: 0, prontoSaida: null, rodando: false, tempo: 0 };
  // relógio da cena (nos testes dá para desacelerar, para gravar o vídeo num computador sem placa de vídeo)
  let real0 = performance.now(), virt = real0;
  const relogio = () => { const r = performance.now(); virt += (r - real0) * (window.__velocidadeCena || 1); real0 = r; return virt; };
  function poseParada() { mover.position.set(0, 0, 0); mover.rotation.set(0, 0, 0); corpo.rotation.set(0, 0, 0); corpo.position.set(0, 0, 0); for (const r of dianteiras) r.rotation.y = 0; }
  function girarRodas(d) { for (const gr of giros) gr.rotation.z = -d / RAIO; }

  // chegada: curva de Bézier vindo da esquerda (perto da câmera) até parar no lugar, já virado para a frente
  const P = [[-11, 0, 8.5], [-5.5, 0, 5.2], [-2.8, 0, 0.25], [0, 0, 0]];
  const amostras = []; { let L = 0, ant = null; for (let i = 0; i <= 200; i++) { const t = i / 200, x = bez(P[0][0], P[1][0], P[2][0], P[3][0], t), z = bez(P[0][2], P[1][2], P[2][2], P[3][2], t); if (ant) L += Math.hypot(x - ant[0], z - ant[1]); amostras.push({ t, L, x, z }); ant = [x, z]; } }
  const COMPR = amostras[amostras.length - 1].L;
  const noCaminho = s => { // posição e direção a "s" metros do começo
    let i = 1; while (i < amostras.length - 1 && amostras[i].L < s) i++;
    const a = amostras[i - 1], b = amostras[i], k = (s - a.L) / Math.max(1e-6, b.L - a.L);
    const x = suave(a.x, b.x, k), z = suave(a.z, b.z, k), dx = b.x - a.x, dz = b.z - a.z;
    return { x, z, dir: Math.atan2(-dz, dx) };
  };
  const T_CHEGA = 2500, T_SAI = 1150;

  function quadro() {
    if (!E.rodando) return;
    requestAnimationFrame(quadro);
    const agora = relogio(), t = agora / 1000; E.tempo = t;
    if (E.modo === 'chegando') {
      const k = Math.min(1, (agora - E.t0) / T_CHEGA), s = COMPR * saida(k), p = noCaminho(s), p2 = noCaminho(Math.min(COMPR, s + 0.6));
      mover.position.set(p.x, 0, p.z); mover.rotation.y = p.dir; girarRodas(s - COMPR);
      let dd = p2.dir - p.dir; const curv = dd / 0.6; for (const r of dianteiras) r.rotation.y = Math.max(-0.45, Math.min(0.45, Math.atan(ENTRE_EIXOS * curv)));
      const v = 3 * Math.pow(1 - k, 2) * COMPR / (T_CHEGA / 1000);           // m/s
      corpo.rotation.x = Math.max(-0.035, Math.min(0.035, -curv * v * v * 0.0016)); // inclina na curva
      corpo.rotation.z = -0.012 * Math.sin(Math.min(1, Math.max(0, (k - 0.72) / 0.28)) * Math.PI) * 1.4; // freada: a frente abaixa e volta
      if (k >= 1) { E.modo = 'parado'; poseParada(); E.tParado = agora; }
    } else if (E.modo === 'saindo') {
      const u = (agora - E.t0) / T_SAI, off = 0.15;
      let x, corpoZ;
      if (u < off) { const q = u / off; x = -0.12 * Math.sin(q * Math.PI / 2); corpoZ = 0.018 * q; }
      else { const q = Math.min(1, (u - off) / (1 - off)); x = -0.12 + q * q * q * 22; corpoZ = 0.018 * (1 - q) + 0.008; }
      mover.position.set(x, 0, -Math.max(0, x) * 0.08); mover.rotation.y = -Math.max(0, x) * 0.012;
      corpo.rotation.z = corpoZ; corpo.rotation.x = 0; girarRodas(x);
      if (u >= 1) { E.modo = 'fora'; if (E.prontoSaida) { E.prontoSaida(); E.prontoSaida = null; } }
    } else if (E.modo === 'parado') {
      corpo.position.y = 0.0016 * Math.sin(t * 31) * 0.5 + 0.001 * Math.sin(t * 2.3); // motor ligado
    }
    // a câmera flutua devagar em volta do carro (como o jato do site)
    const ang = 0.05 * Math.sin(t / 9) + 0.02 * Math.sin(t / 4.1), alt = 0.10 * Math.sin(t / 13);
    const d = DIR.clone().multiplyScalar(distancia).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    camera.position.copy(ALVO).add(d).add(new THREE.Vector3(0, alt, 0)); camera.lookAt(ALVO);
    renderer.render(cena, camera);
    if (E.estatico && E.modo === 'parado') E.rodando = false; // sem animação: um quadro só, sem gastar o computador
  }
  function rodar() { if (!E.rodando) { E.rodando = true; requestAnimationFrame(quadro); } }

  return {
    entrar(animar = true) {
      if (E.prontoSaida) { E.prontoSaida(); E.prontoSaida = null; }
      poseParada(); girarRodas(0);
      E.estatico = !animar;
      if (animar) { E.modo = 'chegando'; E.t0 = relogio(); const p = noCaminho(0); mover.position.set(p.x, 0, p.z); mover.rotation.y = p.dir; }
      else E.modo = 'parado';
      rodar();
    },
    sair() {
      return new Promise(res => { E.estatico = false; E.modo = 'saindo'; E.t0 = relogio(); E.prontoSaida = res; rodar(); });
    },
    parar() { E.rodando = false; },
    estado: () => E.modo,
    destruir() { E.rodando = false; ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
