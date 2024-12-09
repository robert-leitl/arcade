uniform vec2 uAspect;
uniform sampler2D uFlareTexture;
uniform float uScale;

in vec2 vUv;

layout(location = 0) out vec4 outColor;


float saturate(float x)
{
    return clamp(x, 0.,1.);
}

//https://www.shadertoy.com/view/XtKfRV
float drawflare(vec2 p, float sharpness)
{
    float lingrad = length(p);
    float expgrad = 1. / exp(lingrad); //exponential radial gradient
    float blades = length(p * sin(3.0 * atan(p.x, p.y))); //draw 6 blades
    float comp = pow(1.-saturate(blades), sharpness); // sharpen effect
    comp += saturate(expgrad-0.9) * 3.;
    comp = pow(comp * expgrad, sharpness); // compose and sharpen effect
    return comp;
}

void main(){
    float scale = uScale;

    vec2 st = (fract(vUv+0.5)-0.5) * uAspect * scale;

    float value =
        exp(-length(st * 7.5)) * 10. +
        drawflare(st * 4., 6.) * 600. +
        drawflare(st * 4., 3.) * 300.;
    outColor = vec4(value, value, 0., 0.) * .8;
    return;

//    vec2 st = fract(vUv + .5) * 2. - 1.;
//    st *= uAspect * scale;
//    st = st * .5 + .5;
//    vec2 texUv = st;
//    vec4 flareTex = texture(uFlareTexture, texUv);
//    outColor = vec4(flareTex.r, flareTex.r, 0., 0.) * 10.;
}