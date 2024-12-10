import fftFrag from './shader/fft.frag.glsl';
import flareFrag from './shader/flare.frag.glsl';
import fftConvolutionFrag from './shader/fft-convolution.frag.glsl';
import {
    GLSL3,
    HalfFloatType,
    LinearFilter, Mesh, PerspectiveCamera,
    RGBAFormat,
    ShaderMaterial,
    Vector2,
    Vector4,
    WebGLRenderTarget
} from 'three';
import {QuadGeometry} from '../libs/quad-geometry.js';
import {Blit} from '../libs/blit.js';

export class Bloom {

    convolutionSize = new Vector2();
    convolutionPow2Scale = 2;

    blit;
    bloomDownSampleSize = new Vector2();
    bloomDownSampleViewport = new Vector4();
    bloomViewportPaddingPercent = 0.1;
    uvViewport = new Vector4();

    constructor(renderer, viewportSize, flareTex) {
        this.renderer = renderer;
        this.camera = new PerspectiveCamera();
        this.flareTex = flareTex;

        this.flareMaterial = new ShaderMaterial({
            uniforms: {
                uAspect: {value: 0},
                uFlareTexture: {value: this.flareTex},
                uScale: {value: 1}
            },
            vertexShader: QuadGeometry.vertexShader,
            fragmentShader: flareFrag,
            depthWrite: false,
            depthTest: false,
            glslVersion: GLSL3,
            toneMapped: false
        });
        this.fftConvolutionMaterial = new ShaderMaterial({
            uniforms: {
                uFFT: { value: null },
                uKernel: { value: null },
            },
            vertexShader: QuadGeometry.vertexShader,
            fragmentShader: fftConvolutionFrag,
            depthWrite: false,
            depthTest: false,
            glslVersion: GLSL3,
            toneMapped: false
        });
        this.fftMaterial = new ShaderMaterial({
            uniforms: {
                uSrc: {value: null},
                uTexelSize: {value: new Vector2(1 / viewportSize.x, 1 / viewportSize.y) },
                uSubtransformSize: {value: 0},
                uHorizontal: {value: 0},
                uForward: {value: 0},
                uNormalization: {value: 0}
            },
            vertexShader: QuadGeometry.vertexShader,
            fragmentShader: fftFrag,
            depthWrite: false,
            depthTest: false,
            glslVersion: GLSL3,
            toneMapped: false
        });

        this.blit = new Blit(renderer);

        this.quadMesh = new Mesh(
            new QuadGeometry(),
            this.fftMaterial
        );

        this.rtFFT_1 = new WebGLRenderTarget(this.convolutionSize.x, this.convolutionSize.y, {
            depthBuffer: false,
            type: HalfFloatType,
            format: RGBAFormat,
            internalFormat: 'RGBA16F',
            magFilter: LinearFilter,
            minFilter: LinearFilter,
        });
        this.rtFFT_0 = this.rtFFT_1.clone();
        this.rtFFT_2 = this.rtFFT_1.clone();
        this.rtFlare_0 = new WebGLRenderTarget(this.convolutionSize.x, this.convolutionSize.y, { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter });
        this.rtFlare_1 = this.rtFlare_0.clone();
        this.rtFlare_2 = this.rtFlare_0.clone();

        this.updateParams(viewportSize);
    }

    get texture() {
        return this.rtFFT_2.texture;
    }

    updateParams(viewportSize) {
        const bloomViewportSize = viewportSize.clone().multiplyScalar(1 + this.bloomViewportPaddingPercent);
        this.convolutionSize.x = this.pow2ceil(bloomViewportSize.x / 2) >> this.convolutionPow2Scale;
        this.convolutionSize.y = this.pow2ceil(bloomViewportSize.y / 2) >> this.convolutionPow2Scale;

        this.bloomDownSampleSize.x = Math.ceil(bloomViewportSize.x / 2) >> this.convolutionPow2Scale;
        this.bloomDownSampleSize.y = Math.ceil(bloomViewportSize.y / 2) >> this.convolutionPow2Scale;

        const horizontalPadding = (this.convolutionSize.x - this.bloomDownSampleSize.x) + this.bloomDownSampleSize.x * this.bloomViewportPaddingPercent;
        const verticalPadding = (this.convolutionSize.y - this.bloomDownSampleSize.y) + this.bloomDownSampleSize.y * this.bloomViewportPaddingPercent;
        this.bloomDownSampleViewport.x = Math.ceil(horizontalPadding / 2);
        this.bloomDownSampleViewport.y = Math.ceil(verticalPadding / 2);
        this.bloomDownSampleViewport.z = this.bloomDownSampleSize.x - Math.floor(this.bloomDownSampleSize.x * this.bloomViewportPaddingPercent);
        this.bloomDownSampleViewport.w = this.bloomDownSampleSize.y - Math.floor(this.bloomDownSampleSize.y * this.bloomViewportPaddingPercent);

        this.uvViewport.x = this.bloomDownSampleViewport.x / this.convolutionSize.x;
        this.uvViewport.y = this.bloomDownSampleViewport.y / this.convolutionSize.y;
        this.uvViewport.z = this.uvViewport.x + this.bloomDownSampleViewport.z / this.convolutionSize.x;
        this.uvViewport.w = this.uvViewport.y + this.bloomDownSampleViewport.w / this.convolutionSize.y;

        const bloomStrength = 1;
        this.amount = (bloomStrength * 1e6) / Math.pow(this.powerTwoCeilingBase(viewportSize.x * viewportSize.y), 5.1);

        let h = this.convolutionSize.y / Math.max(this.convolutionSize.x, this.convolutionSize.y);
        this.flareMaterial.uniforms.uAspect.value = new Vector2(this.convolutionSize.x / this.convolutionSize.y * h, h);

        // TODO find better solution for a constant flare size across screens
        this.flareMaterial.uniforms.uScale.value = Math.max(1.75, 0.85 * Math.max(viewportSize.x, viewportSize.y) / Math.min(viewportSize.x, viewportSize.y));
    }

