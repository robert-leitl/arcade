import * as THREE from 'three';
import {
    ClampToEdgeWrapping,
    Color, CubeUVReflectionMapping, DirectionalLight, FloatType, GLSL3, HalfFloatType,
    IcosahedronGeometry, LinearFilter, LoadingManager,
    Mesh, MeshPhysicalMaterial,
    MeshStandardMaterial, NearestFilter, NoToneMapping, PointLight, RawShaderMaterial,
    Raycaster, RepeatWrapping, RGBAFormat, ShaderMaterial, TextureLoader,
    Vector2,
    Vector3, Vector4,
    WebGLRenderTarget
} from 'three';
import {resizeRendererToDisplaySize} from '../libs/three-utils';
import {QuadGeometry} from '../libs/quad-geometry.js';
import finalizeColorFrag from './shader/finalize-color.frag.glsl';
import fftFrag from './shader/fft.frag.glsl';
import flareFrag from './shader/flare.frag.glsl';
import fftConvolutionFrag from './shader/fft-convolution.frag.glsl';
import raymarchFrag from './shader/raymarch.frag.glsl';
import crtFrag from './shader/crt.frag.glsl';
import {OrbitControls, RGBELoader} from 'three/addons';
import {Blit} from '../libs/blit.js';
import {Paint} from './paint.js';
import {Env} from './env.js';

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

let rtScene, rtColor, rtFFT_0, rtFFT_1, rtFFT_2, rtFlare_0, rtFlare_1, rtFlare_2;

let fftMaterial, finalizeColorMaterial, flareMaterial, fftConvolutionMaterial, raymarchMaterial, crtMaterial;

const flareSize = new Vector2();
const convolutionSize = new Vector2();
const convolutionScale = 2;

let downsampleSceneBlit;
const bloomDownSampleSize = new Vector2();
const bloomDownSampleViewport = new Vector4();
const bloomViewportPaddingPercent = 0.1;
const bloomUvViewport = new Vector4();

const sceneRenderScale = .28;
let sceneRenderSize;

let paint, env;

let flareTex, blueNoiseTex, envMapTex;

function powerTwoCeilingBase(e) {
    return Math.ceil(Math.log(e) / Math.log(2))
}
function pow2ceil(v) {
    return Math.pow(2, powerTwoCeilingBase(v));
}

function init(canvas, onInit = null, isDev = false, pane = null) {
    _isDev = isDev;
    _pane = pane;

    if (pane) {

    }

    const manager = new LoadingManager();

    flareTex = new RGBELoader(manager).load((new URL('../assets/flare.hdr', import.meta.url)).toString())
    blueNoiseTex = new TextureLoader(manager).load((new URL('../assets/blue-noise-pattern.jpeg', import.meta.url)).toString())
    envMapTex = new RGBELoader(manager).load((new URL('../assets/env-02.hdr', import.meta.url)).toString())

    manager.onLoad = () => {
        setupScene(canvas);
    }
}

