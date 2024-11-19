import * as THREE from 'three';
import {
    ClampToEdgeWrapping,
    Color, GLSL3, HalfFloatType,
    IcosahedronGeometry, LinearFilter,
    Mesh,
    MeshStandardMaterial, NearestFilter, RawShaderMaterial,
    Raycaster, RGBAFormat, ShaderMaterial,
    Vector2,
    Vector3,
    WebGLRenderTarget
} from 'three';
import {resizeRendererToDisplaySize} from '../libs/three-utils';
import {QuadGeometry} from '../libs/quad-geometry.js';
import finalizeColorFrag from './shader/finalize-color.frag.glsl';
import fftFrag from './shader/fft.frag.glsl';

// the target duration of one frame in milliseconds
const TARGET_FRAME_DURATION_MS = 16;

// total time
var time = 0;

// duration betweent the previous and the current animation frame
var deltaTimeMS = 0;

// total framecount according to the target frame duration
var frames = 0;

// relative frames according to the target frame duration (1 = 60 fps)
// gets smaller with higher framerates --> use to adapt animation timing
var deltaFrames = 0;

const settings = {
}

// module variables
var _isDev,
    _pane,
    _isInitialized = false,
    camera,
    scene,
    renderer,
    controls,
    raycaster,
    viewportSize;

let mesh1, quadMesh;

let rtScene, rtFFT_0, rtFFT_1, rtFFT_2;

let fftMaterial, finalizeColorMaterial;

const fixedViewportSize = new Vector2(1024, 1024);

function init(canvas, onInit = null, isDev = false, pane = null) {
    _isDev = isDev;
    _pane = pane;

    if (pane) {

    }

    setupScene(canvas);
}

