/*
    StarFieldShader.js - basic star field shader for three.js

    Based on Starfield Tutorial by Martijn Steinrucken aka BigWings - 2020
    https://www.shadertoy.com/view/tlyGW3

    Copyright © 2021 Anthony Stellato
*/

import { Vector2 }from 'https://cdn.skypack.dev/three@0.129.0';

const StarFieldShader = {
    uniforms: {
        'resolution': { value: new Vector2(256, 256) },
        'time': { value: 1 },
        'strength': { value: 1}
    },

    vertexShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            vUv = uv;

            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

        }
    `,

    fragmentShader: /* glsl */`
    uniform vec2 resolution;
    uniform float time;
    uniform float strength;

    varying vec2 vUv;

    // cheap random hash function
    float rand(vec2 r)
    {
        r = fract(r * vec2(123.34, 456.21));
        r += dot(r, r+45.32);
        return fract(r.x * r.y);
    }

    mat2 rotate(float theta)
    {
        float s = sin(theta);
        float c = cos(theta);
        
        return mat2(c, -s, s, c);
    }

    float Star(vec2 uv)
    {
        float d = length(uv);
        float m = 0.05/d;
        
        m *= smoothstep(0.2, 0., d);
        
        return m;
    }

    vec3 StarLayer(vec2 uv)
    {
        vec2 gridValue = fract(uv) - 0.5;
        vec2 id = floor(uv);
        
        vec3 col = vec3(0.);
        
        for(int y = -1; y <= 1; y++)
        {
            for(int x = -1; x <= 1; x++)
              {
                  vec2 offset = vec2(x, y);
              
                  float n = rand(id+offset); // random between 0 and 1
                  float size = fract(n*345.32) + .15;
                  
                  float star = Star(gridValue-offset-vec2(n, fract(n*34.))+.5);
                  
                  vec3 color = sin(vec3(.2, .3, .9)*fract(n*2345.2)*123.2)*.5+.5;
                  color = color*vec3(1,1.25,1.+size)+vec3(.2, .2, .1)*2.;
                  
                  //star *= sin(time*3.+n*6.2831)*.5+1.;
                  col += star*size*color;
              }
        }
        
        return col;
    }

    void main()
    {
        vec2 uv = 1. - 2. * vUv; // origin in center
        
        float NUM_LAYERS = 5.;
        
        float t = time * 0.05;
        
        uv *= rotate(t);
        
        vec3 col = vec3(0.);
        
        for(float i = 0.; i < 1.; i += 1./NUM_LAYERS)
        {
            float depth = fract(i+t);
            float scale = mix(5., 0.1, depth);
            float fade = depth * smoothstep(1., 0.9, depth);
            col += StarLayer(uv*scale+i*453.2)*fade;
        }
        
        gl_FragColor = vec4(col*strength,1.0);
    }
    `,
};

export { StarFieldShader };