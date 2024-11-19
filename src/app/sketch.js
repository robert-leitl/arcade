import * as THREE from 'three';
import {
    ClampToEdgeWrapping,
    Color, DirectionalLight, GLSL3, HalfFloatType,
    IcosahedronGeometry, LinearFilter,
    Mesh, MeshPhysicalMaterial,
    MeshStandardMaterial, NearestFilter, PointLight, RawShaderMaterial,
    Raycaster, RGBAFormat, ShaderMaterial,
    Vector2,
    Vector3,
    WebGLRenderTarget
} from 'three';
import {resizeRendererToDisplaySize} from '../libs/three-utils';
import {QuadGeometry} from '../libs/quad-geometry.js';
import finalizeColorFrag from './shader/finalize-color.frag.glsl';
import fftFrag from './shader/fft.frag.glsl';
import flareFrag from './shader/flare.frag.glsl';
import fftConvolutionFrag from './shader/fft-convolution.frag.glsl';
import {OrbitControls} from 'three/addons';
import {Blit} from '../libs/blit.js';

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

let mesh1, quadMesh, l1;

let rtScene, rtFFT_0, rtFFT_1, rtFFT_2, rtFlare_0, rtFlare_1, rtFlare_2;

let fftMaterial, finalizeColorMaterial, flareMaterial, fftConvolutionMaterial;

const flareSize = new Vector2();
const convolutionSize = new Vector2();
const convolutionScale = 2;

let downsampleSceneBlit;

function init(canvas, onInit = null, isDev = false, pane = null) {
    _isDev = isDev;
    _pane = pane;

    if (pane) {

    }

    setupScene(canvas);
}

function pow2ceil(v) {
    return Math.pow(2, Math.ceil(Math.log(v)/Math.log(2)))
}

