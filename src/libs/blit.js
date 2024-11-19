import {
    AdditiveBlending,
    GLSL3,
    Mesh,
    MultiplyBlending,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial
} from 'three';

class Blit {
    constructor(renderer, customFragment) {

        this.material = new ShaderMaterial({
            uniforms: {
                uTexture: { value: null }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);    
                }`,
            fragmentShader: `
                uniform sampler2D uTexture;

                varying vec2 vUv;
                
                layout(location = 0) out vec4 outColor;

                void main() {
                    ${ customFragment ? customFragment : "outColor = texture(uTexture, vUv);" }  
                }`,
            depthTest:  false,
            depthWrite: false,
            glslVersion: GLSL3,
        });

        this.mesh = new Mesh(new PlaneGeometry(2,2), this.material);
        this.camera = new PerspectiveCamera( 45, 1, 1, 1000 );
        this.renderer = renderer;

        this.scene = new Scene();
        this.scene.add(this.mesh);
    }

    blit(textureFrom, renderTargetDest) {
        const pRenderTarget = this.renderer.getRenderTarget();

        this.renderer.setRenderTarget(renderTargetDest);

        this.material.uniforms.uTexture.value = textureFrom;
        this.renderer.render(this.scene, this.camera);

        this.renderer.setRenderTarget(pRenderTarget);
    }
}

export { Blit };