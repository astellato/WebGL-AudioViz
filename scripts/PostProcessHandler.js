/*
    PostProcessHandler.js - class for post processing in three.js

    Copyright © 2021 Anthony Stellato
*/

import * as THREE from 'three';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { RGBShiftShader } from './shaders/RGBShiftShader.js';
import { StableAfterimagePass } from './StableAfterimagePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LuminosityShader } from 'three/addons/shaders/LuminosityShader.js';
import { SobelOperatorShader } from 'three/addons/shaders/SobelOperatorShader.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
        this.composer.setPixelRatio(this.pixelRatio);
        this.composer.setSize(this.width, this.height);

        const physicalWidth = this.width * this.pixelRatio;
        const physicalHeight = this.height * this.pixelRatio;

        if(this.sobelPass){
            this.sobelPass.uniforms[ 'resolution' ].value.x = physicalWidth;
            this.sobelPass.uniforms[ 'resolution' ].value.y = physicalHeight;
        }

        if(this.fxaaPass){
            // FXAA expects the reciprocal of the physical resolution
            this.fxaaPass.uniforms[ 'resolution' ].value.x = 1 / physicalWidth;
            this.fxaaPass.uniforms[ 'resolution' ].value.y = 1 / physicalHeight;
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

    addRGBShiftPass(_amount, _angle){
        // the old RGBShiftPass wrapper duplicated ShaderPass exactly, so use it directly
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms[ 'amount' ].value = _amount;
        this.rgbShiftPass.uniforms[ 'angle' ].value = _angle;
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

    addAfterImagePass(){
        // Stock r186 AfterimagePass uses HalfFloat history buffers whose
        // feedback loop decays to black on real GPU drivers; the LDR
        // subclass keeps identical trails math with stable buffers.
        this.afterImagePass = new StableAfterimagePass();
        this.composer.addPass(this.afterImagePass);
    }

    addUnrealBloomPass(strength, radius, threshold){
        this.unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), strength, radius, threshold);
        this.composer.addPass(this.unrealBloomPass);
    }

    addFilmGrainPass(noiseIntensity, grayscale = false){
        this.filmPass = new FilmPass(noiseIntensity, grayscale);
        this.composer.addPass(this.filmPass);
    }

    addOutputPass(){
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
    }

    addFXAAPass(){
        this.fxaaPass = new ShaderPass( FXAAShader );
        this.composer.addPass(this.fxaaPass);
        // passes are added after the constructor's setSize(), so wire it up here too
        this.fxaaPass.uniforms[ 'resolution' ].value.x = 1 / (this.width * this.pixelRatio);
        this.fxaaPass.uniforms[ 'resolution' ].value.y = 1 / (this.height * this.pixelRatio);
    }
}

export {PostProcessHandler};