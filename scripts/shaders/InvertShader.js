/*
    InvertShader.js - Shader that inverts color

    Copyright © 2021 Anthony Stellato
*/

const InvertShader = {
    uniforms: {
        'tDiffuse': { value: null },
    },

    vertexShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            vUv = uv;

            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;

        varying vec2 vUv;

        void main() {

            vec4 c = texture2D( tDiffuse, vUv );

            gl_FragColor = vec4( 1.0 - c.rgb, 1.0 );

        }
    `,
};

export { InvertShader };