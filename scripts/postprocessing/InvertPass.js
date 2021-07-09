/*
    InvertPass.js - Pass for inverted color postprocessing

    Copyright © 2021 Anthony Stellato
*/

import {
	ShaderMaterial,
	UniformsUtils
} from 'https://cdn.skypack.dev/three@0.129.0';
import { Pass, FullScreenQuad } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/Pass.js';
import { InvertShader } from '../shaders/InvertShader.js';

class InvertPass extends Pass {
    constructor(){
        super();

        if(InvertShader === undefined) console.error( 'InvertPass relies on InvertShader' );

        const shader = InvertShader;

        this.uniforms = UniformsUtils.clone( shader.uniforms );

        this.material = new ShaderMaterial( {
            uniforms: this.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer, readBuffer/*, deltaTime, maskActive*/){
        this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;

        if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );

		}
    }
}

export { InvertPass };