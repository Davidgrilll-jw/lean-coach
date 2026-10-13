// Draws the stick-figure illustrations described in data/exerciseGuide.js.
// Each pose is laid out with simple forward kinematics, then moved so that
// its lowest point stands on the floor line.
import { EXERCISE_GUIDE } from '../data/exerciseGuide.js';

const LEN = { torso: 30, upperArm: 16, forearm: 15, thigh: 22, shin: 22, neck: 3, head: 6, foot: 6 };
const FRAME = { w: 100, h: 96, ground: 90, top: 5 };

const rad = (deg) => (deg * Math.PI) / 180;
const step = ([x, y], dir, len) => [x + Math.cos(rad(dir)) * len, y + Math.sin(rad(dir)) * len];
const pair = (v) => (Array.isArray(v[0]) ? v : [v, v]);
const n = (v) => Math.round(v * 10) / 10;

/** Joint positions for one pose, hip at the origin. Index 0 = near side, 1 = far side. */
function layout(pose) {
  const front = !!pose.front;
  const torsoDir = pose.t ?? 270;
  const hip = [0, 0];
  const shoulder = step(hip, torsoDir, pose.tl || LEN.torso);
  const head = step(shoulder, torsoDir, LEN.neck + LEN.head);
  const arms = pair(pose.a || [90, 90]);
  const legs = pair(pose.l || [90, 90]);
  const footDir = pose.f === false || front ? null : (pose.f ?? 0);
  const sides = [0, 1].map((i) => {
    const mirror = front && i === 1;
    const dir = (d) => (mirror ? 180 - d : d);
    const off = front ? (i === 0 ? 1 : -1) : 0;
    const s = [shoulder[0] + off * 8, shoulder[1]];
    const elbow = step(s, dir(arms[i][0]), LEN.upperArm);
    const hand = step(elbow, dir(arms[i][1]), LEN.forearm);
    const h = [hip[0] + off * 4, hip[1]];
    const knee = step(h, dir(legs[i][0]), LEN.thigh);
    const ankle = step(knee, dir(legs[i][1]), LEN.shin);
    const toe = footDir == null ? null : step(ankle, footDir, LEN.foot);
    return { s, elbow, hand, forearmDir: dir(arms[i][1]), h, knee, ankle, toe };
  });
  return { hip, shoulder, head, sides, front };
}

function bounds(fig) {
  const pts = [fig.hip, fig.shoulder, [fig.head[0] - LEN.head, fig.head[1] - LEN.head], [fig.head[0] + LEN.head, fig.head[1] + LEN.head]];
  for (const s of fig.sides) pts.push(s.elbow, s.hand, s.knee, s.ankle, ...(s.toe ? [s.toe] : []));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const line = (a, b, cls) => `<path class="${cls}" d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}"/>`;

function dumbbells(pose, fig) {
  if (!pose.db) return '';
  const at = (point, dir) => {
    const a = step(point, dir, 6);
    const b = step(point, dir + 180, 6);
    return line(a, b, 'art-db');
  };
  if (pose.db === 'hip') return at([fig.hip[0], fig.hip[1] - 6], 0);
  const which = pose.db === 'both' ? [1, 0] : [0];
  let out = '';
  let last = null;
  for (const i of which) {
    const s = fig.sides[i];
    if (last && Math.hypot(s.hand[0] - last[0], s.hand[1] - last[1]) < 2) continue; // hidden behind the near hand
    out += at(s.hand, pose.grip === 'hammer' ? s.forearmDir : s.forearmDir + 90);
    last = s.hand;
  }
  return out;
}

function figure(pose, fig) {
  const limb = (s, cls) => {
    let out = line(s.s, s.elbow, cls) + line(s.elbow, s.hand, cls) + line(s.h, s.knee, cls) + line(s.knee, s.ankle, cls);
    if (s.toe) out += line(s.ankle, s.toe, cls);
    return out;
  };
  const [near, far] = fig.sides;
  const farCls = fig.front ? 'art-near' : 'art-far';
  return (
    limb(far, farCls) +
    line(fig.hip, fig.shoulder, 'art-near') +
    (fig.front ? line(near.s, far.s, 'art-near') + line(near.h, far.h, 'art-near') : '') +
    `<circle class="art-head" cx="${n(fig.head[0])}" cy="${n(fig.head[1])}" r="${LEN.head}"/>` +
    limb(near, 'art-near') +
    dumbbells(pose, fig)
  );
}

/** One framed pose: floor line, optional support, figure. `scale` is shared by both frames. */
function frame(pose, fig, scale, x) {
  const b = bounds(fig);
  const tx = FRAME.w / 2 - ((b.minX + b.maxX) / 2) * scale;
  const ty = FRAME.ground - b.maxY * scale;
  let bench = '';
  if (pose.bench) {
    const p = pose.bench === 'handFar' ? fig.sides[1].hand : fig.sides[1].ankle;
    bench = `<rect class="art-bench" x="${n(p[0] - 12)}" y="${n(p[1] + 3)}" width="24" height="${n(Math.max(2, b.maxY - p[1] - 3))}" rx="2"/>`;
  }
  return `<g transform="translate(${x} 0)">
    <rect class="art-bg" x="0" y="0" width="${FRAME.w}" height="${FRAME.h}" rx="14"/>
    <path class="art-floor" d="M8 ${FRAME.ground + 2.5}H${FRAME.w - 8}"/>
    <g transform="translate(${n(tx)} ${n(ty)}) scale(${n(scale * 100) / 100})">${bench}${figure(pose, fig)}</g>
  </g>`;
}

export const hasArt = (exerciseId) => Boolean(EXERCISE_GUIDE[exerciseId]);

/**
 * SVG markup for an exercise: start and end position side by side, or only the
 * end position when `single` is set (small thumbnails). Returns '' if unknown.
 */
export function exerciseArt(exerciseId, { single = false, label = '' } = {}) {
  const guide = EXERCISE_GUIDE[exerciseId];
  if (!guide) return '';
  const poses = single ? [guide.poses[guide.poses.length - 1]] : guide.poses;
  const figs = poses.map(layout);
  // Same scale in both frames so the body does not appear to change size.
  const scale = Math.min(
    1,
    ...guide.poses.map(layout).map((f) => {
      const b = bounds(f);
      return Math.min((FRAME.w - 12) / (b.maxX - b.minX), (FRAME.ground - FRAME.top) / (b.maxY - b.minY));
    })
  );
  const gap = 16;
  const width = poses.length * FRAME.w + (poses.length - 1) * gap;
  let body = '';
  poses.forEach((pose, i) => {
    body += frame(pose, figs[i], scale, i * (FRAME.w + gap));
    if (i > 0) {
      const ax = i * (FRAME.w + gap) - gap / 2;
      body += `<path class="art-arrow" d="M${ax - 4} ${FRAME.h / 2}h8m-3 -3l3 3l-3 3"/>`;
    }
  });
  const cls = single ? ' art-thumb' : poses.length === 1 ? ' art-one' : '';
  return `<svg class="art${cls}" viewBox="0 0 ${width} ${FRAME.h}" role="img" aria-label="${label}">${body}</svg>`;
}
