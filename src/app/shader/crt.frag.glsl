uniform sampler2D uColor;
uniform vec2 uResolution;
uniform float uTime;
uniform int uFrame;

layout(location = 0) out vec4 outColor;

in vec2 vUv;

#define DITHERING 1

#include <common>
#include <dithering_pars_fragment>

vec4 fromLinear(vec4 linearRGB)
{
    bvec3 cutoff = lessThan(linearRGB.rgb, vec3(0.0031308));
    vec3 higher = vec3(1.055)*pow(linearRGB.rgb, vec3(1.0/2.4)) - vec3(0.055);
    vec3 lower = linearRGB.rgb * vec3(12.92);

    return vec4(mix(higher, lower, cutoff), linearRGB.a);
}


// https://www.shadertoy.com/view/3tVBWR
// DECODE NTSC AND CRT EFFECTS

#define BRIGHTNESS 1.1
#define SATURATION 0.6
#define BLUR 1.
#define BLURSIZE 0.2
#define CHROMABLUR 0.7
#define CHROMASIZE 7.0
#define SUBCARRIER .1
#define CROSSTALK 0.1
#define SCANFLICKER 0.33
#define INTERFERENCE1 0.001
#define INTERFERENCE2 0.001

const float fishEyeX = 0.1;
const float fishEyeY = 0.24;
const float vignetteRounding = 160.0;
const float vignetteSmoothness = 0.7;

// ------------

#define CHROMA_MOD_FREQ (0.4 * PI)

#define IFRINGE (1.0 - FRINGE)

// Fish-eye effect
vec2 fisheye(vec2 uv) {
    uv *= vec2(1.0+(uv.y*uv.y)*fishEyeX,1.0+(uv.x*uv.x)*fishEyeY);
    return uv * 1.02;
}

float vignette(vec2 uv) {
    uv *= 1.99;
    float amount = 1.0 - sqrt(pow(abs(uv.x), vignetteRounding) + pow(abs(uv.y), vignetteRounding));
    float vhard = smoothstep(0., vignetteSmoothness, amount);
    return(vhard);
}


const mat3 yiq2rgb_mat = mat3(
    1.0, 1.0, 1.0,
    0.956, -0.2720, -1.1060,
    0.6210, -0.6474, 1.7046
);

vec3 yiq2rgb(vec3 yiq) {
    return yiq2rgb_mat * yiq;
}

#define KERNEL 25
const float luma_filter[KERNEL] = float[KERNEL](0.0105,0.0134,0.0057,-0.0242,-0.0824,-0.1562,-0.2078,-0.185,-0.0546,0.1626,0.3852,0.5095,0.5163,0.4678,0.2844,0.0515,-0.1308,-0.2082,-0.1891,-0.1206,-0.0511,-0.0065,0.0114,0.0127,0.008);
const float chroma_filter[KERNEL] = float[KERNEL](0.001,0.001,0.0001,0.0002,-0.0003,0.0062,0.012,-0.0079,0.0978,0.1059,-0.0394,0.2732,0.2941,0.1529,-0.021,0.1347,0.0415,-0.0032,0.0115,0.002,-0.0001,0.0002,0.001,0.001,0.001);

float hash12(vec2 p)
{
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float random(vec2 p, float t) {
    return hash12((p * 0.152 + t * 1500. + 50.0));
}

vec3 get(vec2 uv, float off, float d, float yscale) {
    float offd = off * d;
    return texture(uColor, uv + vec2(offd, yscale)).xyz;
}

float peak(float x, float xpos, float scale) {
    return clamp((1.0 - x) * scale * log(1.0 / abs(x - xpos)), 0.0, 1.0);
}

vec4 crt(vec4 color, vec2 uv, vec2 inputResolution) {
    float scany = round(uv.y * inputResolution.y);

    uv -= vec2(0.5);
    uv = fisheye(uv);
    float vign = vignette(uv);
    uv += vec2(0.5);
    float mframe = float(uFrame % 2);
    //uv.y += mframe * 1.0 / inputResolution.y * SCANFLICKER;

    // interference

    float r = random(vec2(0.0, scany), fract(uTime * 0.00001));
    if (r > 0.95) {r *= 3.0;}
    float ifx1 = INTERFERENCE1 * 150.0 / inputResolution.x * r;
    float ifx2 = INTERFERENCE2 * (r * peak(uv.y, 0.2, 0.2));
    uv.x += ifx1 + -ifx2;

    // luma fringing and chroma blur

    float d = (1.0 / uResolution.x) * (BLURSIZE + ifx2 * 100.0);
    float dy = (1.0 / uResolution.y) * BLURSIZE * 2.;
    vec3 lsignal = vec3(0.0);
    vec3 csignal = vec3(0.0);
    for (int i = 0; i < KERNEL; i++) {
        float offset = float(i) - 12.0;
        vec3 suml = get(uv, offset, d, dy);
        lsignal += suml * vec3(luma_filter[i], 0.0, 0.0);
        vec3 sumc = get(uv, offset, d * CHROMASIZE, dy * CHROMASIZE);
        csignal += sumc * vec3(0.0, chroma_filter[i], chroma_filter[i]);
    }
    vec3 sat = texture(uColor, uv).xyz;
    vec3 lumat = sat * vec3(1.0, 0.0, 0.0);
    vec3 chroat = sat * vec3(0.0, 1.0, 1.0);
    vec3 signal = lumat * (1.0 - BLUR) + BLUR * lsignal + chroat * (1.0 - CHROMABLUR) + CHROMABLUR * csignal;

    float scanl = 0.5 + 0.5 * abs(sin(PI * uv.y * inputResolution.y));

    // decoding chroma saturation and phase

    float lchroma = signal.y * SATURATION;
    float phase = signal.z * 6.28318530718;

//    signal.x *= BRIGHTNESS;
//    signal.y = lchroma * sin(phase);
//    signal.z = lchroma * cos(phase);

    // color subcarrier signal, crosstalk

    float chroma_phase = uTime * 60.0 * PI * 0.6667;
    float mod_phase = chroma_phase + (uv.x + uv.y * 0.1) * CHROMA_MOD_FREQ * inputResolution.x * 2.0;
    float scarrier = SUBCARRIER * lchroma;
    float i_mod = cos(mod_phase);
    float q_mod = sin(mod_phase);

    signal.x *= CROSSTALK * scarrier * q_mod + 1.0 - ifx2 * 30.0;
    signal.y *= scarrier * i_mod + 1.0;
    signal.z *= scarrier * q_mod + 1.0;

    vec3 out_color = signal;
    vec3 rgb = vign * scanl * (out_color);
    return vec4(rgb, 1.0);
}

void main() {
    vec4 finalColor = texture(uColor, vUv);
    vec2 colorResolution = vec2(textureSize(uColor, 0));

    vec4 color = finalColor;

    color = crt(color, vUv, colorResolution);

    color = fromLinear(color);

    color.rgb = dithering(color.rgb);

    outColor = color;
}
