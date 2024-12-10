import isMobile from 'is-mobile';

export function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const maxPixelRatio = isMobile() ? 2 : 1;
    const pixelRatio = Math.min(maxPixelRatio, window.devicePixelRatio);
    const width  = canvas.clientWidth  * pixelRatio | 0;
    const height = canvas.clientHeight * pixelRatio | 0;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
}