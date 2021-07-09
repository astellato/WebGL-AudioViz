/*
    BlobShader.js - A distortion shader

    Color based on iq's palette article
        https://www.iquilezles.org/www/articles/palettes/palettes.htm

    Distortion based on Jaume Sanchez's (spite) article on displacement
        https://www.clicktorelease.com/blog/vertex-displacement-noise-3d-webgl-glsl-three-js/

    Distortion based on 
    Copyright © 2021 Anthony Stellato
*/

import { Vector3 }from 'https://cdn.skypack.dev/three@0.129.0';

const BlobShader = {
    uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.3 },
        uNoiseDensity: { value: 1.5 },
        uNoiseStrength: { value: .12 },
        uFreq: { value: 3 },
        uAmp: { value: 6 },
        uHue: { value: 0.75 },
        uOffset: { value: 0.15 },
        uAlpha: { value: 1 },
        uBrightness: { value: new Vector3(0.5, 0.5, 0.4) },
        uContrast: { value: new Vector3(0.2, 0.4, 0.2) },
        uOscilation: { value: new Vector3(1.0, 0.7, 0) },
        uPhase: { value: new Vector3(0, 0.10, 0.20) },
    },

    vertexShader: /* glsl */`

        varying vec2 vUv;
        varying float vDistort;

        uniform float uTime;
        uniform float uSpeed;
        uniform float uNoiseStrength;
        uniform float uNoiseDensity;
        uniform float uFreq;
        uniform float uAmp;
        uniform float uOffset;

        //
        // GLSL textureless classic 3D noise "cnoise",
        // with an RSL-style periodic variant "pnoise".
        // Author:  Stefan Gustavson (stefan.gustavson@liu.se)
        // Version: 2011-10-11
        //
        // Many thanks to Ian McEwan of Ashima Arts for the
        // ideas for permutation and gradient selection.
        //
        // Copyright (c) 2011 Stefan Gustavson. All rights reserved.
        // Distributed under the MIT license. See LICENSE file.
        // https://github.com/ashima/webgl-noise
        //

        vec3 mod289_1(vec3 x)
        {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289_1(vec4 x)
        {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute_1(vec4 x)
        {
            return mod289_1(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt_1(vec4 r)
        {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade_1(vec3 t) {
            return t*t*t*(t*(t*6.0-15.0)+10.0);
        }

        // Classic Perlin noise
        float cnoise(vec3 P)
        {
            vec3 Pi0 = floor(P); // Integer part for indexing
            vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
            Pi0 = mod289_1(Pi0);
            Pi1 = mod289_1(Pi1);
            vec3 Pf0 = fract(P); // Fractional part for interpolation
            vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
            vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
            vec4 iy = vec4(Pi0.yy, Pi1.yy);
            vec4 iz0 = Pi0.zzzz;
            vec4 iz1 = Pi1.zzzz;

            vec4 ixy = permute_1(permute_1(ix) + iy);
            vec4 ixy0 = permute_1(ixy + iz0);
            vec4 ixy1 = permute_1(ixy + iz1);

            vec4 gx0 = ixy0 * (1.0 / 7.0);
            vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
            gx0 = fract(gx0);
            vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
            vec4 sz0 = step(gz0, vec4(0.0));
            gx0 -= sz0 * (step(0.0, gx0) - 0.5);
            gy0 -= sz0 * (step(0.0, gy0) - 0.5);

            vec4 gx1 = ixy1 * (1.0 / 7.0);
            vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
            gx1 = fract(gx1);
            vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
            vec4 sz1 = step(gz1, vec4(0.0));
            gx1 -= sz1 * (step(0.0, gx1) - 0.5);
            gy1 -= sz1 * (step(0.0, gy1) - 0.5);

            vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
            vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
            vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
            vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
            vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
            vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
            vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
            vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

            vec4 norm0 = taylorInvSqrt_1(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
            g000 *= norm0.x;
            g010 *= norm0.y;
            g100 *= norm0.z;
            g110 *= norm0.w;
            vec4 norm1 = taylorInvSqrt_1(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
            g001 *= norm1.x;
            g011 *= norm1.y;
            g101 *= norm1.z;
            g111 *= norm1.w;

            float n000 = dot(g000, Pf0);
            float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
            float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
            float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
            float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
            float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
            float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
            float n111 = dot(g111, Pf1);

            vec3 fade_xyz = fade_1(Pf0);
            vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
            vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
            float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
            return 2.2 * n_xyz;
        }

        //
        // GLSL textureless classic 3D noise "cnoise",
        // with an RSL-style periodic variant "pnoise".
        // Author:  Stefan Gustavson (stefan.gustavson@liu.se)
        // Version: 2011-10-11
        //
        // Many thanks to Ian McEwan of Ashima Arts for the
        // ideas for permutation and gradient selection.
        //
        // Copyright (c) 2011 Stefan Gustavson. All rights reserved.
        // Distributed under the MIT license. See LICENSE file.
        // https://github.com/ashima/webgl-noise
        //

        vec3 mod289_0(vec3 x)
        {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289_0(vec4 x)
        {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute_0(vec4 x)
        {
            return mod289_0(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt_0(vec4 r)
        {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade_0(vec3 t) {
            return t*t*t*(t*(t*6.0-15.0)+10.0);
        }

        // Classic Perlin noise, periodic variant
        float pnoise(vec3 P, vec3 rep)
        {
            vec3 Pi0 = mod(floor(P), rep); // Integer part, modulo period
            vec3 Pi1 = mod(Pi0 + vec3(1.0), rep); // Integer part + 1, mod period
            Pi0 = mod289_0(Pi0);
            Pi1 = mod289_0(Pi1);
            vec3 Pf0 = fract(P); // Fractional part for interpolation
            vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
            vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
            vec4 iy = vec4(Pi0.yy, Pi1.yy);
            vec4 iz0 = Pi0.zzzz;
            vec4 iz1 = Pi1.zzzz;

            vec4 ixy = permute_0(permute_0(ix) + iy);
            vec4 ixy0 = permute_0(ixy + iz0);
            vec4 ixy1 = permute_0(ixy + iz1);

            vec4 gx0 = ixy0 * (1.0 / 7.0);
            vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
            gx0 = fract(gx0);
            vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
            vec4 sz0 = step(gz0, vec4(0.0));
            gx0 -= sz0 * (step(0.0, gx0) - 0.5);
            gy0 -= sz0 * (step(0.0, gy0) - 0.5);

            vec4 gx1 = ixy1 * (1.0 / 7.0);
            vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
            gx1 = fract(gx1);
            vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
            vec4 sz1 = step(gz1, vec4(0.0));
            gx1 -= sz1 * (step(0.0, gx1) - 0.5);
            gy1 -= sz1 * (step(0.0, gy1) - 0.5);

            vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
            vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
            vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
            vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
            vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
            vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
            vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
            vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

            vec4 norm0 = taylorInvSqrt_0(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
            g000 *= norm0.x;
            g010 *= norm0.y;
            g100 *= norm0.z;
            g110 *= norm0.w;
            vec4 norm1 = taylorInvSqrt_0(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
            g001 *= norm1.x;
            g011 *= norm1.y;
            g101 *= norm1.z;
            g111 *= norm1.w;

            float n000 = dot(g000, Pf0);
            float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
            float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
            float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
            float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
            float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
            float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
            float n111 = dot(g111, Pf1);

            vec3 fade_xyz = fade_0(Pf0);
            vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
            vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
            float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
            return 2.2 * n_xyz;
        }

        mat3 rotation3dY(float angle) {
            float s = sin(angle);
            float c = cos(angle);

            return mat3(
                c, 0.0, -s,
                0.0, 1.0, 0.0,
                s, 0.0, c
            );
        }

        vec3 rotateY(vec3 v, float angle) {
            return rotation3dY(angle) * v;
        }

        float remap(float value, float inMin, float inMax, float outMin, float outMax) {
            return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
        }

        void main() {
            vUv = uv;
            
            float t = uTime * uSpeed;
            //float distortion = pnoise((normal + t) * uNoiseDensity, vec3(10.0)) * uNoiseStrength;
            float distortion = pnoise((normal) * uNoiseDensity, vec3(2.*PI)) * uNoiseStrength;

            vec3 pos = position + (normal * distortion);

            float angle = sin(uv.y * uFreq + t) * uAmp;
            pos = rotateY(pos, angle);

            pos *= remap(sin(uTime + uOffset), -1.0, 1.0, 1.0, 1.2);

            vDistort = distortion;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.);
        }`,

    fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying float vDistort;

        uniform float uTime;
        uniform float uHue;
        uniform float uAlpha;
        uniform vec3 uBrightness;
        uniform vec3 uContrast;
        uniform vec3 uOscilation;
        uniform vec3 uPhase;

        vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
            return a + b * cos(6.28318 * (c * t + d));
        }   

        void main() {
            float distort = vDistort * 2.0;
            vec3 color = cosPalette(uHue + distort, uBrightness, uContrast, uOscilation, uPhase);

            gl_FragColor = vec4(color, uAlpha);
        }`
};

export { BlobShader };