import * as THREE from 'three';

// ------------------------------------------------------------------
// The web is a graph. Nodes are junctions/knots; edges are silk
// strands. Tension is derived from current length vs rest length,
// and drives sag, brightness, traversability, and vibration carry.
// ------------------------------------------------------------------

export interface WebNode {
  id: number;
  pos: THREE.Vector3;
  home: THREE.Vector3;          // authored resting position
  pullable: boolean;            // player can grab and drag this knot
  pullRadius: number;           // max displacement from home
  edges: number[];              // edge ids
  anchor: boolean;              // attached to world (flowers/branches), immovable
}

export interface WebEdge {
  id: number;
  a: number;
  b: number;
  restLength: number;           // authored; > distance => slack, < => taut
  tension: number;              // derived 0..1 (0 slack, 1 taut)
  traversable: boolean;
  curve: THREE.QuadraticBezierCurve3;
  mesh: THREE.Mesh | null;
  dirty: boolean;
}

const SAG = 5.2;                 // world units of droop at zero tension

export class WebGraph {
  nodes: WebNode[] = [];
  edges: WebEdge[] = [];
  group = new THREE.Group();
  private knotMeshes = new Map<number, THREE.Mesh>();
  private silkMat: THREE.MeshStandardMaterial;
  private silkTautMat: THREE.MeshStandardMaterial;

  constructor() {
    // translucent silver-blue silk with iridescent sheen, catches moonlight
    this.silkMat = new THREE.MeshPhysicalMaterial({
      color: 0xbcd0f0, emissive: 0x4a68b0, emissiveIntensity: 0.5,
      roughness: 0.18, metalness: 0.25,
      transparent: true, opacity: 0.85,
      iridescence: 0.85, iridescenceIOR: 1.3,
      sheen: 1.0, sheenColor: new THREE.Color(0x9fb8ff), sheenRoughness: 0.4,
      envMapIntensity: 0.5,
    }) as unknown as THREE.MeshStandardMaterial;
    this.silkTautMat = this.silkMat;
  }

  addNode(x: number, y: number, z: number, opts: Partial<WebNode> = {}): number {
    const id = this.nodes.length;
    const pos = new THREE.Vector3(x, y, z);
    this.nodes.push({
      id, pos, home: pos.clone(),
      pullable: opts.pullable ?? false,
      pullRadius: opts.pullRadius ?? 6,
      edges: [],
      anchor: opts.anchor ?? false,
    });
    return id;
  }

  addEdge(a: number, b: number, restFactor = 1.0, traversable = true): number {
    const id = this.edges.length;
    const na = this.nodes[a], nb = this.nodes[b];
    const dist = na.pos.distanceTo(nb.pos);
    const edge: WebEdge = {
      id, a, b,
      restLength: dist * restFactor,
      tension: 0.5,
      traversable,
      curve: new THREE.QuadraticBezierCurve3(na.pos.clone(), na.pos.clone().lerp(nb.pos, 0.5), nb.pos.clone()),
      mesh: null,
      dirty: true,
    };
    this.edges.push(edge);
    na.edges.push(id); nb.edges.push(id);
    return id;
  }

  otherNode(edge: WebEdge, nodeId: number): number {
    return edge.a === nodeId ? edge.b : edge.a;
  }

  /** Tension from geometry: current length vs rest length. */
  private computeTension(e: WebEdge): number {
    const len = this.nodes[e.a].pos.distanceTo(this.nodes[e.b].pos);
    return THREE.MathUtils.clamp((len / e.restLength - 0.86) / 0.28, 0, 1);
  }

  /** How well a vibration crosses this strand (slack kills signal). */
  conductivity(e: WebEdge): number {
    return THREE.MathUtils.smoothstep(e.tension, 0.15, 0.75);
  }

  refreshEdge(e: WebEdge) {
    e.tension = this.computeTension(e);
    const pa = this.nodes[e.a].pos, pb = this.nodes[e.b].pos;
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y -= (1 - e.tension) * SAG;
    e.curve.v0.copy(pa); e.curve.v1.copy(mid); e.curve.v2.copy(pb);
    e.dirty = true;
  }

  refreshAll() { for (const e of this.edges) this.refreshEdge(e); }

