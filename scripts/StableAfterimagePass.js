/*
    StableAfterimagePass.js - AfterimagePass with LDR feedback buffers.

    The stock three r186 AfterimagePass keeps its feedback history in
    HalfFloat render targets. On real GPU drivers (verified on NVIDIA, and
    reported on the user's machine) the feedback loop progressively decays
    to black within ~30s of playback, while the software renderer is
    unaffected. The r129-era pass used UnsignedByte buffers and ran
    problem-free for years, so this subclass restores exactly that: same
    pass, same AfterimageShader math and damp API, only the two private
    history targets are recreated as UnsignedByte.

    The feedback blend is additionally clamped to a finite HDR ceiling.
    The stock shader's max() latch holds +Inf forever (Inf * damp == Inf),
    so a single overbright pixel upstream (e.g. the old starfield 1/d
    singularity) froze into a permanent white/gray rectangle. Finite values
    at or below the ceiling follow the stock math exactly.

    If a future three version fixes the underlying driver issue, delete this
    file and import AfterimagePass from 'three/addons' again.
*/

// Feedback values above this never occur in legitimate content (post star
// fix, star cores peak ~5); anything larger is an Inf/NaN-class glitch that
// must not be allowed to latch in the history buffers.
const FEEDBACK_MAX = 8.0;

import { NearestFilter, UnsignedByteType, WebGLRenderTarget } from 'three';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

class StableAfterimagePass extends AfterimagePass {
    constructor(damp = 0.96){
        super(damp);

        // Recreate the history buffers as LDR. Sizes carry over from the
        // stock constructor (window-sized; PostProcessHandler.setSize resizes
        // them to the composer size right after the pass is added).
        const width = this._textureComp.width;
        const height = this._textureComp.height;
        this._textureComp.dispose();
        this._textureOld.dispose();

        // Match the stock pass options exactly except for the type: no depth
        // buffer and Nearest magnification. A depth buffer here is harmful:
        // the feedback render never clears depth and the comp material leaves
        // depthTest enabled, so stale depth culls fragments of the fullscreen
        // quad and leaves uninitialized (white) tiles — large axis-aligned
        // rectangles that get worse at high resolutions.
        const options = {
            magFilter: NearestFilter,
            type: UnsignedByteType,
            depthBuffer: false,
        };
        this._textureComp = new WebGLRenderTarget(width, height, options);
        this._textureOld = new WebGLRenderTarget(width, height, options);

        // Belt and braces: the feedback blend is a fullscreen quad, it must
        // never be depth-tested regardless of target options.
        this.compFsMaterial.depthTest = false;
        this.compFsMaterial.depthWrite = false;

        // Clamp both feedback inputs to a finite ceiling. The trails math
        // below is otherwise identical to AfterimageShader: max() of the new
        // frame and the damped history, with the 0.1 kill threshold.
        this.compFsMaterial.fragmentShader = /* glsl */`
            uniform float damp;
            uniform sampler2D tOld;
            uniform sampler2D tNew;
            varying vec2 vUv;
            vec4 when_gt(vec4 x, float y) {
                return max(sign(x - y), 0.0);
            }
            void main() {
                vec4 texelOld = min(texture2D(tOld, vUv), vec4(${FEEDBACK_MAX.toFixed(1)}));
                vec4 texelNew = min(texture2D(tNew, vUv), vec4(${FEEDBACK_MAX.toFixed(1)}));
                texelOld *= damp * when_gt(texelOld, 0.1);
                gl_FragColor = max(texelNew, texelOld);
            }`;
        this.compFsMaterial.needsUpdate = true;
    }
}

export { StableAfterimagePass };
