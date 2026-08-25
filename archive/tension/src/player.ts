import * as THREE from 'three';
import { WebGraph } from './web';
import { VibrationField } from './vibration';
import { paintSpirit } from './paint';

// ------------------------------------------------------------------
// The player lives ON the graph: always on an edge at parameter t,
// or logically at a node when t hits 0/1. Input steers along the
// current strand; at junctions we pick the best-aligned next edge.
// Movement emits footstep pulses scaled by speed.
// ------------------------------------------------------------------

const WALK_SPEED = 9;
const STEP_INTERVAL = 0.38;      // seconds between footstep pulses at full speed

export class Player {
  edgeId: number;
  t: number;                     // 0 at edge.a, 1 at edge.b
  mesh: THREE.Group;
  light: THREE.PointLight;
  private bodySprite!: THREE.Sprite;
  private ears: THREE.Sprite[] = [];
  private stepTimer = 0;
  private lastDir = new THREE.Vector3(1, 0, 0);
  speedNow = 0;

  constructor(private web: WebGraph, private vib: VibrationField, startEdge: number) {
    this.edgeId = startEdge;
    this.t = 0.1;

    this.mesh = new THREE.Group();
    const parts = paintSpirit();
    // painted body with face
    this.bodySprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: parts.body, transparent: true, depthWrite: false,
    }));
    this.bodySprite.center.set(0.5, 0.18);
    this.bodySprite.scale.set(3.1, 3.1, 1);
    this.mesh.add(this.bodySprite);
    // two painted ears, anchored at their base so they sway
    for (const s of [-1, 1]) {
      const ear = new THREE.Sprite(new THREE.SpriteMaterial({
        map: parts.ear, transparent: true, depthWrite: false, rotation: -s * 0.28,
      }));
      ear.center.set(0.5, 0.04);
      ear.scale.set(0.75, 1.75, 1);
      ear.position.set(s * 0.34, 1.55, s * 0.01);
      this.mesh.add(ear);
      this.ears.push(ear);
    }
    // soft halo behind the body
    const haloCv = document.createElement('canvas');
    haloCv.width = haloCv.height = 64;
    const hg = haloCv.getContext('2d')!;
    const hgr = hg.createRadialGradient(32, 32, 2, 32, 32, 32);
    hgr.addColorStop(0, 'rgba(255,205,130,0.85)');
    hgr.addColorStop(0.5, 'rgba(255,170,90,0.30)');
    hgr.addColorStop(1, 'rgba(255,170,90,0)');
    hg.fillStyle = hgr; hg.fillRect(0, 0, 64, 64);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCv), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(3.4, 3.4, 1);
    (halo.material as THREE.SpriteMaterial).opacity = 0.4;
    halo.position.y = 0.9;
    this.mesh.add(halo);

    this.light = new THREE.PointLight(0xffb060, 16, 22, 2);
    this.light.position.y = 0.6;
    this.mesh.add(this.light);
  }

  position(): THREE.Vector3 {
    const e = this.web.edges[this.edgeId];
    return e.curve.getPoint(this.t);
  }

  /** Move along the web following an input direction in world space. */
  update(dt: number, input: THREE.Vector3, now: number) {
    const e = this.web.edges[this.edgeId];
    const here = e.curve.getPoint(this.t);
    const ahead = e.curve.getPoint(Math.min(1, this.t + 0.02));
    const back = e.curve.getPoint(Math.max(0, this.t - 0.02));
    const dirAlong = ahead.clone().sub(back).normalize();

    let move = 0;
    if (input.lengthSq() > 0.01) {
      const align = input.dot(dirAlong);
      move = align * WALK_SPEED * dt;
      this.lastDir.copy(input);
    }
    this.speedNow = Math.abs(move) / (WALK_SPEED * dt + 1e-6);

    const len = Math.max(1, e.curve.getLength());
    this.t += move / len;

    // junction handling
    if (this.t >= 1 || this.t <= 0) {
      const nodeId = this.t >= 1 ? e.b : e.a;
      this.t = THREE.MathUtils.clamp(this.t, 0, 1);
      const next = this.pickNextEdge(nodeId, input.lengthSq() > 0.01 ? input : this.lastDir);
      if (next !== null && next !== this.edgeId) {
        const ne = this.web.edges[next];
        this.edgeId = next;
        this.t = ne.a === nodeId ? 0.001 : 0.999;
      }
    }

    // footsteps → vibration
    if (this.speedNow > 0.05) {
      this.stepTimer -= dt * this.speedNow;
      if (this.stepTimer <= 0) {
        this.stepTimer = STEP_INTERVAL;
        const strength = 0.10 + this.speedNow * 0.16;
        this.vib.emitFromEdgePoint(this.edgeId, this.t, strength);
      }
    } else {
      this.stepTimer = Math.min(this.stepTimer, STEP_INTERVAL * 0.4);
    }

    // place mesh
    const pos = this.position();
    this.mesh.position.copy(pos);
    this.mesh.position.y += 0.35;
    // gentle idle bob + walk bounce
    this.mesh.position.y += Math.sin(now * 2.2) * 0.06 + Math.abs(Math.sin(now * 9)) * 0.10 * this.speedNow;
    // character animation: lean into motion, ears sway
    const lean = THREE.MathUtils.clamp(move * 6, -0.18, 0.18);
    (this.bodySprite.material as THREE.SpriteMaterial).rotation = -lean;
    for (let i = 0; i < this.ears.length; i++) {
      const s = i === 0 ? -1 : 1;
      const sway = Math.sin(now * 3.1 + i * 1.7) * 0.10 + this.speedNow * Math.sin(now * 10 + i) * 0.12;
      (this.ears[i].material as THREE.SpriteMaterial).rotation = -s * 0.28 + sway - lean * 1.4;
    }
  }

  private pickNextEdge(nodeId: number, dir: THREE.Vector3): number | null {
    const n = this.web.nodes[nodeId];
    let best: number | null = null;
    let bestDot = 0.25;   // refuse hard turns backward
    for (const eid of n.edges) {
      const e = this.web.edges[eid];
      if (!e.traversable) continue;
      const other = this.web.nodes[this.web.otherNode(e, nodeId)];
      const away = other.pos.clone().sub(n.pos).setY(0).normalize();
      const d = away.dot(dir.clone().setY(0).normalize());
      if (d > bestDot) { bestDot = d; best = eid; }
    }
    // stay on current edge if nothing matches (also allow reversing)
    return best;
  }

  nearestNode(maxDist: number): number | null {
    const p = this.position();
    let best: number | null = null, bd = maxDist;
    for (const n of this.web.nodes) {
      const d = n.pos.distanceTo(p);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }
}