  /** Move a pullable node (clamped to its radius); retension neighbors. */
  dragNode(id: number, target: THREE.Vector3) {
    const n = this.nodes[id];
    if (!n.pullable) return;
    const off = target.clone().sub(n.home);
    if (off.length() > n.pullRadius) off.setLength(n.pullRadius);
    n.pos.copy(n.home).add(off);
    for (const eid of n.edges) this.refreshEdge(this.edges[eid]);
    // one ring out — neighbors' other edges change sag too
    for (const eid of n.edges) {
      const other = this.nodes[this.otherNode(this.edges[eid], id)];
      for (const eid2 of other.edges) this.refreshEdge(this.edges[eid2]);
    }
  }

  buildMeshes(scene: THREE.Scene) {
    scene.add(this.group);
    for (const n of this.nodes) {
      const isPull = n.pullable;
      const geo = new THREE.SphereGeometry(isPull ? 0.85 : 0.45, 12, 10);
      const mat = new THREE.MeshStandardMaterial({
        color: isPull ? 0xffd9a0 : 0xcfe0ff,
        emissive: isPull ? 0xd88f3a : 0x6f8fd0,
        emissiveIntensity: isPull ? 0.9 : 0.5,
        roughness: 0.5,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(n.pos);
      this.group.add(m);
      this.knotMeshes.set(n.id, m);
    }
    this.refreshAll();
    this.updateMeshes();
  }

  updateMeshes() {
    for (const e of this.edges) {
      if (!e.dirty && e.mesh) continue;
      if (e.mesh) {
        e.mesh.geometry.dispose();
        this.group.remove(e.mesh);
      }
      const thick = 0.85 + Math.sin(e.id * 7.31) * 0.25;   // per-strand thickness character
      const geo = new THREE.TubeGeometry(e.curve, 24, (0.055 + e.tension * 0.03) * thick, 6, false);
      const mat = this.silkMat.clone();
      mat.emissiveIntensity = 0.35 + e.tension * 0.85;
      const brightness = 0.65 + e.tension * 0.5;
      mat.color.setRGB(0.72 * brightness, 0.80 * brightness, 0.98 * brightness);
      mat.emissive.setRGB(0.35, 0.48, 0.90);
      e.mesh = new THREE.Mesh(geo, mat);
      this.group.add(e.mesh);
      e.dirty = false;
    }
    for (const [id, m] of this.knotMeshes) m.position.copy(this.nodes[id].pos);
  }

  /** Flash a strand brighter briefly (vibration visual assist). */
  exciteEdge(id: number, amount: number) {
    const e = this.edges[id];
    if (e.mesh) {
      const mat = e.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = Math.min(2.5, mat.emissiveIntensity + amount);
    }
  }

  /** Decay excited strands back toward their tension-driven glow. */
  decayExcitement(dt: number) {
    for (const e of this.edges) {
      if (!e.mesh) continue;
      const mat = e.mesh.material as THREE.MeshStandardMaterial;
      const base = 0.28 + e.tension * 0.75;
      if (mat.emissiveIntensity > base) {
        mat.emissiveIntensity = Math.max(base, mat.emissiveIntensity - dt * 2.2);
      }
    }
  }
}

// ------------------------------------------------------------------
// Phase 1 authored test web (~9 junctions)
// Web lies roughly in a tilted plane; y is up.
// ------------------------------------------------------------------
export function buildTestWeb(): WebGraph {
  const w = new WebGraph();
  const n0 = w.addNode(-34, 1.5, 10, { anchor: true });          // start anchor (flower)
  const n1 = w.addNode(-16, 0.8, 4);
  const n2 = w.addNode(0, 0.2, -2, { pullable: true });          // central pullable knot
  const n3 = w.addNode(16, 0.6, -7);
  const n4 = w.addNode(32, 5.5, -30, { anchor: true });          // spider perch: deeper + higher, half-hidden
  const n5 = w.addNode(-10, -0.6, -16);
  const n6 = w.addNode(8, -0.4, -20);
  const n7 = w.addNode(-24, 0.4, -6, { pullable: true });
  const n8 = w.addNode(-2, -1.0, -30, { anchor: true });         // far lower anchor

  w.addEdge(n0, n1, 0.97);           // taut walkway
  w.addEdge(n1, n2, 0.99);
  w.addEdge(n2, n3, 1.10);           // slack — poor carry until tightened
  w.addEdge(n3, n4, 0.96);
  w.addEdge(n1, n7, 1.02);
  w.addEdge(n7, n5, 1.12);           // slack lower route
  w.addEdge(n5, n6, 1.05);
  w.addEdge(n6, n3, 1.08);
  w.addEdge(n2, n5, 1.00);
  w.addEdge(n5, n8, 0.95);
  w.addEdge(n6, n8, 1.15);           // very slack
  return w;
}
