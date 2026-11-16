// Carro esportivo de desenho próprio (PneusBR), modelado por funções. X = frente, Y = alto, Z = lado (+Z = lado direito).
// Gera um grupo de malhas com nomes; os materiais finais são aplicados no site (pintura, vidro, borracha, aro, luzes).
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
export const DIM = { xr: -2.30, xf: 2.33, eixoD: 1.40, eixoT: -1.36, bitola: 0.84, raio: 0.35 };
const topo = curva([[-2.30, 0.84], [-2.22, 0.875], [-1.90, 0.885], [-1.40, 0.872], [-0.80, 0.852], [0.00, 0.838], [0.80, 0.822], [1.30, 0.765], [1.80, 0.672], [2.10, 0.602], [2.26, 0.542], [2.33, 0.47]]);
const base = curva([[-2.30, 0.36], [-2.22, 0.27], [-2.05, 0.185], [-1.70, 0.14], [-1.00, 0.118], [1.00, 0.118], [1.85, 0.128], [2.18, 0.16], [2.33, 0.24]]);
const meia = curva([[-2.30, 0.78], [-2.24, 0.90], [-2.05, 0.975], [-1.65, 1.0], [-1.15, 0.99], [-0.55, 0.945], [0.25, 0.935], [0.95, 0.962], [1.45, 0.975], [1.90, 0.94], [2.15, 0.865], [2.28, 0.745], [2.33, 0.62]]);
const expo = curva([[-2.30, 3.4], [-2.05, 4.6], [1.85, 4.6], [2.33, 3.0]]);

export function ptCorpo(x, a) { // a: 0 = lado direito, pi/2 = topo, pi = lado esquerdo, 3pi/2 = baixo
  const t = topo(x), b = base(x), w = meia(x), n = expo(x);
  const c = Math.cos(a), s = Math.sin(a);
  const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  const yc = (t + b) / 2, h = (t - b) / 2;
  const aperto = 1 - 0.07 * Math.pow(Math.max(0, -s), 2.4) - 0.2 * Math.pow(Math.max(0, s), 4);
  const vinco = 1 + 0.024 * Math.exp(-Math.pow((s - 0.42) / 0.07, 2)) - 0.012 * Math.exp(-Math.pow((s + 0.15) / 0.18, 2));
  // para-lamas: as bordas de cima sobem sobre as rodas (o capô fica baixo no meio)
  const lado = Math.pow(Math.abs(c), 1.6) * Math.max(0, s);
  const para = 0.11 * Math.exp(-Math.pow((x - DIM.eixoD) / 0.48, 2)) + 0.07 * Math.exp(-Math.pow((x - DIM.eixoT) / 0.55, 2));
  return new THREE.Vector3(x, yc + h * ss + para * lado * 1.6, w * sc * aperto * vinco);
}
// altura da carroceria num ponto (x, z) da parte de cima: acha o ângulo pela busca binária
export function alturaEm(x, z) {
  let a0 = 0, a1 = PI / 2; const zz = Math.abs(z);
  for (let k = 0; k < 40; k++) { const am = (a0 + a1) / 2; if (ptCorpo(x, am).z > zz) a0 = am; else a1 = am; }
  return ptCorpo(x, (a0 + a1) / 2).y;
}
const teto = curva([[-1.78, 0.88], [-1.48, 0.975], [-1.05, 1.07], [-0.55, 1.15], [-0.15, 1.19], [0.15, 1.185], [0.42, 1.125], [0.66, 1.01], [0.88, 0.87], [0.97, 0.82]]);
const largB = curva([[-1.78, 0.52], [-1.45, 0.78], [-0.90, 0.84], [0.40, 0.84], [0.80, 0.78], [0.97, 0.70]]);
const largT = curva([[-1.78, 0.42], [-1.45, 0.54], [-0.90, 0.62], [0.30, 0.63], [0.75, 0.59], [0.97, 0.55]]);
export const CAB = { x0: -1.78, x1: 0.97 };
export function ptCabine(x, a) { // a em [0, pi]: 0 = base direita, pi/2 = topo, pi = base esquerda
  const n = 3.4, c = Math.cos(a), s = Math.sin(a);
  const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), f = Math.pow(Math.abs(s), 2 / n);
  const w = largB(x) + (largT(x) - largB(x)) * Math.pow(f, 1.3), z = w * sc;
  const r = alturaEm(x, largB(x) * sc) - 0.02, tt = Math.max(teto(x), topo(x) + 0.002);
  return new THREE.Vector3(x, r + (tt - r) * f, z);
}

