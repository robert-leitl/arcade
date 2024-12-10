import * as THREE from 'three';
import {
    CanvasTexture,
    CubeUVReflectionMapping,
    GLSL3,
    HalfFloatType,
    LoadingManager,
    Mesh,
    MeshBasicMaterial,
    NearestFilter,
    NoToneMapping,
    OrthographicCamera,
    PlaneGeometry,
    ShaderMaterial,
    Vector2,
    Vector3,
    Vector4,
    WebGLRenderTarget
} from 'three';
import {resizeRendererToDisplaySize} from '../libs/three-utils';
import {QuadGeometry} from '../libs/quad-geometry.js';
import finalizeColorFrag from './shader/finalize-color.frag.glsl';
import raymarchFrag from './shader/raymarch.frag.glsl';
import crtFrag from './shader/crt.frag.glsl';
import {RGBELoader} from 'three/addons';
import {Paint} from './paint.js';
import {Env} from './env.js';
import {Music} from './music.js';
import {Bloom} from './bloom.js';

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
    viewportSize;

let quadMesh;

let rtScene, rtColor;

let finalizeColorMaterial, raymarchMaterial, crtMaterial;

const sceneRenderScale = .28;
let sceneRenderSize;

let paint, env, bloom, music;

let flareTex;

let subAnimationValue = 0, sparkAnimationValue = 0;

let audioBtnElm = document.getElementById('audio-toggle');
let audioBtnCanvas = document.createElement('canvas');
let audioBtnRect;
let audioBtnMesh;
let audioBtnCamera = new OrthographicCamera(-.5, .5, .5, -.5, 0, 1);

const loadingMsgElm = document.getElementById('loading-message');

