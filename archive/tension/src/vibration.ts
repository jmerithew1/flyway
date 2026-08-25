import * as THREE from 'three';
import { WebGraph, WebEdge } from './web';

// ------------------------------------------------------------------
// Vibration pulses travel edge-by-edge through the graph.
// Taut strands carry them far; slack strands eat them.
// The spider subscribes to arrivals.
// ------------------------------------------------------------------

interface Pulse {
  edgeId: number;
  fromNode: number;     // node it entered from
  t: number;            // 0..1 progress along edge (from fromNode side)
  strength: number;     // 0..1
  originNode: number;   // where the signal started (what the spider learns)
  sprite: THREE.Sprite;
  streak: THREE.Mesh;   // luminous segment flowing along the strand
}

export interface SignalArrival {
  atNode: number;
  originNode: number;
  strength: number;
  time: number;
}

const PULSE_SPEED = 26;          // world units / sec along silk
const MIN_STRENGTH = 0.045;

export class VibrationField {
  private pulses: Pulse[] = [];
  private pool: THREE.Sprite[] = [];
  private streakPool: THREE.Mesh[] = [];
  group = new THREE.Group();
  /** Listeners keyed by node id (e.g. the spider's current node). */
  onArrival: ((s: SignalArrival) => void) | null = null;

  constructor(private web: WebGraph, private tex: THREE.Texture) {}

  private sprite(): THREE.Sprite {
    const s = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex, color: 0xbfe2ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.visible = true;
    this.group.add(s);
    return s;
  }
  private release(s: THREE.Sprite) {
    s.visible = false;
    this.group.remove(s);
    this.pool.push(s);
  }
  private streak(): THREE.Mesh {
    const m = this.streakPool.pop() ?? new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 1, 3, 6),
      new THREE.MeshBasicMaterial({
        color: 0xd8ecff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    m.visible = true;
    this.group.add(m);
    return m;
  }
  private releaseStreak(m: THREE.Mesh) {
    m.visible = false;
    this.group.remove(m);
    this.streakPool.push(m);
  }

  /** Emit from a node into all its edges. */
  emitFromNode(nodeId: number, strength: number, originNode = nodeId) {
    const n = this.web.nodes[nodeId];
    for (const eid of n.edges) this.emitIntoEdge(eid, nodeId, strength, originNode);
  }

  /** Emit into a single edge from one end. */
  emitIntoEdge(edgeId: number, fromNode: number, strength: number, originNode: number) {
    const e = this.web.edges[edgeId];
    const carried = strength * this.web.conductivity(e);
    if (carried < MIN_STRENGTH) return;
    this.pulses.push({
      edgeId, fromNode, t: 0, strength: carried, originNode,
      sprite: this.sprite(), streak: this.streak(),
    });
  }

  /** Emit from a position partway along an edge (footsteps). */
  emitFromEdgePoint(edgeId: number, tAlong: number, strength: number) {
    const e = this.web.edges[edgeId];
    const carried = strength * this.web.conductivity(e);
    if (carried < MIN_STRENGTH) return;
    // two pulses, one toward each end; origin = nearest node (good enough intel)
    const originNode = tAlong < 0.5 ? e.a : e.b;
    this.pulses.push({ edgeId, fromNode: e.b, t: 1 - tAlong, strength: carried, originNode, sprite: this.sprite(), streak: this.streak() });
    this.pulses.push({ edgeId, fromNode: e.a, t: tAlong, strength: carried, originNode, sprite: this.sprite(), streak: this.streak() });
  }

  update(dt: number, now: number) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const e = this.web.edges[p.edgeId];
      const len = e.curve.getLength();
      p.t += (PULSE_SPEED * dt) / Math.max(1, len);
      this.web.exciteEdge(p.edgeId, p.strength * dt * 6);

      if (p.t >= 1) {
        const arriveNode = this.web.otherNode(e, p.fromNode);
        this.release(p.sprite);
        this.releaseStreak(p.streak);
        this.pulses.splice(i, 1);
        this.onArrival?.({ atNode: arriveNode, originNode: p.originNode, strength: p.strength, time: now });
        // propagate onward into other edges, attenuated
        const n = this.web.nodes[arriveNode];
        for (const eid of n.edges) {
          if (eid === p.edgeId) continue;
          this.emitIntoEdge(eid, arriveNode, p.strength * 0.62, p.originNode);
        }
        continue;
      }
      // position glow + oriented streak along curve (t measured from fromNode side)
      const tCurve = e.a === p.fromNode ? p.t : 1 - p.t;
      const pos = e.curve.getPoint(tCurve);
      p.sprite.position.copy(pos);
      const sc = 0.6 + p.strength * 1.8;
      p.sprite.scale.set(sc, sc, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.18 + p.strength * 0.5;

      const tangent = e.curve.getTangent(tCurve).normalize();
      p.streak.position.copy(pos);
      p.streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      const sLen = 0.8 + p.strength * 3.2;
      p.streak.scale.set(0.7 + p.strength, sLen, 0.7 + p.strength);
      (p.streak.material as THREE.MeshBasicMaterial).opacity = 0.35 + p.strength * 0.6;
    }
  }
}

export function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
