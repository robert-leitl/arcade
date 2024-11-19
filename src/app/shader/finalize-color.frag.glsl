uniform sampler2D uScene;

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

void main() {
    vec4 sceneColor = texture(uScene, vUv);

    vec4 color = sceneColor;

    outColor = vec4((NeutralToneMapping(color.rgb)), 1.);

    outColor = fromLinear(outColor);
}
