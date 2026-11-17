// Carro esportivo de desenho próprio (PneusBR), versão 2 (16/11/2026): superesportivo de motor central, todo em curvas,
// com para-lamas altos, cintura fina, entrada de ar esculpida atrás da porta e cabine em gota com teto preto.
// Modelado por funções: X = frente, Y = alto, Z = lado (+Z = lado direito). Gera malhas com nomes; os materiais finais
// (pintura com verniz, vidro, couro, borracha, aro, luzes) são aplicados no site por materiais.js.
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { toCreasedNormals, mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LETRAS } from './letras.js';

const PI = Math.PI;
const curva = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), n = xs.length;
  const m = k => k <= 0 ? (ys[1] - ys[0]) / (xs[1] - xs[0]) : k >= n - 1 ? (ys[k] - ys[k - 1]) / (xs[k] - xs[k - 1]) : (ys[k + 1] - ys[k - 1]) / (xs[k + 1] - xs[k - 1]);
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const x0 = xs[i], x1 = xs[i + 1], t = (x - x0) / (x1 - x0), y0 = ys[i], y1 = ys[i + 1];
    let m0 = m(i) * (x1 - x0), m1 = m(i + 1) * (x1 - x0);
    if ((y1 - y0) * m0 < 0) m0 = 0; if ((y1 - y0) * m1 < 0) m1 = 0;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  };
};
const gauss = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
export const DIM = { xr: -2.25, xf: 2.30, eixoD: 1.32, eixoT: -1.36, bitola: 0.86, raio: 0.35 };

// perfil (linha do meio), base, linha da cintura (parte mais larga), meia largura e "quadradez" da seção
const topo = curva([[-2.25, 0.835], [-2.238, 0.895], [-2.215, 0.925], [-2.17, 0.928], [-1.95, 0.915], [-1.55, 0.908], [-1.10, 0.90], [-0.60, 0.885], [0.00, 0.86], [0.55, 0.815], [0.95, 0.765], [1.35, 0.715], [1.75, 0.645], [2.05, 0.565], [2.22, 0.47], [2.30, 0.37]]);
const base = curva([[-2.25, 0.33], [-2.22, 0.27], [-2.10, 0.20], [-1.90, 0.15], [-1.60, 0.125], [-1.00, 0.11], [1.00, 0.11], [1.80, 0.12], [2.10, 0.15], [2.24, 0.20], [2.30, 0.27]]);
const cint = curva([[-2.25, 0.585], [-2.10, 0.575], [-1.40, 0.56], [-0.60, 0.49], [0.30, 0.47], [0.95, 0.53], [1.32, 0.565], [1.70, 0.53], [1.95, 0.45], [2.15, 0.37], [2.30, 0.32]]);
const meia = curva([[-2.25, 0.86], [-2.235, 0.935], [-2.19, 0.985], [-2.05, 1.025], [-1.85, 1.05], [-1.40, 1.065], [-1.00, 1.035], [-0.50, 0.965], [0.15, 0.935], [0.75, 0.97], [1.32, 1.03], [1.70, 1.0], [1.95, 0.955], [2.12, 0.885], [2.22, 0.80], [2.28, 0.69], [2.30, 0.58]]);
const nCima = curva([[-2.25, 3.0], [-2.10, 3.0], [-2.05, 2.9], [-1.36, 3.6], [-0.60, 3.0], [0.50, 3.0], [1.32, 4.2], [1.95, 3.0], [2.30, 2.2]]);
// crista dos para-lamas: uma linha comprida que nasce no farol e morre na porta (sem "bolha" em cima da roda)
const cristaD = curva([[0.30, 0], [0.75, 0.05], [1.05, 0.112], [1.40, 0.148], [1.75, 0.135], [2.00, 0.092], [2.20, 0.035], [2.30, 0]]);
const cristaT = curva([[-2.25, 0], [-2.00, 0.035], [-1.60, 0.062], [-1.25, 0.06], [-0.85, 0.03], [-0.50, 0]]);
const nBaixo = curva([[-2.25, 3.2], [-2.05, 3.2], [-1.00, 3.6], [1.00, 3.6], [2.05, 3.0], [2.30, 2.2]]);

