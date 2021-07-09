/*
    PostProcessHandler.js - class for post processing in three.js

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'https://cdn.skypack.dev/three@0.129.0';

import { EffectComposer } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/ShaderPass.js';

import { InvertPass } from './postprocessing/InvertPass.js';
import { RGBShiftPass } from './postprocessing/RGBShiftPass.js';
import { AfterimagePass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GlitchPass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/GlitchPass.js';
import { OutlinePass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/OutlinePass.js';
import { LuminosityShader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/LuminosityShader.js';
import { SobelOperatorShader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/SobelOperatorShader.js';
import { FilmPass } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/FilmPass.js';
import { FXAAShader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/FXAAShader.js';

class PostProcessHandler {
    constructor(_renderer, _width, _height, _pixelRatio){
        this.renderer = _renderer;
        this.composer = new EffectComposer(this.renderer);
        this.setSize(_width, _height, _pixelRatio);
    }

    render(time){
        this.composer.render();
    }

    setSize(_width, _height, _pixelRatio){
        this.width  = _width;
        this.height = _height;
        this.pixelRatio = _pixelRatio;
        this.composer.setSize(this.width, this.height);

        if(this.sobelPass){
            this.sobelPass.uniforms[ 'resolution' ].value.x = this.width * this.pixelRatio;
            this.sobelPass.uniforms[ 'resolution' ].value.y = this.height * this.pixelRatio;
        }
    }

    addPass(pass){
        this.composer.addPass(pass);
    }

    addRenderPass(_scene, _camera){
        this.scene = _scene;
        this.camera = _camera;
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
    }

    addInvertPass(){
        this.invertPass = new InvertPass();
        this.composer.addPass(this.invertPass);
    }

    enableInvertPass(_enabled){
        this.invertPass.enabled = _enabled;
    }

    addRGBShiftPass(_amount, _angle){
        this.rgbShiftPass = new RGBShiftPass(_amount, _angle);
        this.composer.addPass(this.rgbShiftPass);
    }

    addSobelPass(){
        this.grayScalePass = new ShaderPass(LuminosityShader);
        this.composer.addPass(this.grayScalePass);

        this.sobelPass = new ShaderPass(SobelOperatorShader);
        this.sobelPass.uniforms[ 'resolution' ].value.x = this.width * this.pixelRatio;
        this.sobelPass.uniforms[ 'resolution' ].value.y = this.height * this.pixelRatio;
        this.composer.addPass( this.sobelPass );
    }

    enableSobelPass(_enabled){
        this.grayScalePass.enabled = _enabled;
        this.sobelPass.enabled = _enabled;
    }

    addOutlinePass(){
        this.outlinePass = new OutlinePass(new THREE.Vector2(this.width, this.height), this.scene, this.camera);
        this.composer.addPass(this.outlinePass);
    }

    addAfterImagePass(){
        this.afterImagePass = new AfterimagePass();
        this.composer.addPass(this.afterImagePass);
    }

    addUnrealBloomPass(strength, radius, threshold){
        this.unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), strength, radius, threshold);
        this.composer.addPass(this.unrealBloomPass);
    }

    addFilmGrainPass(noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale){
        this.filmPass = new FilmPass(noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale);
        this.composer.addPass(this.filmPass);
    }

    addFXAAPass(){
        this.fxaaPass = new ShaderPass( FXAAShader );
        this.composer.addPass(this.fxaaPass);
    }
}

export {PostProcessHandler};