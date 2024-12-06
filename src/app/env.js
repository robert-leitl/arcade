import {
    Color,
    IcosahedronGeometry,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    PMREMGenerator,
    Scene,
    Spherical,
    Vector3
} from 'three';

export class Env {
    texture

    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new Scene();
        this.pmremGenerator = new PMREMGenerator(this.renderer);

        // magenta area light left
        this.areaLight = new Mesh(
            new PlaneGeometry(2, 2),
            new MeshBasicMaterial({color: new Color(0x00ffff).multiplyScalar(2)})
        );
        this.areaLight.position.set(1, 0, -1);
        this.areaLight.lookAt(0, 0, 0);
        this.scene.add(this.areaLight);

        const p1 = new Mesh(
            new IcosahedronGeometry(.7, 12),
            new MeshBasicMaterial({color: new Color(0xff00ff).multiplyScalar(7)})
        );
        p1.position.set(0, .9, 0);
        this.scene.add(p1);

        const p2 = new Mesh(
            new IcosahedronGeometry(.2, 12),
            new MeshBasicMaterial({color: new Color(0xffffff).multiplyScalar(100)})
        );
        p2.position.set(0, -1, -1);
        this.scene.add(p2);

        this.update();
    }

    update() {
        const rt = this.pmremGenerator.fromScene(this.scene, 0.04);
        this.texture = rt.texture;
    }
}