export function ptCorpo(x, a) { // a: 0 = lado direito, pi/2 = topo, pi = lado esquerdo, 3pi/2 = baixo
  const t = topo(x), b = base(x), w = meia(x), yc = cint(x);
  const c = Math.cos(a), s = Math.sin(a), n = s >= 0 ? nCima(x) : nBaixo(x);
  const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  let y = s >= 0 ? yc + (t - yc) * ss : yc + (yc - b) * ss;
  // para-lamas: sobem acima do capô e da tampa do motor (o meio fica baixo, como nos superesportivos)
  const F = cristaD(x) + cristaT(x);
  if (s > 0) y += F * Math.sqrt(s) * Math.exp(-Math.pow((Math.abs(sc) - 0.80) / 0.32, 2));
  // laterais: caem para dentro em cima, com um vinco fino no ombro; a porta tem um canal que leva o ar até a entrada
  const aperto = 1 - 0.11 * Math.pow(Math.max(0, -s), 2) - 0.20 * Math.pow(Math.max(0, s), 3);
  const vinco = 1 + 0.008 * Math.exp(-Math.pow((s - 0.32) / 0.11, 2));
  const lat = Math.pow(Math.abs(c), 3);
  const entrada = 0.085 * gauss(x, -0.70, 0.26) * gauss(s, 0.10, 0.32);
  const canal = 0.03 * gauss(s, 0.02, 0.22) * gauss(x, -0.10, 0.75);
  return new THREE.Vector3(x, y, w * sc * aperto * vinco * (1 - lat * (entrada + canal)));
}
export function alturaEm(x, z) {
  let a0 = 0, a1 = PI / 2; const zz = Math.abs(z);
  for (let k = 0; k < 40; k++) { const am = (a0 + a1) / 2; if (ptCorpo(x, am).z > zz) a0 = am; else a1 = am; }
  return ptCorpo(x, (a0 + a1) / 2).y;
}
// cabine em gota (cockpit avançado)
const teto = curva([[-1.62, 0.92], [-1.40, 0.96], [-1.10, 1.03], [-0.75, 1.10], [-0.40, 1.135], [-0.10, 1.13], [0.20, 1.075], [0.45, 0.975], [0.66, 0.86], [0.78, 0.80]]);
const largB = curva([[-1.62, 0.50], [-1.35, 0.72], [-0.90, 0.80], [-0.10, 0.82], [0.40, 0.76], [0.78, 0.60]]);
const largT = curva([[-1.62, 0.36], [-1.35, 0.46], [-0.90, 0.55], [-0.20, 0.58], [0.35, 0.52], [0.78, 0.44]]);
export const CAB = { x0: -1.62, x1: 0.78 };
export function ptCabine(x, a) {
  const n = 2.9, c = Math.cos(a), s = Math.sin(a);
  const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), f = Math.pow(Math.abs(s), 2 / n);
  const w = largB(x) + (largT(x) - largB(x)) * Math.pow(f, 1.15), z = w * sc;
  const r = alturaEm(x, largB(x) * sc) - 0.02, tt = Math.max(teto(x), topo(x) + 0.002);
  return new THREE.Vector3(x, r + (tt - r) * f, z);
}