function setupScene(canvas) {
    camera = new THREE.PerspectiveCamera( 20, window.innerWidth / window.innerHeight, 1, 10 );
    camera.position.set(0, 0, 5);
    camera.lookAt(new Vector3());

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
    viewportSize = new Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    viewportSize.copy(fixedViewportSize);
    renderer.setSize(viewportSize.x, viewportSize.y);

    raycaster = new Raycaster();

    mesh1 = new Mesh(
        new IcosahedronGeometry(0.01, 2),
        new MeshStandardMaterial({ emissive: new Color(1, 0, 0), emissiveIntensity: 1, toneMapped: false })
    );
    scene.add(mesh1);

    finalizeColorMaterial = new ShaderMaterial({
        uniforms: {
            uScene: {value: null},
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: finalizeColorFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3,
        toneMapped: false
    });

    fftMaterial = new ShaderMaterial({
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
    })

    quadMesh = new Mesh(
        new QuadGeometry(),
        finalizeColorMaterial
    );

    rtScene = new WebGLRenderTarget(viewportSize.x, viewportSize.y, { type: HalfFloatType });
    rtFFT_1 = new WebGLRenderTarget(viewportSize.x, viewportSize.y, {
        depthBuffer: false,
        type: HalfFloatType,
        format: RGBAFormat,
        internalFormat: 'RGBA16F',
        magFilter: NearestFilter,
        minFilter: NearestFilter,
        wrapT: ClampToEdgeWrapping,
        wrapS: ClampToEdgeWrapping
    });
    rtFFT_0 = rtFFT_1.clone();
    rtFFT_2 = rtFFT_1.clone();

    renderer.setAnimationLoop((t) => run(t));

    _isInitialized = true;
}

function run(t = 0) {
    deltaTimeMS = Math.min(TARGET_FRAME_DURATION_MS, t - time);
    time = t;
    deltaFrames = deltaTimeMS / TARGET_FRAME_DURATION_MS;
    frames += deltaFrames;

    animate();
    render();
}

function resize() {
    if (!_isInitialized) return;

    if (resizeRendererToDisplaySize(renderer)) {
        // TODO remove power of two restriction
        renderer.setSize(fixedViewportSize.x, fixedViewportSize.y, true);

        renderer.getSize(viewportSize);
        camera.aspect = viewportSize.x / viewportSize.y;
        camera.updateProjectionMatrix();

        rtScene.setSize(viewportSize.x, viewportSize.y);
        rtFFT_0.setSize(viewportSize.x, viewportSize.y);
        rtFFT_1.setSize(viewportSize.x, viewportSize.y);
        rtFFT_2.setSize(viewportSize.x, viewportSize.y);

        fftMaterial.uniforms.uTexelSize.value = new Vector2(1 / viewportSize.x, 1 / viewportSize.y);
    }
}

function animate() {
    if (controls) controls.update();
}

function fft(opts) {
    let i, ping, pong, width, height;

    opts = opts || {};
    opts.forward = opts.forward === undefined ? true : opts.forward;
    opts.splitNormalization = opts.splitNormalization === undefined ? true : opts.splitNormalization;

    function swap () {
        const tmp = ping;
        ping = pong;
        pong = tmp;
    }

    if (opts.size !== undefined) {
        width = height = opts.size;
    } else if (opts.width !== undefined && opts.height !== undefined) {
        width = opts.width;
        height = opts.height;
    } else {
        throw new Error('either size or both width and height must provided.');
    }

    // Swap to avoid collisions with the input:
    // ping = opts.ping;
    // if (opts.input === opts.pong) {
    //     ping = opts.pong;
    // }
    // pong = ping === opts.ping ? opts.pong : opts.ping;

    ping = opts.ping;
    pong = opts.pong;

    let xIterations = Math.round(Math.log(width) / Math.log(2));
    let yIterations = Math.round(Math.log(height) / Math.log(2));
    let iterations = xIterations + yIterations;

    // Swap to avoid collisions with output:
    // if (opts.output === ((iterations % 2 === 0) ? pong : ping)) {
    //     swap();
    // }
    //
    // // If we've avoiding collision with output creates an input collision,
    // // then you'll just have to rework your framebuffers and try again.
    // if (opts.input === pong) {
    //     throw new Error([
    //         'not enough framebuffers to compute without copying data. You may perform',
    //         'the computation with only two framebuffers, but the output must equal',
    //         'the input when an even number of iterations are required.'
    //     ].join(' '));
    // }

    quadMesh.material = fftMaterial;
    const uniforms = fftMaterial.uniforms;
    uniforms.uTexelSize.value = new Vector2(1 / width, 1 / height);
    let rtOutput;

    for (i = 0; i < iterations; i++) {
        uniforms.uHorizontal.value = i < xIterations;
        uniforms.uForward.value = !!opts.forward;

        rtOutput = pong;

        if (i === 0) {
            uniforms.uSrc.value = opts.input.texture;
        } else {
            uniforms.uSrc.value = ping.texture;
        }

        if (i === 0) {
            if (!!opts.splitNormalization) {
                uniforms.uNormalization.value = 1.0 / Math.sqrt(width * height);
            } else if (!opts.forward) {
                uniforms.uNormalization.value = 1.0 / width / height;
            } else {
                uniforms.uNormalization.value = 1;
            }
        } else {
            uniforms.uNormalization.value = 1;
        }

        uniforms.uSubtransformSize.value = Math.pow(2, (uniforms.uHorizontal.value ? i : (i - xIterations)) + 1);

        renderer.setRenderTarget(rtOutput);
        renderer.render( quadMesh, camera );

        swap();
    }

    return rtOutput;
}

function render() {
    renderer.setRenderTarget(rtScene);
    renderer.render( scene, camera );

    let rtFFT_Result = fft({
        width: viewportSize.x,
        height: viewportSize.y,
        input: rtScene,
        ping: rtFFT_0,
        pong: rtFFT_1,
        forward: true
    });

    rtFFT_Result = fft({
        width: viewportSize.x,
        height: viewportSize.y,
        input: rtFFT_Result,
        ping: rtFFT_1,
        pong: rtFFT_2,
        forward: false
    });

    renderer.setRenderTarget(null);
    quadMesh.material = finalizeColorMaterial;
    finalizeColorMaterial.uniforms.uScene.value = rtFFT_Result.texture;
    renderer.render( quadMesh, camera );
}

export default {
    init,
    run,
    resize
}