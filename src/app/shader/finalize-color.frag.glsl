uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uSceneVolume;
uniform float uBloomAmount;
uniform vec4 uBloomViewport;

layout(location = 0) out vec4 outColor;

in vec2 vUv;

uniform float toneMappingExposure;

#define DITHERING 1

#include <common>
#include <dithering_pars_fragment>

vec3 NeutralToneMapping( vec3 color ) {

    const float StartCompression = 0.8 - 0.04;
    const float Desaturation = 0.15;

    color *= toneMappingExposure;

    float x = min( color.r, min( color.g, color.b ) );

    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;

    color -= offset;

    float peak = max( color.r, max( color.g, color.b ) );

    if ( peak < StartCompression ) return color;

    float d = 1. - StartCompression;

    float newPeak = 1. - d * d / ( peak + d - StartCompression );

    color *= newPeak / peak;

    float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );

    return mix( color, vec3( newPeak ), g );

}

vec2 map(vec2 value, vec2 inMin, vec2 inMax, vec2 outMin, vec2 outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

void main() {
    vec4 sceneColor = texture(uScene, vUv);
    vec2 sceneResolution = vec2(textureSize(uScene, 0));

    float deviceSizeFactor = 1. - clamp((max(sceneResolution.x, sceneResolution.y) / 1000.), 0., 1.);

    vec2 bloomUv = map(vUv, vec2(0.), vec2(1.), uBloomViewport.xy, uBloomViewport.zw);

    vec4 bloomColor = texture(uBloom, bloomUv);

    vec4 color = sceneColor;

    bloomColor.rgb = bloomColor.rgb * uBloomAmount;

    color.rgb += bloomColor.rgb * uBloomAmount * .04;

    color = vec4((NeutralToneMapping(color.rgb)), 1.);

    color.rgb = dithering(color.rgb);

    outColor = color;
}