function grade(fn, u0, u1, v0, v1, nu, nv, { fecharV = false, desloc = 0, tampas = false, classe = null } = {}) {
  const pos = [], nvv = fecharV ? nv : nv + 1;
  const ponto = (u, v) => {
    const p = fn(u, v);
    if (desloc) { const e = 1e-3; const pu = fn(u + e, v).sub(fn(u - e, v)), pv = fn(u, v + e).sub(fn(u, v - e)); p.add(new THREE.Vector3().crossVectors(pu, pv).normalize().multiplyScalar(desloc)); }
    return p;
  };
  for (let i = 0; i <= nu; i++) { const u = u0 + (u1 - u0) * i / nu; for (let j = 0; j < nvv; j++) { const v = v0 + (v1 - v0) * j / nv; const p = ponto(u, v); pos.push(p.x, p.y, p.z); } }
  const tris = {};
  const add = (nome, a, b, c) => { (tris[nome] = tris[nome] || []).push(a, b, c); };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * nvv + j, b = (i + 1) * nvv + j, c = (i + 1) * nvv + (j + 1) % nvv, d = i * nvv + (j + 1) % nvv;
    const nome = classe ? classe(u0 + (u1 - u0) * (i + 0.5) / nu, v0 + (v1 - v0) * (j + 0.5) / nv) : '_';
    add(nome, a, b, d); add(nome, b, c, d);
  }
  if (tampas) for (const [i, inv] of [[0, false], [nu, true]]) {
    let cx = 0, cy = 0, cz = 0; for (let j = 0; j < nvv; j++) { const k = (i * nvv + j) * 3; cx += pos[k]; cy += pos[k + 1]; cz += pos[k + 2]; }
    const ci = pos.length / 3; pos.push(cx / nvv, cy / nvv, cz / nvv);
    for (let j = 0; j < nvv; j++) { const a = i * nvv + j, b = i * nvv + (j + 1) % nvv; if (inv) add('_', ci, b, a); else add('_', ci, a, b); }
  }
  const out = {};
  for (const [nome, idx] of Object.entries(tris)) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); out[nome] = g;
  }
  return classe ? out : out['_'];
}
const malha = (g, nome) => { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); m.name = nome; return m; };

