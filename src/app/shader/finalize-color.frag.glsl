uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform vec4 uBloomViewport;

layout(location = 0) out vec4 outColor;

in vec2 vUv;

uniform float toneMappingExposure;

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

vec4 fromLinear(vec4 linearRGB)
{
    bvec3 cutoff = lessThan(linearRGB.rgb, vec3(0.0031308));
    vec3 higher = vec3(1.055)*pow(linearRGB.rgb, vec3(1.0/2.4)) - vec3(0.055);
    vec3 lower = linearRGB.rgb * vec3(12.92);

    return vec4(mix(higher, lower, cutoff), linearRGB.a);
}

vec2 map(vec2 value, vec2 inMin, vec2 inMax, vec2 outMin, vec2 outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

void main() {
    vec4 sceneColor = texture(uScene, vUv);

    vec2 bloomUv = map(vUv, vec2(0.), vec2(1.), uBloomViewport.xy, uBloomViewport.zw);

    vec4 bloomColor = texture(uBloom, bloomUv);

//    outColor = vec4(texture(uBloom, vUv).rgb * .1, 1.);
//    return;

    vec4 color = sceneColor;

//    vec4 fft = texture(uBloom, vUv); //fract(vUv + .5));
//    outColor = vec4(abs(fft.x) * 100.,0., abs(fft.z) * 100., 1.);
//    outColor = vec4(fft.rgb * .1, 1.);
//    return;


    bloomColor.rgb = bloomColor.rgb * uBloomAmount;

    color.rgb += bloomColor.rgb * uBloomAmount * .005;

    color = vec4((NeutralToneMapping(color.rgb)), 1.);

    color = fromLinear(color);

    outColor = color;
}