    resize(viewportSize) {
        this.updateParams(viewportSize);

        this.rtFFT_0.setSize(this.convolutionSize.x, this.convolutionSize.y);
        this.rtFFT_1.setSize(this.convolutionSize.x, this.convolutionSize.y);
        this.rtFFT_2.setSize(this.convolutionSize.x, this.convolutionSize.y);

        this.rtFlare_0.setSize(this.convolutionSize.x, this.convolutionSize.y);
        this.rtFlare_1.setSize(this.convolutionSize.x, this.convolutionSize.y);
        this.rtFlare_2.setSize(this.convolutionSize.x, this.convolutionSize.y);

        this.fftMaterial.uniforms.uTexelSize.value = new Vector2(1 / this.convolutionSize.x, 1 / this.convolutionSize.y);
    }

    render(sceneTexture) {
        const viewport = this.rtFFT_0.viewport.clone();
        this.rtFFT_0.viewport = this.bloomDownSampleViewport;
        this.blit.blit(sceneTexture, this.rtFFT_0);
        this.rtFFT_0.viewport = viewport;

        this.fft(this.convolutionSize, [this.rtFFT_0, this.rtFFT_1], this.rtFFT_2, true);

        this.renderer.setRenderTarget(this.rtFlare_0);
        this.quadMesh.material = this.flareMaterial;
        this.renderer.render(this.quadMesh, this.camera);

        this.fft(this.convolutionSize, [this.rtFlare_0, this.rtFlare_1], this.rtFlare_2, true);

        this.renderer.setRenderTarget(this.rtFFT_0);
        this.quadMesh.material = this.fftConvolutionMaterial;
        this.fftConvolutionMaterial.uniforms.uFFT.value = this.rtFFT_2.texture;
        this.fftConvolutionMaterial.uniforms.uKernel.value = this.rtFlare_2.texture;
        this.renderer.render(this.quadMesh, this.camera);

        this.fft(this.convolutionSize, [this.rtFFT_0, this.rtFFT_1], this.rtFFT_2, false);
    }

    fft(size, swapTargets, outTarget, forward) {
        let i,
            inputTarget = swapTargets[0],
            ping = swapTargets[0],
            pong = swapTargets[1],
            width = size.x,
            height = size.y;

        function swap () {
            const tmp = ping;
            ping = pong;
            pong = tmp;
        }

        let xIterations = Math.round(Math.log(width) / Math.log(2));
        let yIterations = Math.round(Math.log(height) / Math.log(2));
        let iterations = xIterations + yIterations;

        this.quadMesh.material = this.fftMaterial;
        const uniforms = this.fftMaterial.uniforms;
        uniforms.uTexelSize.value = new Vector2(1 / width, 1 / height);
        let rtOutput;

        for (i = 0; i < iterations; i++) {
            uniforms.uHorizontal.value = i < xIterations;
            uniforms.uForward.value = !!forward;

            rtOutput = pong;

            if (i === 0) {
                uniforms.uSrc.value = inputTarget.texture;
            } else {
                uniforms.uSrc.value = ping.texture;
            }

            if (i === iterations - 1) {
                rtOutput = outTarget;
            }

            if (i === 0) {
                uniforms.uNormalization.value = 1.0 / Math.sqrt(width * height);
            } else {
                uniforms.uNormalization.value = 1;
            }

            uniforms.uSubtransformSize.value = Math.pow(2, (uniforms.uHorizontal.value ? i : (i - xIterations)) + 1);

            this.renderer.setRenderTarget(rtOutput);
            this.renderer.render( this.quadMesh, this.camera );

            swap();
        }

        return rtOutput;
    }

    powerTwoCeilingBase(e) {
        return Math.ceil(Math.log(e) / Math.log(2))
    }
    pow2ceil(v) {
        return Math.pow(2, this.powerTwoCeilingBase(v));
    }
}