// ---------- roda (aro de 5 pares de raios torcidos e côncavos, faces usinadas e laterais grafite; desenho próprio) ----------
// separa uma geometria extrudada em frente/trás (grupo 0) e laterais (grupo 1), para pintar cada parte de um jeito
function porGrupo(g) {
  const out = [], pos = g.attributes.position, nor = g.attributes.normal;
  for (const gr of g.groups) {
    const P = [], N = [];
    for (let k = gr.start; k < gr.start + gr.count; k++) { const v = g.index ? g.index.getX(k) : k; P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); N.push(nor.getX(v), nor.getY(v), nor.getZ(v)); }
    const s = new THREE.BufferGeometry(); s.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); s.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out[gr.materialIndex] = out[gr.materialIndex] ? mergeGeometries([out[gr.materialIndex], s]) : s;
  }
  return out;
}
function roda(largura) {
  const g = new THREE.Group(), R = DIM.raio, ra = 0.274, w2 = largura / 2;
  const pts = [[ra - 0.006, -w2 + 0.014], [ra + 0.012, -w2], [R - 0.03, -w2 - 0.004], [R - 0.009, -w2 + 0.02], [R - 0.001, -w2 + 0.06], [R + 0.002, 0], [R - 0.001, w2 - 0.06], [R - 0.009, w2 - 0.02], [R - 0.03, w2 + 0.004], [ra + 0.012, w2], [ra - 0.006, w2 - 0.014]];
  const pneu = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 144); pneu.rotateX(PI / 2);
  g.add(malha(pneu, 'pneu'));
  const fundo = new THREE.CircleGeometry(ra, 48); fundo.translate(0, 0, -w2 + 0.02); g.add(malha(fundo, 'roda-fundo'));
  // tambor do aro (o "copo" por dentro dos raios) e disco de freio com o chapéu
  const barril = new THREE.LatheGeometry([[ra - 0.004, w2 - 0.032], [ra - 0.012, w2 - 0.05], [ra - 0.018, w2 - 0.08], [ra - 0.02, -w2 + 0.03]].map(([r, z]) => new THREE.Vector2(r, z)), 96);
  barril.rotateX(PI / 2); barril.scale(1, 1, -1); g.add(malha(barril, 'aro-barril'));
  const disco = new THREE.RingGeometry(0.105, 0.222, 96, 2); disco.translate(0, 0, w2 - 0.135); g.add(malha(disco, 'disco'));
  const chapeu = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 48, 1, true); chapeu.rotateX(PI / 2); chapeu.translate(0, 0, w2 - 0.12); g.add(malha(chapeu, 'aro-cubo'));
  // raios: largos no cubo, finos no aro, girando um pouco ao longo do raio; o cubo fica para dentro (aro côncavo)
  const r0 = 0.072, r1 = ra - 0.02, faces = [], lados = [];
  for (let k = 0; k < 10; k++) {
    const sh = new THREE.Shape(); sh.moveTo(r0, -0.024); sh.quadraticCurveTo((r0 + r1) * 0.5, -0.015, r1, -0.0135); sh.lineTo(r1, 0.0135); sh.quadraticCurveTo((r0 + r1) * 0.5, 0.015, r0, 0.024); sh.closePath();
    const e = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.0045, bevelSegments: 3, steps: 1, curveSegments: 8 });
    const pos = e.attributes.position, base = k * 2 * PI / 10 + (k % 2 ? -0.075 : 0.075);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y), f = Math.min(1, Math.max(0, (r - r0) / (r1 - r0)));
      const ang = Math.atan2(y, x) + base + 0.17 * f * f - (k % 2 ? -0.055 : 0.055) * f;
      pos.setXYZ(i, Math.cos(ang) * r, Math.sin(ang) * r, pos.getZ(i) + w2 - 0.085 - 0.06 * Math.pow(1 - f, 1.4));
    }
    e.computeVertexNormals(); const [fa, la] = porGrupo(e); faces.push(fa); lados.push(la);
  }
  g.add(malha(mergeGeometries(faces), 'aro')); g.add(malha(mergeGeometries(lados), 'aro-lado'));
  // aba do aro (borda polida) e cubo com porcas
  const flange = new THREE.LatheGeometry([[ra - 0.026, w2 - 0.07], [ra - 0.016, w2 - 0.05], [ra - 0.006, w2 - 0.035], [ra, w2 - 0.03]].map(([r, z]) => new THREE.Vector2(r, z)), 120); flange.rotateX(PI / 2); flange.scale(1, 1, -1);
  g.add(malha(flange, 'aro-labio'));
  const labio = new THREE.TorusGeometry(ra - 0.004, 0.009, 12, 120); labio.translate(0, 0, w2 - 0.03); g.add(malha(labio, 'aro-labio'));
  const cubo = new THREE.CylinderGeometry(0.08, 0.088, 0.04, 48); cubo.rotateX(PI / 2); cubo.translate(0, 0, w2 - 0.13); g.add(malha(cubo, 'aro-lado'));
  const tampa = new THREE.CylinderGeometry(0.034, 0.036, 0.022, 40); tampa.rotateX(PI / 2); tampa.translate(0, 0, w2 - 0.105); g.add(malha(tampa, 'aro-cubo'));
  const anel = new THREE.TorusGeometry(0.03, 0.0035, 8, 40); anel.translate(0, 0, w2 - 0.094); g.add(malha(anel, 'aro-labio'));
  const porcas = []; for (let k = 0; k < 5; k++) { const a = k * 2 * PI / 5 + PI / 10, p = new THREE.CylinderGeometry(0.0085, 0.0085, 0.02, 6); p.rotateX(PI / 2); p.translate(Math.cos(a) * 0.058, Math.sin(a) * 0.058, w2 - 0.105); porcas.push(p); }
  g.add(malha(mergeGeometries(porcas), 'aro-labio'));
  return g;
}
function pinca(largura) {
  const sh = new THREE.Shape(); sh.absarc(0, 0, 0.236, PI * 0.58, PI * 0.95, false); sh.absarc(0, 0, 0.16, PI * 0.95, PI * 0.58, true); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, largura / 2 - 0.175); return malha(g, 'pinca');
}
// banco esportivo (concha arredondada com friso vermelho)
function banco(z) {
  const g = new THREE.Group();
  const ass = new THREE.SphereGeometry(1, 32, 16); ass.scale(0.25, 0.065, 0.21); ass.translate(-0.36, 0.33, z); g.add(malha(ass, 'banco'));
  const enc = new THREE.SphereGeometry(1, 32, 16); enc.scale(0.085, 0.33, 0.21); enc.rotateZ(-0.30); enc.translate(-0.58, 0.60, z); g.add(malha(enc, 'banco'));
  for (const dz of [0.17, -0.17]) { const ab = new THREE.SphereGeometry(1, 24, 12); ab.scale(0.05, 0.26, 0.045); ab.rotateZ(-0.30); ab.translate(-0.55, 0.58, z + dz); g.add(malha(ab, 'banco-friso')); }
  return g;
}
// liga dois pontos com um cilindro (haste do retrovisor)
function haste(p0, p1, r, nome) {
  const d = new THREE.Vector3().subVectors(p1, p0), g = new THREE.CylinderGeometry(r, r * 1.2, d.length(), 16);
  const m = malha(g, nome); m.position.copy(p0).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

export function montarCarro() {
  const raiz = new THREE.Group(); raiz.name = 'carro';
  const carro = new THREE.Group(); carro.name = 'corpo'; raiz.add(carro);
  // ---- carroceria: caixas de roda e cockpit cortados ----
  const corpoG = mergeVertices(grade(ptCorpo, DIM.xr, DIM.xf, 0, 2 * PI, 220, 160, { fecharV: true, tampas: true }));
  corpoG.computeVertexNormals();
  const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;
  const mPint = new THREE.MeshStandardMaterial({ name: 'pintura' }), mCx = new THREE.MeshStandardMaterial({ name: 'caixa-roda' }), mCk = new THREE.MeshStandardMaterial({ name: 'interior' });
  let b = new Brush(corpoG, mPint); b.updateMatrixWorld();
  const cortar = (g, m) => { const c = new Brush(g, m); c.updateMatrixWorld(); b = ev.evaluate(b, c, SUBTRACTION); b.updateMatrixWorld(); };
  for (const xc of [DIM.eixoD, DIM.eixoT]) for (const zs of [1, -1]) {
    const cil = new THREE.CylinderGeometry(0.385, 0.385, 0.95, 120, 1); cil.rotateX(PI / 2); cil.translate(xc, DIM.raio, zs * 1.175);
    cortar(cil, mCx);
  }
  { // abertura do cockpit (por baixo do vidro), para os bancos aparecerem
    const sh = new THREE.Shape(), N = 40, xa = CAB.x0 + 0.05, xb = CAB.x1 - 0.07;
    for (let i = 0; i <= N; i++) { const x = xa + (xb - xa) * i / N; const p = [x, largB(x) * 0.965]; i ? sh.lineTo(...p) : sh.moveTo(...p); }
    for (let i = N; i >= 0; i--) { const x = xa + (xb - xa) * i / N; sh.lineTo(x, -largB(x) * 0.965); }
    const ck = new THREE.ExtrudeGeometry(sh, { depth: 1.06, bevelEnabled: false }); ck.rotateX(PI / 2); ck.translate(0, 1.30, 0);
    cortar(ck, mCk);
  }
  const geo = b.geometry;
  for (const gr of geo.groups) {
    const mat = Array.isArray(b.material) ? b.material[gr.materialIndex] : b.material;
    const P = [], pos = geo.attributes.position, ind = geo.index;
    for (let k = gr.start; k < gr.start + gr.count; k++) { const v = ind ? ind.getX(k) : k; P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
    let sub = new THREE.BufferGeometry(); sub.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    sub = toCreasedNormals(sub, PI / 4);
    carro.add(malha(sub, mat.name));
  }
  // ---- cabine: teto preto brilhante, para-brisa e janelas escuras, colunas traseiras na cor do carro ----
  const partes = grade(ptCabine, CAB.x0, CAB.x1, 0, PI, 160, 90, {
    classe: (x, a) => {
      const d = Math.abs(a - PI / 2);
      if (d > 1.40) return 'pintura';                                   // pé da cabine (continua a carroceria)
      if (x < -1.20) return d > 0.55 ? 'pintura' : 'vidro';             // colunas traseiras e vidro do motor
      if (x < -1.12) return 'preto-brilho';
      if (x < 0.26) return d < 0.55 ? 'teto' : d < 0.62 ? 'preto-brilho' : d < 1.32 ? 'vidro' : d < 1.355 ? 'cromo' : 'preto-brilho';
      if (x < 0.34) return 'preto-brilho';                              // coluna do para-brisa
      return d < 1.12 ? 'vidro' : 'preto-brilho';
    }
  });
  for (const [nome, g] of Object.entries(partes)) carro.add(malha(toCreasedNormals(g.toNonIndexed(), PI / 4), nome));
  // ---- interior (aparece pelo vidro) ----
  carro.add(banco(0.37)); carro.add(banco(-0.37));
  const painel = new THREE.BoxGeometry(0.30, 0.14, 1.30, 4, 2, 8); painel.translate(0.42, 0.66, 0); carro.add(malha(painel, 'interior'));
  const volante = new THREE.TorusGeometry(0.16, 0.018, 12, 48); volante.rotateY(PI / 2); volante.rotateZ(-0.35); volante.translate(0.14, 0.70, 0.37); carro.add(malha(volante, 'interior'));
  const tunel = new THREE.BoxGeometry(1.0, 0.16, 0.20); tunel.translate(-0.05, 0.32, 0); carro.add(malha(tunel, 'interior'));
  // ---- detalhes por cima da carroceria ----
  const sobre = (nome, x0, x1, a0, a1, nu2 = 30, nv2 = 16, d = 0.003) => carro.add(malha(grade(ptCorpo, x0, x1, a0, a1, nu2, nv2, { desloc: d }), nome));
  // faixa de forma livre: u vai de x0 a x1; aBaixo(u)/aCima(u) dão as bordas (lado direito); s = -1 espelha
  const faixa = (nome, x0, x1, aB, aC, s, nu2, nv2, d) => {
    const fn = (u, v) => { const x = x0 + (x1 - x0) * u, k = Math.min(1, Math.max(0, u)), lo = s > 0 ? aB(k) : PI - aC(k), hi = s > 0 ? aC(k) : PI - aB(k); return ptCorpo(x, lo + (hi - lo) * v); };
    carro.add(malha(grade(fn, 0, 1, 0, 1, nu2, nv2, { desloc: d }), nome));
  };
  for (const s of [1, -1]) {
    const L = (a0, a1) => s > 0 ? [a0, a1] : [PI - a1, PI - a0];
    // farol fino e puxado para trás; a luz é um traço de LED dentro
    faixa('farol-lente', 1.84, 2.215, u => 0.47 - 0.07 * u, u => 0.50 + 0.24 * Math.pow(u, 0.8), s, 30, 12, 0.004);
    faixa('farol-luz', 1.88, 2.20, u => 0.505 + 0.04 * u, u => 0.52 + 0.07 * u, s, 30, 3, 0.0062);
    // entrada de ar atrás da porta: só o fundo da concha é preto (a concha em si é pintada e pega os reflexos)
    faixa('grade', -0.86, -0.60, u => -0.06 + 0.05 * u, u => 0.27 - 0.24 * Math.pow(u, 1.3), s, 26, 12, 0.002);
    sobre('preto-fosco', DIM.eixoT + 0.42, DIM.eixoD - 0.42, ...L(-0.80, -0.52), 50, 8);          // saia
    sobre('fresta', 0.62, 0.628, ...L(-0.30, 1.05), 2, 28, 0.0035);                                // porta (frente)
    sobre('fresta', -0.44, -0.432, ...L(-0.30, 0.55), 2, 22, 0.0035);                              // porta (trás)
    sobre('preto-brilho', -0.36, -0.22, ...L(0.70, 0.745), 6, 3, 0.004);                           // maçaneta embutida
    // retrovisor aerodinâmico preso na porta, perto da coluna
    const zb = largB(0.40), yb = alturaEm(0.40, zb);
    const cab = new THREE.Vector3(0.33, yb + 0.075, s * (zb + 0.165));
    const esp = new THREE.SphereGeometry(1, 48, 24, 0, PI); esp.rotateY(PI / 2); esp.scale(0.062, 0.046, 0.13); esp.translate(cab.x, cab.y, cab.z); carro.add(malha(esp, 'pintura'));
    const fundo = new THREE.CircleGeometry(1, 40); fundo.scale(0.13, 0.046, 1); fundo.rotateY(-PI / 2); fundo.translate(cab.x - 0.001, cab.y, cab.z); carro.add(malha(fundo, 'preto-brilho'));
    const lente = new THREE.CircleGeometry(1, 40); lente.scale(0.118, 0.036, 1); lente.rotateY(-PI / 2); lente.translate(cab.x - 0.004, cab.y, cab.z); carro.add(malha(lente, 'cromo'));
    carro.add(haste(new THREE.Vector3(0.41, yb + 0.004, s * (zb + 0.02)), new THREE.Vector3(0.37, cab.y - 0.015, s * (zb + 0.07)), 0.013, 'preto-brilho'));
  }
  // frente: boca larga embaixo do bico, com lâmina (splitter) preta saindo um pouco para a frente
  sobre('grade', 2.13, 2.297, PI + 0.10, 2 * PI - 0.10, 18, 40, 0.004);
  {
    const sh = new THREE.Shape(), N = 30, xa = 1.95, xb = 2.30;
    for (let i = 0; i <= N; i++) { const x = xa + (xb - xa) * i / N; const p = [x, Math.min(meia(Math.min(x, 2.30)) * 0.80, 0.80)]; i ? sh.lineTo(...p) : sh.moveTo(...p); }
    for (let i = N; i >= 0; i--) { const x = xa + (xb - xa) * i / N; sh.lineTo(x, -Math.min(meia(Math.min(x, 2.30)) * 0.80, 0.80)); }
    const sp = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    sp.rotateX(PI / 2); sp.translate(0, 0.17, 0); carro.add(malha(sp, 'preto-brilho'));
  }
  // emblema da roda PneusBR no bico do capô (aro cromado com miolo preto), deitado sobre a superfície
  {
    const x = 2.13, p = ptCorpo(x, PI / 2), e = 2e-3;
    const tx = ptCorpo(x + e, PI / 2).sub(ptCorpo(x - e, PI / 2)), tz = ptCorpo(x, PI / 2 - e).sub(ptCorpo(x, PI / 2 + e));
    const n = new THREE.Vector3().crossVectors(tx, tz).normalize(); if (n.y < 0) n.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const aro = new THREE.TorusGeometry(0.034, 0.0055, 12, 48), miolo = new THREE.CircleGeometry(0.03, 40), cubo = new THREE.CircleGeometry(0.011, 24);
    for (const [g, nome, d] of [[aro, 'cromo', 0.004], [miolo, 'preto-brilho', 0.0035], [cubo, 'cromo', 0.0045]]) { const m = malha(g, nome); m.quaternion.copy(q); m.position.copy(p).addScaledVector(n, d); carro.add(m); }
  }
  // traseira (corte Kamm): barra de luz contornando o alto da face, grade preta embaixo e duas saídas de escape
  {
    const xr = DIM.xr, yc = cint(xr), NA = 90;
    const ponto = (a, k, dx) => { const p = ptCorpo(xr, a); return new THREE.Vector3(xr - dx, yc + (p.y - yc) * k, p.z * k); };
    const faixaFace = (nome, a0, a1, k0, k1, dx) => {
      const pos = [], idx = [];
      for (let i = 0; i <= NA; i++) { const a = a0 + (a1 - a0) * i / NA; for (const k of [k0, k1]) { const v = ponto(a, k, dx); pos.push(v.x, v.y, v.z); } }
      for (let i = 0; i < NA; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      carro.add(malha(g, nome));
    };
    faixaFace('lanterna-lente', 0.10, PI - 0.10, 0.86, 0.955, 0.002);
    faixaFace('lanterna', 0.13, PI - 0.13, 0.885, 0.93, 0.004);
    // painel preto de baixo: contorno da face abaixo de "corte", fechado por uma linha reta, um pouco para dentro da borda
    const corte = base(xr) + 0.13, cy = (corte + base(xr)) / 2;
    const painel = (nome, k, dx) => {
      const pts = []; for (let i = 0; i <= 240; i++) { const p = ptCorpo(xr, PI + PI * i / 240); if (p.y <= corte) pts.push(new THREE.Vector2(p.z * k, cy + (p.y - cy) * k)); }
      const sh = new THREE.Shape(pts); sh.closePath();
      const g = new THREE.ShapeGeometry(sh, 1); g.rotateY(-PI / 2); g.translate(xr - dx, 0, 0); carro.add(malha(g, nome));
    };
    painel('preto-brilho', 0.985, 0.002); painel('grade', 0.94, 0.003);
    for (const z of [-0.32, 0.32]) {
      const p = new THREE.CylinderGeometry(0.043, 0.046, 0.12, 40, 1, true); p.rotateZ(PI / 2); p.translate(xr - 0.012, base(xr) + 0.062, z); carro.add(malha(p, 'ponteira'));
      const f = new THREE.CircleGeometry(0.042, 32); f.rotateY(-PI / 2); f.translate(xr + 0.03, base(xr) + 0.062, z); carro.add(malha(f, 'caixa-roda'));
    }
  }
  sobre('preto-fosco', -2.25, -1.90, PI + 0.12, 2 * PI - 0.12, 20, 48, 0.003);      // difusor (parte de baixo da traseira)
  for (const z of [-0.45, -0.15, 0.15, 0.45]) {                                       // aletas do difusor
    const sh = new THREE.Shape(), N = 12, xa = -2.235, xb = -1.85;
    const fundo = x => Math.max(0.13, base(x) - 0.03);
    sh.moveTo(xa, fundo(xa)); for (let i = 0; i <= N; i++) { const x = xa + (xb - xa) * i / N; sh.lineTo(x, base(x) + 0.004); } for (let i = N; i >= 0; i--) { const x = xa + (xb - xa) * i / N; sh.lineTo(x, fundo(x)); } sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); g.translate(0, 0, z - 0.006); carro.add(malha(g, 'preto-fosco'));
  }
  const chao = new THREE.PlaneGeometry(3.6, 1.40); chao.rotateX(-PI / 2); chao.translate(0, 0.118, 0); carro.add(malha(chao, 'preto-fosco'));
  // ---- rodas (o lado esquerdo é o mesmo desenho espelhado) ----
  for (const [xc, lar, nome] of [[DIM.eixoD, 0.255, 'd'], [DIM.eixoT, 0.305, 't']]) {
    const modelo = roda(lar), pc = pinca(lar);
    for (const s of [1, -1]) {
      const piv = new THREE.Group(); piv.name = 'roda-' + nome + (s > 0 ? 'd' : 'e'); piv.position.set(xc, DIM.raio, s * DIM.bitola);
      const lado = new THREE.Group(); lado.scale.z = s; piv.add(lado);
      const gira = new THREE.Group(); gira.name = 'gira'; for (const m of modelo.children) gira.add(new THREE.Mesh(m.geometry, m.material).copy(m));
      lado.add(gira); lado.add(pc.clone()); raiz.add(piv);
    }
  }
  return raiz;
}

// ---------- letreiro "PneusBR" em letras 3D (fonte Anton, alta e estreita), em pé no chão ----------
// Medidas em "em" (a cena escala para caber na tela). Centro embaixo no meio do texto, frente virada para +Z.
// "Pneus" em preto e "BR" em vermelho escuro; frente e laterais separadas para o brilho marcar as quinas.
export const LETREIRO = { largura: LETRAS.largura, altura: LETRAS.capH, fundo: 0.2 };
export function montarLetreiro() {
  const raiz = new THREE.Group(); raiz.name = 'letreiro';
  const partes = { 'letra': [], 'letra-lado': [], 'br': [], 'br-lado': [] };
  LETRAS.letras.forEach((L, i) => {
    const sp = new THREE.ShapePath();
    for (const c of L.cmds) {
      if (c[0] === 'M') sp.moveTo(c[1], c[2]);
      else if (c[0] === 'L') sp.lineTo(c[1], c[2]);
      else if (c[0] === 'Q') sp.quadraticCurveTo(c[1], c[2], c[3], c[4]);
      else if (c[0] === 'C') sp.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    }
    const g = new THREE.ExtrudeGeometry(sp.toShapes(false), { depth: LETREIRO.fundo, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.0085, bevelSegments: 3, curveSegments: 10 });
    g.translate(L.x - LETRAS.largura / 2, 0.0085, -LETREIRO.fundo / 2);
    const [frente, lados] = porGrupo(g), br = i >= 5;
    partes[br ? 'br' : 'letra'].push(frente); partes[br ? 'br-lado' : 'letra-lado'].push(lados);
  });
  for (const [nome, gs] of Object.entries(partes)) raiz.add(malha(mergeGeometries(gs), nome));
  return raiz;
}
