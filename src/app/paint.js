import {GLSL3, HalfFloatType, LinearFilter, Mesh, RGBAFormat, ShaderMaterial, Vector2, WebGLRenderTarget} from 'three';
import {QuadGeometry} from '../libs/quad-geometry.js';
import paintFrag from './shader/paint.frag.glsl';

export class Paint {

    RENDER_SCALE = .25;

    currentSwapIndex = 0;
    swapRenderTargets = [];

    hasPointerInfo = false;

    pointerInfo = {
        isDown: false,

        // normalized pointer position (0..1, flip-y)
        position: new Vector2(1, 1),

        // normalized pointer position from the previous frame
        previousPosition: new Vector2(),

        // velocity of the normalized pointer position
        velocity: new Vector2(),

        // previous velocity of the normalized pointer position
        previousVelocity: new Vector2()
    };

    constructor(renderer, camera, viewportSize) {
        this.renderer = renderer;
        this.camera = camera;
        this.renderSize = viewportSize.clone().multiplyScalar(this.RENDER_SCALE);

        this.paintMaterial = new ShaderMaterial({
            uniforms: {
                uPrevPaint: { value: null },
                uPointerInfo: { value: this.pointerInfo },
                uAspect: { value: new Vector2() }
            },
            vertexShader: QuadGeometry.vertexShader,
            fragmentShader: paintFrag,
            depthWrite: false,
            depthTest: false,
            glslVersion: GLSL3
        });

        this.quadMesh = new Mesh(
            new QuadGeometry(),
            this.paintMaterial
        );

        this.swapRenderTargets[0] = new WebGLRenderTarget(this.renderSize.x, this.renderSize.y, {
            depthBuffer: false,
            type: HalfFloatType,
            format: RGBAFormat,
            internalFormat: 'RGBA16F',
            magFilter: LinearFilter,
            minFilter: LinearFilter,
        });
        this.swapRenderTargets[1] = this.swapRenderTargets[0].clone();

        this.initPointerInteraction(this.renderer.domElement);

        this.resize(viewportSize);
    }

    get texture() {
        return this.swapRenderTargets[this.currentSwapIndex].texture;
    }

    resize(viewportSize) {
        this.renderSize = viewportSize.clone().multiplyScalar(this.RENDER_SCALE);

        this.swapRenderTargets[0].setSize(this.renderSize.x, this.renderSize.y);
        this.swapRenderTargets[0].setSize(this.renderSize.x, this.renderSize.y);

        const aspect = this.renderSize.clone().multiplyScalar(1 / Math.max(this.renderSize.x, this.renderSize.y));
        this.paintMaterial.uniforms.uAspect.value = aspect.clone();

        // throttle the pointer velocity on smaller devices
        this.pointerVelocityAttenuation = Math.min(1, (Math.max(this.renderSize.x, this.renderSize.y) / 1400));
    }

    animate(dt) {
        if (!this.hasPointerInfo) return;

        const targetVelocity = new Vector2(
            (this.pointerInfo.position.x - this.pointerInfo.previousPosition.x) / dt,
            (this.pointerInfo.position.y - this.pointerInfo.previousPosition.y) / dt
        );
        //targetVelocity.multiplyScalar(this.pointerVelocityAttenuation);
        // smooth out the velocity changes a bit
        const velDamping = this.pointerInfo.isDown ? 4 : 4;
        this.pointerInfo.velocity.set(
            this.pointerInfo.velocity.x + (targetVelocity.x - this.pointerInfo.velocity.x) / velDamping,
            this.pointerInfo.velocity.y + (targetVelocity.y - this.pointerInfo.velocity.y) / velDamping
        );
    }

    render() {
        const prevRT = this.renderer.getRenderTarget();

        const nextSwapIndex = (this.currentSwapIndex + 1) % 2;

        this.renderer.setRenderTarget(this.swapRenderTargets[this.currentSwapIndex]);
        this.paintMaterial.uniforms.uPrevPaint.value = this.swapRenderTargets[nextSwapIndex].texture;
        this.paintMaterial.uniforms.uPointerInfo.value = this.pointerInfo;
        this.renderer.render(this.quadMesh, this.camera);

        this.currentSwapIndex = nextSwapIndex;

        this.renderer.setRenderTarget(prevRT);

        this.pointerInfo.previousVelocity.copy(this.pointerInfo.velocity);
        this.pointerInfo.previousPosition.copy(this.pointerInfo.position);
    }

    initPointerInteraction(canvas) {
        canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
        canvas.addEventListener('pointerup', e => this.onPointerUp(e));
        canvas.addEventListener('pointerleave', e => this.onPointerUp(e));
        canvas.addEventListener('pointermove', e => this.onPointerMove(e));
    }


    getNormalizedPointerPosition(e) {
        const size = [window.innerWidth, window.innerHeight];
        return [
            e.clientX / size[0],
            1 - (e.clientY / size[1])
        ];
    }

    onPointerDown(e) {
        this.pointerInfo.isDown = true;
    }

    onPointerMove(e) {
        this.pointerInfo.position.fromArray(this.getNormalizedPointerPosition(e));
        if (!this.hasPointerInfo) this.pointerInfo.previousPosition.copy(this.pointerInfo.position);

        this.hasPointerInfo = true;
    }

    onPointerUp(e) {
        this.pointerInfo.isDown = false;
        this.hasPointerInfo = false;
    }
}