// malha amostrando uma superfície (u = x, v = ângulo); "classe" separa os triângulos em peças com nomes
function grade(fn, u0, u1, v0, v1, nu, nv, { fecharV = false, desloc = 0, tampas = false, classe = null } = {}) {
  const pos = [], nvv = fecharV ? nv : nv + 1, UV = [];
  const ponto = (u, v) => {
    let p = fn(u, v);
    if (desloc) { const e = 1e-3; const pu = fn(u + e, v).sub(fn(u - e, v)), pv = fn(u, v + e).sub(fn(u, v - e)); p.add(new THREE.Vector3().crossVectors(pu, pv).normalize().multiplyScalar(desloc)); }
    return p;
  };
  for (let i = 0; i <= nu; i++) { const u = u0 + (u1 - u0) * i / nu; for (let j = 0; j < nvv; j++) { const v = v0 + (v1 - v0) * j / nv; const p = ponto(u, v); pos.push(p.x, p.y, p.z); UV.push([u, v]); } }
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
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); out[nome] = g;
  }
  return classe ? out : out['_'];
}
const malha = (g, nome) => { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); m.name = nome; return m; };
const plano = (forma, x, viradoFrente) => { // forma 2D (z, y) num plano x = const
  const g = new THREE.ShapeGeometry(forma, 24); g.rotateY(viradoFrente ? PI / 2 : -PI / 2); g.translate(x, 0, 0); return g;
};
const retRed = (z0, y0, z1, y1, r) => { const s = new THREE.Shape(); s.moveTo(z0 + r, y0); s.lineTo(z1 - r, y0); s.quadraticCurveTo(z1, y0, z1, y0 + r); s.lineTo(z1, y1 - r); s.quadraticCurveTo(z1, y1, z1 - r, y1); s.lineTo(z0 + r, y1); s.quadraticCurveTo(z0, y1, z0, y1 - r); s.lineTo(z0, y0 + r); s.quadraticCurveTo(z0, y0, z0 + r, y0); return s; };

// ---------- roda (aro 21" de 10 raios em pares, desenho próprio) ----------
function roda(largura, lado) {
  const g = new THREE.Group(), R = DIM.raio, ra = 0.268, w2 = largura / 2;
  const pts = [[ra - 0.006, -w2 + 0.014], [ra + 0.012, -w2], [R - 0.03, -w2 - 0.003], [R - 0.008, -w2 + 0.022], [R - 0.001, -w2 + 0.055], [R + 0.002, 0], [R - 0.001, w2 - 0.055], [R - 0.008, w2 - 0.022], [R - 0.03, w2 + 0.003], [ra + 0.012, w2], [ra - 0.006, w2 - 0.014]];
  const pneu = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 120); pneu.rotateX(PI / 2);
  g.add(malha(pneu, 'pneu'));
  const fundo = new THREE.CircleGeometry(ra, 48); if (lado < 0) fundo.rotateY(PI); fundo.translate(0, 0, -lado * 0.03); g.add(malha(fundo, 'roda-fundo'));
  const disco = new THREE.RingGeometry(0.075, 0.19, 64); if (lado < 0) disco.rotateY(PI); disco.translate(0, 0, lado * (w2 - 0.12)); g.add(malha(disco, 'disco'));
  const forma = new THREE.Shape(); forma.absarc(0, 0, ra - 0.012, 0, PI * 2, false);
  for (let k = 0; k < 5; k++) {
    const a = k * 2 * PI / 5;
    for (const [da, ab] of [[0.10, 0.26], [0.72, 0.30]]) { // dois vãos por par de raios
      const h = new THREE.Path(), r0 = 0.085, r1 = ra - 0.04, b = a + da;
      h.moveTo(Math.cos(b + ab * 0.5) * r0, Math.sin(b + ab * 0.5) * r0);
      h.lineTo(Math.cos(b) * r1 * 0.98, Math.sin(b) * r1 * 0.98);
      h.absarc(0, 0, r1, b, b + ab + 0.12, false);
      h.lineTo(Math.cos(b + ab * 0.5 + 0.1) * r0 * 1.15, Math.sin(b + ab * 0.5 + 0.1) * r0 * 1.15);
      h.closePath(); forma.holes.push(h);
    }
  }
  const aro = new THREE.ExtrudeGeometry(forma, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.007, bevelSegments: 2, curveSegments: 36 });
  if (lado < 0) { aro.rotateY(PI); aro.translate(0, 0, -(w2 - 0.06)); } else aro.translate(0, 0, w2 - 0.095);
  g.add(malha(aro, 'aro'));
  const labio = new THREE.TorusGeometry(ra - 0.006, 0.011, 12, 120); labio.translate(0, 0, lado * (w2 - 0.035)); g.add(malha(labio, 'aro-labio'));
  const cubo = new THREE.CylinderGeometry(0.052, 0.058, 0.02, 40); cubo.rotateX(PI / 2); cubo.translate(0, 0, lado * (w2 - 0.035)); g.add(malha(cubo, 'aro-cubo'));
  return g;
}
function pinca(lado, largura) {
  const sh = new THREE.Shape(); sh.absarc(0, 0, 0.215, PI * 0.56, PI * 0.93, false); sh.absarc(0, 0, 0.15, PI * 0.93, PI * 0.56, true); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 20 });
  if (lado < 0) { g.rotateY(PI); g.translate(0, 0, -(largura / 2 - 0.105)); } else g.translate(0, 0, largura / 2 - 0.16);
  return malha(g, 'pinca');
}

