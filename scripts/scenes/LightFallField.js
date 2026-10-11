/*
    LightFallField.js - the pure geometry of the Light Fall canyon.

    Holds the maths for the canyon of light trails that LightFallScene renders:
    where each trail's near end sits, where they all converge, how to sample a
    point along a trail's curve, and (in later tasks) the curve frames, the
    ripple displacement and photon progression. Keeping it free of three.js
    rendering means it can be unit-tested without a GPU or DOM.

    Copyright © 2021 Anthony Stellato
*/

const DEFAULTS = {
    trailCount: 84,
    segments: 48,
    nearRadius: 5.0,
    nearZ: -2.5,
    apexY: 4.6,
    apexZ: -30,
    bendUp: 6.0,
    bendForward: 8.0,
    apexDrop: 10.0,
    apexBack: 10.0,
    rippleFreq: 6.0,
    // near ends span the lower arc of the ring, so the trails read as a canyon
    // fanning up from below the viewer rather than a symmetric starburst
    angleStart: -Math.PI * 1.1,
    angleEnd: Math.PI * 0.1,
    // lifts the whole canyon in world Y; equivalent to lowering the camera
    yOffset: 0,
};

/**
 * Lay out the canyon: one near point per trail on a ring around the view axis,
 * plus the shared far apex every trail converges on.
 *
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{
 *   trailCount: number, segments: number,
 *   near: Float32Array, apex: {x:number,y:number,z:number},
 *   phase: Float32Array, spectral: Float32Array, rippleFreq: number,
 *   nearRadius: number, nearZ: number,
 *   bendUp: number, bendForward: number, apexDrop: number, apexBack: number,
 * }}
 */
function createTrailField(options = {}) {
    const o = { ...DEFAULTS, ...options };
    const trailCount = o.trailCount;

    const near = new Float32Array(trailCount * 3);
    const phase = new Float32Array(trailCount);
    const spectral = new Float32Array(trailCount);

    for (let i = 0; i < trailCount; i++) {
        // spread the near ends across the lower arc around the view axis
        const t = trailCount > 1 ? i / (trailCount - 1) : 0;
        const angle = o.angleStart + t * (o.angleEnd - o.angleStart);
        near[i * 3] = Math.cos(angle) * o.nearRadius;
        near[i * 3 + 1] = Math.sin(angle) * o.nearRadius + o.yOffset;
        near[i * 3 + 2] = o.nearZ;

        phase[i] = Math.random() * Math.PI * 2;
        spectral[i] = t;
    }

    return {
        trailCount,
        segments: o.segments,
        near,
        apex: { x: 0, y: o.apexY + o.yOffset, z: o.apexZ },
        phase,
        spectral,
        rippleFreq: o.rippleFreq,
        nearRadius: o.nearRadius,
        nearZ: o.nearZ,
        bendUp: o.bendUp,
        bendForward: o.bendForward,
        apexDrop: o.apexDrop,
        apexBack: o.apexBack,
    };
}

// Reusable control points, so the hot path (per-photon, per-frame) allocates
// nothing. Safe because JS is single-threaded and these never escape a call.
const _cp0 = { x: 0, y: 0, z: 0 };
const _cp1 = { x: 0, y: 0, z: 0 };
const _cp2 = { x: 0, y: 0, z: 0 };
const _latPoint = { x: 0, y: 0, z: 0 };
const _latTangent = { x: 0, y: 0, z: 0 };

// Write the three control points of a trail's cubic Bézier (from its near end
// P0 toward the shared apex P3) into the caller's objects.
function controlPoints(field, track, p0, p1, p2) {
    p0.x = field.near[track * 3];
    p0.y = field.near[track * 3 + 1];
    p0.z = field.near[track * 3 + 2];

    p1.x = p0.x;
    p1.y = p0.y + field.bendUp;
    p1.z = p0.z - field.bendForward;

    p2.x = field.apex.x;
    p2.y = field.apex.y - field.apexDrop;
    p2.z = field.apex.z + field.apexBack;
}

/**
 * Sample the point at parameter `s` along a trail (0 = near mouth, 1 = apex).
 *
 * @param {ReturnType<typeof createTrailField>} field
 * @param {number} track
 * @param {number} s
 * @param {{x:number,y:number,z:number}} out
 * @returns {{x:number,y:number,z:number}} `out`
 */
function canyonPoint(field, track, s, out) {
    controlPoints(field, track, _cp0, _cp1, _cp2);
    const p0 = _cp0;
    const p1 = _cp1;
    const p2 = _cp2;
    const p3 = field.apex;

    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;

    out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
    out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
    out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
    return out;
}

export {
    createTrailField, canyonPoint,
    canyonTangent, canyonLateral, rippleAmount, advancePhotons,
};

/**
 * Unit tangent of a trail at `s` (the Bézier derivative, normalised).
 *
 * @returns {{x:number,y:number,z:number}} `out`
 */
function canyonTangent(field, track, s, out) {
    controlPoints(field, track, _cp0, _cp1, _cp2);
    const p0 = _cp0;
    const p1 = _cp1;
    const p2 = _cp2;
    const p3 = field.apex;
    const u = 1 - s;

    const a = 3 * u * u;
    const b = 6 * u * s;
    const c = 3 * s * s;

    out.x = a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x);
    out.y = a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y);
    out.z = a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z);

    const length = Math.hypot(out.x, out.y, out.z);
    if (length < 1e-6) {
        out.x = 0; out.y = 0; out.z = -1;
        return out;
    }
    out.x /= length; out.y /= length; out.z /= length;
    return out;
}

/**
 * Unit lateral of a trail at `s`: perpendicular to the tangent and turned to
 * face the camera at the origin. Used as the ribbon's width direction and the
 * ripple's displacement direction.
 *
 * @returns {{x:number,y:number,z:number}} `out`
 */
function canyonLateral(field, track, s, out) {
    const point = canyonPoint(field, track, s, _latPoint);
    const tangent = canyonTangent(field, track, s, _latTangent);

    // view direction from the point to the camera at the origin
    const viewLength = Math.hypot(point.x, point.y, point.z) || 1;
    const vx = -point.x / viewLength;
    const vy = -point.y / viewLength;
    const vz = -point.z / viewLength;

    // cross(tangent, viewDir)
    out.x = tangent.y * vz - tangent.z * vy;
    out.y = tangent.z * vx - tangent.x * vz;
    out.z = tangent.x * vy - tangent.y * vx;

    const length = Math.hypot(out.x, out.y, out.z);
    if (length < 1e-6) {
        out.x = 1; out.y = 0; out.z = 0;
        return out;
    }
    out.x /= length; out.y /= length; out.z /= length;
    return out;
}

/**
 * Scalar ripple displacement at `s` on a trail. `ripple` is the current
 * amplitude (0 when no ripple is active) and `time` advances the wave. This is
 * the single source of the ripple formula; the trail vertex shader mirrors it.
 */
function rippleAmount(field, track, s, ripple, time) {
    return ripple * Math.sin(s * field.rippleFreq + field.phase[track] + time);
}

/**
 * Advance each photon's progress along its trail toward the near mouth and wrap
 * it into [0,1). Never reads/writes anything but `state`.
 */
function advancePhotons(field, state, deltaTime, speed) {
    for (let i = 0; i < state.count; i++) {
        const v = state.s[i] - speed * state.speed[i] * deltaTime;
        state.s[i] = v - Math.floor(v);
    }
}