function setupScene(canvas) {
    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 5, 30 );
    camera.position.set(0, 0, 6);
    camera.lookAt(new Vector3());

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
    renderer.toneMapping = NoToneMapping;
    viewportSize = new Vector2(100, 100);
    sceneRenderSize = viewportSize.clone().multiplyScalar(sceneRenderScale);
    renderer.setSize(viewportSize.x, viewportSize.y, false);

    paint = new Paint(renderer, camera, viewportSize);

    env = new Env(renderer);

    raycaster = new Raycaster();

    // controls = new OrbitControls(camera, canvas);
    // controls.enableDamping = true;

    mesh1 = new Mesh(
        new IcosahedronGeometry(0.4, 1),
        new MeshPhysicalMaterial({ flatShading: true, roughness: 0, color: 0xff0000, emissive: new Color(1, 0, 0), emissiveIntensity: .2, toneMapped: false })
    );
    scene.add(mesh1);

    l1 = new PointLight();
    l1.color = new Color(1, 1, 1);
    l1.intensity = 3;
    l1.position.z = 1;
    scene.add(l1);

    blueNoiseTex.wrapS = blueNoiseTex.wrapT = RepeatWrapping;

    finalizeColorMaterial = new ShaderMaterial({
        uniforms: {
            uScene: {value: null},
            uBloom: {value: null},
            uBloomAmount: { value: 1 },
            uBloomViewport: { value: bloomDownSampleViewport },
            uSceneVolume: { value: null }
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: finalizeColorFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3,
        toneMapped: false
    });

    const envMap = env.texture;
    const envMapCubeUVHeight = ( !! envMap ) && ( envMap.mapping === CubeUVReflectionMapping ) ? envMap.image.height : null;
    const maxMip = Math.log2( envMapCubeUVHeight ) - 2;
    const texelHeight = 1.0 / envMapCubeUVHeight;
    const texelWidth = 1.0 / ( 3 * Math.max( Math.pow( 2, maxMip ), 7 * 16 ) );

    let h = viewportSize.y / Math.max(viewportSize.x, viewportSize.y);
    const aspect = new Vector2(viewportSize.x / viewportSize.y * h, h)
    flareMaterial = new ShaderMaterial({
        uniforms: {
            uAspect: {value: aspect},
            uFlareTexture: {value: flareTex}
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
        toneMapped: false
    });
    raymarchMaterial = new ShaderMaterial({
        uniforms: {
            uCamPos: { value: camera.position },
            uCamToWorldMat: { value: camera.matrixWorld },
            uCamInvProjMat: { value: camera.projectionMatrixInverse },
            uResolution: { value: sceneRenderSize.clone() },
            uTime: { value: 0 },
            uBlueNoiseTexture: { value: blueNoiseTex },
            uRenderStage: { value: 0 },
            uEnvMapTexture: { value: env.texture },
            uPaint: { value: paint.texture },
        },
        defines: {
            'CUBEUV_TEXEL_WIDTH': texelWidth,
            'CUBEUV_TEXEL_HEIGHT': texelHeight,
            'CUBEUV_MAX_MIP': `${maxMip}.0`,
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: raymarchFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3,
        toneMapped: false
    });
    crtMaterial = new ShaderMaterial({
        uniforms: {
            uColor: { value: null },
            uTime: { value: 0 },
            uFrame: { value: 0 },
            uResolution: { value: viewportSize.clone() },
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: crtFrag,
        depthWrite: false,
        depthTest: false,
        glslVersion: GLSL3
    });

    quadMesh = new Mesh(
        new QuadGeometry(),
        finalizeColorMaterial
    );


    rtScene = new WebGLRenderTarget(sceneRenderSize.x, sceneRenderSize.y, { type: HalfFloatType, samples: 1 });
    rtColor = new WebGLRenderTarget(sceneRenderSize.x, sceneRenderSize.y, { magFilter: NearestFilter, minFilter: NearestFilter });

    downsampleSceneBlit = new Blit(renderer);

    computeBloomSizes();

    rtFFT_1 = new WebGLRenderTarget(convolutionSize.x, convolutionSize.y, {
        depthBuffer: false,
        type: HalfFloatType,
        //type: FloatType,
        format: RGBAFormat,
        internalFormat: 'RGBA16F',
        //internalFormat: 'RGBA32F',
        magFilter: LinearFilter,
        minFilter: LinearFilter,
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

    fitSphereAtOriginToViewport(1.8, camera, 0., 0.5, 0.5);

    _isInitialized = true;
    resize();
}

function computeBloomSizes() {
    const bloomViewportSize = viewportSize.clone().multiplyScalar(1 + bloomViewportPaddingPercent);
    convolutionSize.x = pow2ceil(bloomViewportSize.x / 2) >> convolutionScale;
    convolutionSize.y = pow2ceil(bloomViewportSize.y / 2) >> convolutionScale;

    bloomDownSampleSize.x = Math.ceil(bloomViewportSize.x / 2) >> convolutionScale;
    bloomDownSampleSize.y = Math.ceil(bloomViewportSize.y / 2) >> convolutionScale;

    const horizontalPadding = (convolutionSize.x - bloomDownSampleSize.x) + bloomDownSampleSize.x * bloomViewportPaddingPercent;
    const verticalPadding = (convolutionSize.y - bloomDownSampleSize.y) + bloomDownSampleSize.y * bloomViewportPaddingPercent;
    bloomDownSampleViewport.x = Math.ceil(horizontalPadding / 2);
    bloomDownSampleViewport.y = Math.ceil(verticalPadding / 2);
    bloomDownSampleViewport.z = bloomDownSampleSize.x - Math.floor(bloomDownSampleSize.x * bloomViewportPaddingPercent);
    bloomDownSampleViewport.w = bloomDownSampleSize.y - Math.floor(bloomDownSampleSize.y * bloomViewportPaddingPercent);

    bloomUvViewport.x = bloomDownSampleViewport.x / convolutionSize.x;
    bloomUvViewport.y = bloomDownSampleViewport.y / convolutionSize.y;
    bloomUvViewport.z = bloomUvViewport.x + bloomDownSampleViewport.z / convolutionSize.x;
    bloomUvViewport.w = bloomUvViewport.y + bloomDownSampleViewport.w / convolutionSize.y;

    const bloomStrength = 1;
    const amount = (bloomStrength * 1e6) / Math.pow(powerTwoCeilingBase(viewportSize.x * viewportSize.y), 5.1);
    finalizeColorMaterial.uniforms.uBloomAmount.value = amount;

    let h = convolutionSize.y / Math.max(convolutionSize.x, convolutionSize.y);
    flareMaterial.uniforms.uAspect.value = new Vector2(convolutionSize.x / convolutionSize.y * h, h);
}

function run(t = 0) {
    deltaTimeMS = Math.min(TARGET_FRAME_DURATION_MS, t - time);
    time = t;
    deltaFrames = deltaTimeMS / TARGET_FRAME_DURATION_MS;
    frames += deltaFrames;

    animate();
    render();
}

function fitSphereAtOriginToViewport(radius, camera, sizePaddingFactor = 0, nearPlanePaddingFactor = 0, farPlanePaddingFactor = 0) {
    const r = radius * (1 + sizePaddingFactor);
    const fov = Math.PI * camera.fov / 360;
    if (camera.aspect >= 1) {
        camera.position.z = r / Math.sin(fov);
    } else {
        camera.position.z = r / (camera.aspect * Math.sin(fov));
    }
    camera.near = (camera.position.z - r) - r * nearPlanePaddingFactor;
    camera.far = (camera.position.z + r)  + r * farPlanePaddingFactor;
}

function resize() {
    if (!_isInitialized) return;

    if (resizeRendererToDisplaySize(renderer)) {

        renderer.getSize(viewportSize);
        camera.aspect = viewportSize.x / viewportSize.y;

        fitSphereAtOriginToViewport(1.8, camera, 0., 0.5, 0.5);
        camera.updateProjectionMatrix();

        sceneRenderSize = viewportSize.clone().multiplyScalar(sceneRenderScale);
        rtScene.setSize(sceneRenderSize.x, sceneRenderSize.y);
        rtColor.setSize(sceneRenderSize.x, sceneRenderSize.y);

        computeBloomSizes();

        rtFFT_0.setSize(convolutionSize.x, convolutionSize.y);
        rtFFT_1.setSize(convolutionSize.x, convolutionSize.y);
        rtFFT_2.setSize(convolutionSize.x, convolutionSize.y);

        flareSize.copy(convolutionSize);
        rtFlare_0.setSize(flareSize.x, flareSize.y);
        rtFlare_1.setSize(flareSize.x, flareSize.y);
        rtFlare_2.setSize(flareSize.x, flareSize.y);

        fftMaterial.uniforms.uTexelSize.value = new Vector2(1 / convolutionSize.x, 1 / convolutionSize.y);

        raymarchMaterial.uniforms.uResolution.value.copy(sceneRenderSize);

        crtMaterial.uniforms.uResolution.value.copy(viewportSize);

        paint.resize(viewportSize);
    }
}

function animate() {
    //if (controls) controls.update();

    //l1.position.set(Math.cos(time * 0.0005), Math.sin(time * 0.0005), 0);

    raymarchMaterial.uniforms.uTime.value = time;

    crtMaterial.uniforms.uTime.value = time;
    crtMaterial.uniforms.uFrame.value = frames;

    paint.animate(deltaTimeMS);
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

    paint.render();

    renderer.setRenderTarget(rtScene);
    quadMesh.material = raymarchMaterial;
    raymarchMaterial.uniforms.uPaint.value = paint.texture;
    renderer.render( quadMesh, camera );

    const viewport = rtFFT_0.viewport.clone();
    rtFFT_0.viewport = bloomDownSampleViewport;
    downsampleSceneBlit.blit(rtScene.texture, rtFFT_0);
    rtFFT_0.viewport = viewport;

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

    renderer.setRenderTarget(rtColor);
    quadMesh.material = finalizeColorMaterial;
    finalizeColorMaterial.uniforms.uScene.value = rtScene.texture;
    finalizeColorMaterial.uniforms.uBloom.value = rtFFT_2.texture;
    finalizeColorMaterial.uniforms.uBloomViewport.value = bloomUvViewport;
    finalizeColorMaterial.uniforms.uSceneVolume.value = rtColor.texture;
    renderer.render( quadMesh, camera );

    renderer.setRenderTarget(null);
    quadMesh.material = crtMaterial;
    crtMaterial.uniforms.uColor.value = rtColor.texture;
    renderer.render( quadMesh, camera );
}

export default {
    init,
    run,
    resize
}