export function montarCarro() {
  const raiz = new THREE.Group(); raiz.name = 'carro';
  const carro = new THREE.Group(); carro.name = 'corpo'; raiz.add(carro);
  // ---- carroceria (com as caixas de roda cortadas) ----
  const corpoG = mergeVertices(grade(ptCorpo, DIM.xr, DIM.xf, 0, 2 * PI, 170, 128, { fecharV: true, tampas: true }));
  corpoG.computeVertexNormals();
  const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;
  const mPint = new THREE.MeshStandardMaterial({ name: 'pintura' }), mCx = new THREE.MeshStandardMaterial({ name: 'caixa' });
  let b = new Brush(corpoG, mPint); b.updateMatrixWorld();
  for (const xc of [DIM.eixoD, DIM.eixoT]) for (const zs of [1, -1]) { // um corte por roda: o capô do meio não é furado
    const cil = new THREE.CylinderGeometry(0.395, 0.395, 1.0, 96, 1); cil.rotateX(PI / 2); cil.translate(xc, DIM.raio + 0.012, zs * 1.06);
    const c = new Brush(cil, mCx); c.updateMatrixWorld(); b = ev.evaluate(b, c, SUBTRACTION); b.updateMatrixWorld();
  }
  const geo = b.geometry;
  for (const gr of geo.groups) {
    const mat = Array.isArray(b.material) ? b.material[gr.materialIndex] : b.material;
    const P = [], pos = geo.attributes.position, ind = geo.index;
    for (let k = gr.start; k < gr.start + gr.count; k++) { const v = ind ? ind.getX(k) : k; P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
    let sub = new THREE.BufferGeometry(); sub.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    sub = toCreasedNormals(sub, PI / 5.5);
    carro.add(malha(sub, mat.name === 'caixa' ? 'caixa-roda' : 'pintura'));
  }
  // ---- cabine: vidro, teto pintado, colunas ----
  const partes = grade(ptCabine, CAB.x0, CAB.x1, 0, PI, 130, 72, {
    classe: (x, a) => {
      const d = Math.abs(a - PI / 2);
      if (x < -1.58) return 'pintura';
      if (x < -1.12 && d > 0.48) return 'pintura';
      if (x > -1.12 && x < 0.50 && d < 0.66) return 'pintura';
      if (x >= 0.50 && x < 0.57 && d < 0.66) return 'preto-brilho';
      if (x > 0.57 && d > 1.05) return 'preto-brilho';
      if (Math.abs(x + 0.28) < 0.022 && d > 0.66) return 'preto-brilho'; // coluna central
      if (d > 1.515 && x > -1.12 && x < 0.57) return 'cromo'; // friso das janelas
      return 'vidro';
    }
  });
  for (const [nome, g] of Object.entries(partes)) carro.add(malha(toCreasedNormals(g.toNonIndexed(), PI / 4), nome));
  // ---- detalhes por cima da carroceria ----
  const sobre = (nome, x0, x1, a0, a1, nu2 = 30, nv2 = 16, d = 0.003) => carro.add(malha(grade(ptCorpo, x0, x1, a0, a1, nu2, nv2, { desloc: d }), nome));
  sobre('preto-fosco', DIM.eixoT + 0.44, DIM.eixoD - 0.44, -0.66, -0.36, 40, 8);
  sobre('preto-fosco', DIM.eixoT + 0.44, DIM.eixoD - 0.44, PI + 0.36, PI + 0.66, 40, 8);
  for (const s of [1, -1]) {
    const [a0, a1] = s > 0 ? [0.24, 0.66] : [PI - 0.66, PI - 0.24];
    sobre('farol-lente', 1.90, 2.25, a0, a1, 26, 14, 0.004);
    const [b0, b1] = s > 0 ? [0.47, 0.53] : [PI - 0.53, PI - 0.47];
    sobre('farol-luz', 1.93, 2.24, b0, b1, 26, 4, 0.0065);
    const [c0, c1] = s > 0 ? [-0.70, -0.30] : [PI + 0.30, PI + 0.70];
    sobre('grade', 1.98, 2.22, c0, c1, 14, 10, 0.004); // entradas laterais do para-choque
    for (const x of [0.64, -0.60]) { const [e0, e1] = s > 0 ? [-0.32, 1.05] : [PI - 1.05, PI + 0.32]; sobre('fresta', x - 0.0035, x + 0.0035, e0, e1, 2, 28, 0.0035); }
    const [f0, f1] = s > 0 ? [0.70, 0.75] : [PI - 0.75, PI - 0.70]; sobre('preto-brilho', -0.30, -0.12, f0, f1, 6, 3, 0.004); // maçaneta
    // retrovisor
    const esp = new THREE.SphereGeometry(1, 40, 20); esp.scale(0.09, 0.04, 0.06); esp.translate(0.64, 0.878, s * 0.905); carro.add(malha(esp, 'pintura'));
    const base2 = new THREE.SphereGeometry(1, 24, 12); base2.scale(0.07, 0.03, 0.06); base2.translate(0.68, 0.85, s * 0.855); carro.add(malha(base2, 'preto-brilho'));
  }
  // frente: entrada de ar central e lábio
  carro.add(malha(plano(retRed(-0.50, 0.26, 0.50, 0.42, 0.06), DIM.xf + 0.002, true), 'grade'));
  // traseira: barra de luz, difusor e ponteiras
  const larguraEm = (x, y) => { let best = 0; for (let k = 0; k <= 400; k++) { const p = ptCorpo(x, -PI / 2 + PI * k / 400); if (Math.abs(p.y - y) < 0.01) best = Math.max(best, p.z); } return best; };
  const wl = larguraEm(DIM.xr, 0.755) * 0.94, wd = larguraEm(DIM.xr, 0.43) * 0.9;
  carro.add(malha(plano(retRed(-wl + 0.03, 0.738, wl - 0.03, 0.772, 0.016), DIM.xr - 0.002, false), 'lanterna'));
  carro.add(malha(plano(retRed(-wl, 0.72, wl, 0.79, 0.03), DIM.xr - 0.001, false), 'lanterna-lente'));
  carro.add(malha(plano(retRed(-wd, 0.38, wd, 0.50, 0.04), DIM.xr - 0.002, false), 'preto-fosco'));
  for (const z of [-0.42, -0.30, 0.30, 0.42]) { const p = new THREE.CylinderGeometry(0.042, 0.045, 0.12, 32, 1, true); p.rotateZ(PI / 2); p.translate(DIM.xr - 0.02, 0.42, z); carro.add(malha(p, 'ponteira')); }
  // assoalho escuro
  const chao = new THREE.PlaneGeometry(3.7, 1.55); chao.rotateX(-PI / 2); chao.translate(0, 0.125, 0); carro.add(malha(chao, 'preto-fosco'));
  // ---- rodas ----
  for (const [xc, lar, nome] of [[DIM.eixoD, 0.255, 'd'], [DIM.eixoT, 0.30, 't']]) {
    const modelo = roda(lar, 1), pc = pinca(1, lar); // o lado esquerdo é o mesmo desenho espelhado (mesma malha)
    for (const s of [1, -1]) {
      const piv = new THREE.Group(); piv.name = 'roda-' + nome + (s > 0 ? 'd' : 'e'); piv.position.set(xc, DIM.raio, s * DIM.bitola);
      const lado = new THREE.Group(); lado.scale.z = s; piv.add(lado);
      const gira = new THREE.Group(); gira.name = 'gira'; for (const m of modelo.children) gira.add(new THREE.Mesh(m.geometry, m.material).copy(m));
      lado.add(gira); const p2 = pc.clone(); lado.add(p2); raiz.add(piv);
    }
  }
  return raiz;
}
