/*
    RGBShiftPass.js - Pass for rgb shift postprocessing

    Copyright © 2021 Anthony Stellato
*/

import {
	ShaderMaterial,
	UniformsUtils
} from 'https://cdn.skypack.dev/three@0.129.0';
import { Pass, FullScreenQuad } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/Pass.js';
import { RGBShiftShader } from '../shaders/RGBShiftShader.js';

class RGBShiftPass extends Pass {
    constructor( amount, angle ){
        super();

        if(RGBShiftShader === undefined) console.error( 'RGBShiftPass relies on RGBShiftShader' );

        const shader = RGBShiftShader;
        this.amount = amount || 0.0005;
        this.angle = angle || 0.0;

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
        this.uniforms[ 'amount' ].value = this.amount;
        this.uniforms[ 'angle' ].value = this.angle;

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

export { RGBShiftPass };