function setupScene(canvas) {
    camera = new THREE.PerspectiveCamera( 20, window.innerWidth / window.innerHeight, 1, 10 );
    camera.position.set(0, 0, 5);
    camera.lookAt(new Vector3());

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
    viewportSize = new Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    renderer.setSize(viewportSize.x, viewportSize.y, false);

    raycaster = new Raycaster();

    controls = new OrbitControls(camera, canvas);

    mesh1 = new Mesh(
        new IcosahedronGeometry(0.5, 1),
        new MeshPhysicalMaterial({ flatShading: true, roughness: 0, color: 0xff0000, emissive: new Color(1, 0, 0), emissiveIntensity: 0.1, toneMapped: false })
    );
    scene.add(mesh1);

    l1 = new PointLight();
    l1.color = new Color(1, 0, 0);
    l1.intensity = 3;
    l1.position.y = 1;
    scene.add(l1);

    finalizeColorMaterial = new ShaderMaterial({
        uniforms: {
            uScene: {value: null},
            uBloom: {value: null},
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: finalizeColorFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3,
        toneMapped: false
    });

    let h = viewportSize.y / Math.max(viewportSize.x, viewportSize.y);
    const aspect = new Vector2(viewportSize.x / viewportSize.y * h, h)
    flareMaterial = new ShaderMaterial({
        uniforms: {
            uAspect: {value: aspect},
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: flareFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3,
        toneMapped: false
    });

    fftConvolutionMaterial = new ShaderMaterial({
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

    rtScene = new WebGLRenderTarget(viewportSize.x, viewportSize.y, { type: HalfFloatType, samples: 1 });

    downsampleSceneBlit = new Blit(renderer);

    convolutionSize.x = pow2ceil(viewportSize.x / 2) >> convolutionScale;
    convolutionSize.y = pow2ceil(viewportSize.y / 2) >> convolutionScale;
    console.log(convolutionSize)
    rtFFT_1 = new WebGLRenderTarget(convolutionSize.x, convolutionSize.y, {
        depthBuffer: false,
        type: HalfFloatType,
        format: RGBAFormat,
        internalFormat: 'RGBA16F',
        magFilter: LinearFilter,
        minFilter: LinearFilter,
        wrapT: ClampToEdgeWrapping,
        wrapS: ClampToEdgeWrapping
    });
    rtFFT_0 = rtFFT_1.clone();
    rtFFT_2 = rtFFT_1.clone();

    flareSize.copy(convolutionSize);
    rtFlare_0 = new WebGLRenderTarget(flareSize.x, flareSize.y, { type: HalfFloatType,
        magFilter: LinearFilter,
        minFilter: LinearFilter });
    rtFlare_1 = rtFlare_0.clone();
    rtFlare_2 = rtFlare_0.clone();

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
        renderer.getSize(viewportSize);
        camera.aspect = viewportSize.x / viewportSize.y;
        camera.updateProjectionMatrix();

        rtScene.setSize(viewportSize.x, viewportSize.y);

        convolutionSize.x = pow2ceil(viewportSize.x / 2) >> convolutionScale;
        convolutionSize.y = pow2ceil(viewportSize.y / 2) >> convolutionScale;

        rtFFT_0.setSize(convolutionSize.x, convolutionSize.y);
        rtFFT_1.setSize(convolutionSize.x, convolutionSize.y);
        rtFFT_2.setSize(convolutionSize.x, convolutionSize.y);

        flareSize.copy(convolutionSize);
        rtFlare_0.setSize(flareSize.x, flareSize.y);
        rtFlare_1.setSize(flareSize.x, flareSize.y);
        rtFlare_2.setSize(flareSize.x, flareSize.y);

        fftMaterial.uniforms.uTexelSize.value = new Vector2(1 / convolutionSize.x, 1 / convolutionSize.y);

        let h = viewportSize.y / Math.max(viewportSize.x, viewportSize.y);
        flareMaterial.uniforms.uAspect.value = new Vector2(viewportSize.x / viewportSize.y * h, h);
    }
}

function animate() {
    if (controls) controls.update();

    l1.position.set(Math.cos(time * 0.0005), Math.sin(time * 0.0005), 0);
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

    ping = opts.ping;
    pong = opts.pong;

    let xIterations = Math.round(Math.log(width) / Math.log(2));
    let yIterations = Math.round(Math.log(height) / Math.log(2));
    let iterations = xIterations + yIterations;

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

        if (i === iterations - 1) {
            rtOutput = opts.output;
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

    downsampleSceneBlit.blit(rtScene.texture, rtFFT_0);

    fft({
        width: convolutionSize.x,
        height: convolutionSize.y,
        input: rtFFT_0,
        ping: rtFFT_0,
        pong: rtFFT_1,
        output: rtFFT_2,
        forward: true
    });

    renderer.setRenderTarget(rtFlare_0);
    quadMesh.material = flareMaterial;
    renderer.render(quadMesh, camera);

    fft({
        width: flareSize.x,
        height: flareSize.y,
        input: rtFlare_0,
        ping: rtFlare_0,
        pong: rtFlare_1,
        output: rtFlare_2,
        forward: true
    });

    renderer.setRenderTarget(rtFFT_0);
    quadMesh.material = fftConvolutionMaterial;
    fftConvolutionMaterial.uniforms.uFFT.value = rtFFT_2.texture;
    fftConvolutionMaterial.uniforms.uKernel.value = rtFlare_2.texture;
    renderer.render(quadMesh, camera);

    fft({
        width: convolutionSize.x,
        height: convolutionSize.y,
        input: rtFFT_0,
        ping: rtFFT_0,
        pong: rtFFT_1,
        output: rtFFT_2,
        forward: false
    });

    renderer.setRenderTarget(null);
    quadMesh.material = finalizeColorMaterial;
    finalizeColorMaterial.uniforms.uScene.value = rtScene.texture;
    finalizeColorMaterial.uniforms.uBloom.value = rtFFT_2.texture;
    renderer.render( quadMesh, camera );
}

export default {
    init,
    run,
    resize
}