import * as THREE from 'three';
import { WebGraph } from './web';
import { SignalArrival } from './vibration';
import { paintSpiderBody } from './paint';

// ------------------------------------------------------------------
// Deterministic spider. It listens at a node; when a strong-enough
// signal reaches ITS node, it walks the graph toward the signal's
// origin. It feels smart because it is consistent, not because it
// is complicated.
// ------------------------------------------------------------------

type SpiderState = 'listening' | 'investigating' | 'searching' | 'returning';

const MOVE_SPEED = 5.5;
const HEAR_THRESHOLD = 0.06;
const SEARCH_TIME = 3.5;

export class Spider {
  state: SpiderState = 'listening';
  nodeId: number;                  // current/last node
  private homeNode: number;
  private path: number[] = [];     // node ids to walk
  private edgeProgress = 0;
  private targetNode: number | null = null;
  private searchTimer = 0;
  private lastSignalStrength = 0;
  private signalCooldown = 0;
  mesh: THREE.Group;
  private legs: THREE.Mesh[] = [];
  private alertT = 0;
  private eyeLight!: THREE.PointLight;
  private eyeGlint!: THREE.Sprite;

  constructor(private web: WebGraph, startNode: number) {
    this.nodeId = startNode;
    this.homeNode = startNode;
    this.mesh = new THREE.Group();

    // painted body — top view, faces the camera as a sprite
    const body = new THREE.Sprite(new THREE.SpriteMaterial({
      map: paintSpiderBody(), transparent: true, depthWrite: false,
    }));
    body.center.set(0.5, 0.55);
    body.scale.set(4.6, 5.7, 1);
    body.position.y = 0.9;
    this.mesh.add(body);

    // articulated legs: femur + tibia per leg, procedural gait
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x16101f, emissive: 0x241736, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.5,
    });
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      const hip = new THREE.Group();
      hip.position.set(side * 0.7, 0.5, 0.9 - k * 0.6);
      const spread = side * (0.65 + Math.abs(1.5 - k) * 0.12);
      hip.rotation.y = spread + side * (k - 1.5) * -0.38;
      const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.065, 2.9, 6), legMat);
      femur.position.set(0, 0, 1.45);
      femur.rotation.x = Math.PI / 2;
      const knee = new THREE.Group();
      knee.position.set(0, 0, 2.9);
      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 3.1, 6), legMat);
      tibia.position.set(0, -1.05, 1.05);
      tibia.rotation.x = Math.PI / 2 + 0.75;
      knee.add(tibia);
      hip.add(femur, knee);
      hip.rotation.z = side * -0.35;             // legs arc up then down: elegant
      this.mesh.add(hip);
      this.legs.push(hip as unknown as THREE.Mesh);
    }
    // eyes catch warm amber light when it hears something
    this.eyeLight = new THREE.PointLight(0xffa040, 0, 14, 2);
    this.eyeLight.position.set(0, 0.8, 1.6);
    this.mesh.add(this.eyeLight);
    const glintCv = document.createElement('canvas');
    glintCv.width = glintCv.height = 32;
    const gg = glintCv.getContext('2d')!;
    const ggr = gg.createRadialGradient(16, 16, 1, 16, 16, 16);
    ggr.addColorStop(0, 'rgba(255,190,110,1)');
    ggr.addColorStop(1, 'rgba(255,150,60,0)');
    gg.fillStyle = ggr; gg.fillRect(0, 0, 32, 32);
    this.eyeGlint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glintCv), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.eyeGlint.scale.set(2.4, 2.4, 1);
    this.eyeGlint.position.set(0, 1.6, 1.2);
    this.mesh.add(this.eyeGlint);

    this.mesh.position.copy(this.web.nodes[startNode].pos);
    this.mesh.position.y += 1.4;
  }

  /** Feed arrivals from the vibration field; only ones at OUR node count. */
  hear(sig: SignalArrival) {
    if (sig.atNode !== this.nodeId && !this.path.includes(sig.atNode)) {
      // Only signals that reach the spider's position (or its current path nodes) matter
      if (sig.atNode !== this.currentOccupiedNode()) return;
    }
    if (sig.strength < HEAR_THRESHOLD) return;
    this.alertT = Math.min(1.5, this.alertT + 0.6 + sig.strength);
    if (this.signalCooldown > 0 && sig.strength <= this.lastSignalStrength) return;
    // React: path toward the origin of the vibration
    const target = sig.originNode;
    if (target === this.currentOccupiedNode()) return;
    const path = this.findPath(this.currentOccupiedNode(), target);
    if (!path || path.length < 2) return;
    this.path = path.slice(1);
    this.targetNode = target;
    this.state = 'investigating';
    this.edgeProgress = 0;
    this.lastSignalStrength = sig.strength;
    this.signalCooldown = 1.2;
  }

  currentOccupiedNode(): number { return this.nodeId; }

  private findPath(from: number, to: number): number[] | null {
    // BFS over traversable, sufficiently-taut edges
    const prev = new Map<number, number>();
    const q = [from];
    prev.set(from, -1);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const eid of this.web.nodes[cur].edges) {
        const e = this.web.edges[eid];
        if (!e.traversable || e.tension < 0.12) continue;   // won't cross near-slack silk
        const nxt = this.web.otherNode(e, cur);
        if (!prev.has(nxt)) { prev.set(nxt, cur); q.push(nxt); }
      }
    }
    if (!prev.has(to)) return null;
    const path: number[] = [];
    let cur = to;
    while (cur !== -1) { path.unshift(cur); cur = prev.get(cur)!; }
    return path;
  }

  update(dt: number, now: number) {
    this.signalCooldown = Math.max(0, this.signalCooldown - dt);
    // amber eye-flash decays after each heard signal
    this.alertT = Math.max(0, this.alertT - dt * 0.8);
    const flash = Math.min(1, this.alertT) * (0.7 + 0.3 * Math.sin(now * 18));
    this.eyeLight.intensity = flash * 26;
    (this.eyeGlint.material as THREE.SpriteMaterial).opacity = flash * 0.85;

    if (this.state === 'investigating' || this.state === 'returning') {
      if (this.path.length === 0) {
        if (this.state === 'investigating') {
          this.state = 'searching';
          this.searchTimer = SEARCH_TIME;
        } else {
          this.state = 'listening';
        }
      } else {
        const nextNode = this.path[0];
        const from = this.web.nodes[this.nodeId].pos;
        const to = this.web.nodes[nextNode].pos;
        const dist = from.distanceTo(to);
        this.edgeProgress += (MOVE_SPEED * dt) / Math.max(1, dist);
        if (this.edgeProgress >= 1) {
          this.nodeId = nextNode;
          this.path.shift();
          this.edgeProgress = 0;
        }
        const pos = from.clone().lerp(to, Math.min(1, this.edgeProgress));
        this.mesh.position.copy(pos);
        this.mesh.position.y += 1.4;
        const dir = to.clone().sub(from);
        if (dir.lengthSq() > 0.001) {
          this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        }
        // legs scuttle
        for (let i = 0; i < this.legs.length; i++) {
          this.legs[i].rotation.x = Math.sin(now * 10 + i * 1.3) * 0.18;
        }
      }
    } else if (this.state === 'searching') {
      this.searchTimer -= dt;
      // slow menacing look-around
      this.mesh.rotation.y += Math.sin(now * 0.8) * 0.004;
      if (this.searchTimer <= 0) {
        const path = this.findPath(this.nodeId, this.homeNode);
        if (path && path.length > 1) {
          this.path = path.slice(1);
          this.state = 'returning';
          this.edgeProgress = 0;
        } else {
          this.state = 'listening';
        }
      }
    } else {
      // listening: subtle idle
      this.mesh.rotation.y += Math.sin(now * 0.4) * 0.0015;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].rotation.x = Math.sin(now * 1.2 + i * 2.1) * 0.03;
      }
    }
  }
}
