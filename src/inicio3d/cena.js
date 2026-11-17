// Tela de início (17/11/2026): o carro 3D (desenho próprio da PneusBR) parado na diagonal, como o jato do site de
// referência, num piso de galpão vitrificado que reflete o carro; atrás dele, o letreiro "PneusBR" gigante em letras 3D
// em pé no chão. Parado, a câmera flutua de leve; ao trocar de aba, o carro recua, a traseira abaixa e ele arranca.
// O modelo e o letreiro vêm de carro.glb (gerado por modelo.js). Este arquivo vira docs/inicio3d.js (esbuild) e é
// carregado só quando a tela de início aparece.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { materiais, vestir, estudio, nomeBase } from './materiais.js';

const RAIO = 0.35;
const LARG_LETREIRO = 3.39, ALT_LETREIRO = 0.86;   // em "em" (ver letras.js)

// piso vitrificado: transparente (a cor vem do degradê da página por trás); só acrescenta o reflexo do carro e do
// letreiro (mais forte quando se olha rasante, um pouco desfocado) e as juntas das placas, que somem no fundo
const PISO = {
  name: 'PisoVitrificado',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uCentro: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(0, 1) }, uFim: { value: new THREE.Vector2(6, 11) },
    uPlaca: { value: 2.5 }, uAng: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) }
  },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vMundo;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0); vMundo = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uCentro, uDir, uFim, uTexel; uniform float uPlaca, uAng;
    varying vec4 vUv; varying vec3 vMundo;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      vec4 r = texture2D(tDiffuse, uv) * 0.36;
      r += texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0) * 1.6) * 0.16;
      r += texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0) * 1.6) * 0.16;
      r += texture2D(tDiffuse, uv + vec2(0.0, uTexel.y) * 1.6) * 0.16;
      r += texture2D(tDiffuse, uv - vec2(0.0, uTexel.y) * 1.6) * 0.16;
      vec2 p = vMundo.xz - uCentro;
      float atras = dot(p, -uDir);
      float fim = 1.0 - smoothstep(uFim.x, uFim.y, atras);
      vec3 vista = normalize(cameraPosition - vMundo);
      float fres = mix(0.2, 0.62, pow(1.0 - vista.y, 3.0));
      float ar = clamp(r.a, 0.0, 1.0) * fres * fim;
      vec3 rc = r.a > 0.001 ? r.rgb / r.a : vec3(0.0);
      float c = cos(uAng), s = sin(uAng);
      vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / uPlaca;
      vec2 g = abs(fract(q + 0.5) - 0.5), fw = fwidth(q);
      vec2 l = 1.0 - smoothstep(fw * 0.4, fw * 1.4, g);
      float junta = max(l.x, l.y) * 0.12 * fim * (1.0 - smoothstep(0.04, 0.14, max(fw.x, fw.y)));
      float a = ar + junta * (1.0 - ar);
      vec3 cor = a > 0.001 ? (rc * ar + vec3(0.012) * junta * (1.0 - ar)) / a : vec3(0.0);
      gl_FragColor = vec4(cor, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export async function criarCena(palco, { url = 'carro.glb', cor } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'cp3d';
  palco.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.environment = estudio(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);

  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const carro = gltf.scene.getObjectByName('carro') || gltf.scene;
  const letreiro = gltf.scene.getObjectByName('letreiro');
  const { por } = materiais(cor); vestir(carro, por); if (letreiro) vestir(letreiro, por);
  const corpo = carro.getObjectByName('corpo');
  const rodas = ['roda-dd', 'roda-de', 'roda-td', 'roda-te'].map(n => carro.getObjectByName(n)).filter(Boolean);
  const acha = (raiz, nome) => { let x = null; raiz.traverse(o => { if (!x && nomeBase(o.name) === nome) x = o; }); return x; };
  const giros = rodas.map(r => acha(r, 'gira')).filter(Boolean);
  const dianteiras = rodas.filter(r => /roda-d/.test(r.name));

  // sombras de contato (manchas suaves embaixo do carro e de cada roda)
  const mover = new THREE.Group(); mover.add(carro); cena.add(mover);
  const tela = document.createElement('canvas'); tela.width = tela.height = 256; const g = tela.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 6, 128, 128, 128); rg.addColorStop(0, 'rgba(0,0,0,0.75)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.38)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const texSombra = new THREE.CanvasTexture(tela);
  const manchas = (dono, w, d, op, x = 0, z = 0) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, opacity: op })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, z); s.renderOrder = 2; dono.add(s); return s; };
  manchas(mover, 5.7, 2.75, 0.9);
  for (const r of rodas) manchas(mover, 0.9, 0.42, 0.85, r.position.x, r.position.z);

  // câmera: diagonal de cima, como a foto de estúdio
  const ALVO = new THREE.Vector3(0.15, 0.72, 0), DIR = new THREE.Vector3(5.2, 2.55, 6.2).multiplyScalar(0.86);
  const H = new THREE.Vector3(DIR.x, 0, DIR.z).normalize();            // do carro para a câmera, no chão
  const ANG = Math.atan2(H.x, H.z);

  // letreiro em pé atrás do carro, de frente para a câmera (um pouco girado, para as laterais das letras aparecerem)
  const ATRAS = 4.6, GIRO = 0.12;
  if (letreiro) {
    letreiro.rotation.y = ANG - GIRO;
    letreiro.position.set(ALVO.x - H.x * ATRAS, 0, ALVO.z - H.z * ATRAS);
    manchas(letreiro, LARG_LETREIRO * 1.04, 0.42, 0.75);
    cena.add(letreiro);
  }

  // piso vitrificado
  const piso = new Reflector(new THREE.PlaneGeometry(90, 90), { textureWidth: 512, textureHeight: 512, clipBias: 0.002, shader: PISO, multisample: 0 });
  piso.rotation.x = -Math.PI / 2; piso.renderOrder = 1;
  Object.assign(piso.material, { transparent: true, depthWrite: false });
  const U = piso.material.uniforms;
  U.uCentro.value.set(ALVO.x, ALVO.z); U.uDir.value.set(H.x, H.z); U.uAng.value = ANG - GIRO; U.uFim.value.set(ATRAS + 0.8, ATRAS + 5.5);
  cena.add(piso);

  let aspecto = 1, distancia = 1;
  const tamanho = new THREE.Vector2();
  function redimensionar() {
    const w = palco.clientWidth || 1, h = palco.clientHeight || 1;
    renderer.setSize(w, h, false); aspecto = w / h; camera.aspect = aspecto;
    // a câmera se afasta conforme a largura da tela, para o carro inteiro caber com folga nas bordas (em pé ou deitada)
    distancia = Math.max(1.06, 1.75 / aspecto);
    camera.updateProjectionMatrix();
    // o letreiro ocupa quase toda a largura visível na distância em que está, sem passar do alto da tela
    if (letreiro) {
      const meioFov = THREE.MathUtils.degToRad(camera.fov / 2), horiz = Math.hypot(DIR.x, DIR.z);
      const vis = 2 * (DIR.length() * distancia + ATRAS) * Math.tan(meioFov) * aspecto;
      const camY = ALVO.y + DIR.y * distancia - 0.1, chao = horiz * distancia + ATRAS;
      const topo = Math.atan2(DIR.y, horiz) - meioFov + 2 * meioFov * 0.11;     // 11% abaixo do alto da tela
      letreiro.scale.setScalar(Math.min(0.88 * vis / LARG_LETREIRO, (camY - Math.tan(topo) * chao) / ALT_LETREIRO));
    }
    renderer.getDrawingBufferSize(tamanho);
    const rw = Math.max(64, Math.round(tamanho.x * 0.5)), rh = Math.max(64, Math.round(tamanho.y * 0.5));
    piso.getRenderTarget().setSize(rw, rh); U.uTexel.value.set(1 / rw, 1 / rh);
  }
  redimensionar();
  const ro = new ResizeObserver(() => { redimensionar(); if (!E.rodando && E.modo === 'parado') { E.rodando = true; quadro(); } }); ro.observe(palco);

  // ---------- estado e animações ----------
  const E = { modo: 'parado', t0: 0, prontoSaida: null, rodando: false, tempo: 0 };
  // relógio da cena (nos testes dá para desacelerar, para gravar o vídeo num computador sem placa de vídeo)
  let real0 = performance.now(), virt = real0;
  const relogio = () => { const r = performance.now(); virt += (r - real0) * (window.__velocidadeCena || 1); real0 = r; return virt; };
  function poseParada() { mover.position.set(0, 0, 0); mover.rotation.set(0, 0, 0); corpo.rotation.set(0, 0, 0); corpo.position.set(0, 0, 0); for (const r of dianteiras) r.rotation.y = 0; }
  function girarRodas(d) { for (const gr of giros) gr.rotation.z = -d / RAIO; }
  const T_SAI = 1150;

  function quadro() {
    if (!E.rodando) return;
    requestAnimationFrame(quadro);
    const agora = relogio(), t = agora / 1000; E.tempo = t;
    if (E.modo === 'saindo') {
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
    // o carro já aparece parado (sem a chegada); com animação, a cena surge num esmaecer curto
    entrar(animar = true) {
      if (E.prontoSaida) { E.prontoSaida(); E.prontoSaida = null; }
      poseParada(); girarRodas(0);
      E.estatico = !animar; E.modo = 'parado';
      if (animar && renderer.domElement.animate) renderer.domElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: 'ease-out' });
      rodar();
    },
    sair() {
      return new Promise(res => { E.estatico = false; E.modo = 'saindo'; E.t0 = relogio(); E.prontoSaida = res; rodar(); });
    },
    parar() { E.rodando = false; },
    estado: () => E.modo,
    destruir() { E.rodando = false; ro.disconnect(); piso.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