function init(canvas, onInit = null, isDev = false, pane = null) {
    _isDev = isDev;
    _pane = pane;

    music = new Music();

    const manager = new LoadingManager();

    flareTex = new RGBELoader(manager).load((new URL('../assets/flare.hdr', import.meta.url)).toString())

    manager.onLoad = () => {
        loadingMsgElm.style.display = 'none';

        setupScene(canvas);
        setupEvents();
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

    bloom = new Bloom(renderer, viewportSize, flareTex);

    env = new Env(renderer);
    const envMap = env.texture;
    const envMapCubeUVHeight = ( !! envMap ) && ( envMap.mapping === CubeUVReflectionMapping ) ? envMap.image.height : null;
    const maxMip = Math.log2( envMapCubeUVHeight ) - 2;
    const texelHeight = 1.0 / envMapCubeUVHeight;
    const texelWidth = 1.0 / ( 3 * Math.max( Math.pow( 2, maxMip ), 7 * 16 ) );


    finalizeColorMaterial = new ShaderMaterial({
        uniforms: {
            uScene: {value: null},
            uBloom: {value: null},
            uBloomAmount: { value: 1 },
            uBloomViewport: { value: bloom.uvViewport }
        },
        vertexShader: QuadGeometry.vertexShader,
        fragmentShader: finalizeColorFrag,
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
            uEnvMapTexture: { value: env.texture },
            uPaint: { value: paint.texture },
            uAnimationParams: { value: new Vector4() },
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
            uAnimationParams: { value: new Vector4() },
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

    audioBtnMesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({
            map: new CanvasTexture(audioBtnCanvas), transparent: true })
    );

    rtScene = new WebGLRenderTarget(sceneRenderSize.x, sceneRenderSize.y, { type: HalfFloatType, samples: 1 });
    rtColor = new WebGLRenderTarget(sceneRenderSize.x, sceneRenderSize.y, { magFilter: NearestFilter, minFilter: NearestFilter });

    renderer.setAnimationLoop((t) => run(t));

    _isInitialized = true;

    resize();
}

function setupEvents() {
    music.on('sub', e => subAnimationValue = 1);
    music.on('spark', e => sparkAnimationValue = 1);
    music.on('state', e => renderBtnTexture());
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

        const padding = camera.aspect > 1 ? Math.min(0.2, camera.aspect - 1) : 0;
        fitSphereAtOriginToViewport(1.8, camera, padding, 0.5, 0.5);
        camera.updateProjectionMatrix();

        sceneRenderSize = viewportSize.clone().multiplyScalar(sceneRenderScale);
        rtScene.setSize(sceneRenderSize.x, sceneRenderSize.y);
        rtColor.setSize(sceneRenderSize.x, sceneRenderSize.y);

        raymarchMaterial.uniforms.uResolution.value.copy(sceneRenderSize);

        crtMaterial.uniforms.uResolution.value.copy(viewportSize);

        paint.resize(viewportSize);
        bloom.resize(viewportSize);

        finalizeColorMaterial.uniforms.uBloomAmount.value = bloom.amount;
    }

    audioBtnRect = audioBtnElm.getBoundingClientRect();

    audioBtnCanvas.width = audioBtnRect.width;
    audioBtnCanvas.height = audioBtnRect.height;

    const vpRect = renderer.domElement.getBoundingClientRect();
    audioBtnMesh.scale.set((audioBtnRect.width) / vpRect.width, (audioBtnRect.height) / vpRect.height);
    audioBtnMesh.position.set(0, -(((audioBtnRect.top + audioBtnRect.height / 2)) / vpRect.height) + .495, 0);

    renderBtnTexture();
}

function animate() {
    //if (controls) controls.update();

    //l1.position.set(Math.cos(time * 0.0005), Math.sin(time * 0.0005), 0);

    const timeScale = deltaTimeMS / TARGET_FRAME_DURATION_MS;

    raymarchMaterial.uniforms.uTime.value = time;

    crtMaterial.uniforms.uTime.value = time;
    crtMaterial.uniforms.uFrame.value = frames;

    sparkAnimationValue -= sparkAnimationValue * .25 * timeScale;
    subAnimationValue -= subAnimationValue * .02 * timeScale;

    raymarchMaterial.uniforms.uAnimationParams.value = new Vector4(1 - Math.pow(1 - sparkAnimationValue, 2), subAnimationValue, 0, 0);
    crtMaterial.uniforms.uAnimationParams.value = new Vector4(1 - Math.pow(1 - sparkAnimationValue, 2), subAnimationValue, 0, 0);

    paint.animate(deltaTimeMS, timeScale);
}

function render() {
    // pointer trail
    paint.render();

    // render scene
    renderer.setRenderTarget(rtScene);
    renderer.autoClear = false;
    quadMesh.material = raymarchMaterial;
    raymarchMaterial.uniforms.uPaint.value = paint.texture;
    renderer.render( quadMesh, camera );
    renderer.render( audioBtnMesh, audioBtnCamera );
    renderer.autoClear = true;

    // render bloom
    bloom.render(rtScene.texture);

    renderer.setRenderTarget(rtColor);
    quadMesh.material = finalizeColorMaterial;
    finalizeColorMaterial.uniforms.uScene.value = rtScene.texture;
    finalizeColorMaterial.uniforms.uBloom.value = bloom.texture;
    finalizeColorMaterial.uniforms.uBloomViewport.value = bloom.uvViewport;
    renderer.render( quadMesh, camera );

    // crt post effect
    renderer.setRenderTarget(null);
    quadMesh.material = crtMaterial;
    crtMaterial.uniforms.uColor.value = rtColor.texture;
    renderer.render( quadMesh, camera );
}

function renderBtnTexture() {
    const canvas = audioBtnCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e0e0ef';
    ctx.font = `${Math.round(audioBtnCanvas.height * .75)}px monospace`;
    ctx.fillText(music.isPlaying ? 'DISABLE AUDIO' : 'ENABLE AUDIO', canvas.width / 2, canvas.height / 1.75);
    audioBtnMesh.material.map.needsUpdate = true;
}

export default {
    init,
    run,
    resize
}