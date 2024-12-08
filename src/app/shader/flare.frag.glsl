uniform vec2 uAspect;
uniform sampler2D uFlareTexture;

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
    float scale = 1.5;

    vec2 st = (fract(vUv+0.5)-0.5) * uAspect * scale;

    float value =
        exp(-length(st * 7.5)) * 10. +
        drawflare(st * 4., 6.) * 600. +
        drawflare(st * 4., 3.) * 300.;
    outColor = vec4(value, value, 0., 0.) * .8;
    return;

    vec2 rotToCenter=mat2(0.7071067811865476,-0.7071067811865476,0.7071067811865476,0.7071067811865476)*st;
    float res=  exp(-length(st)*1.0)*.15+
                exp(-length(st)*7.5)*.75+
                exp(-length(st)*25.0)*2.+
                exp(-length(st*vec2(1.0,10.0))*30.0)*500.+
                exp(-length(st*vec2(1.0,20.0))*60.0)*600.+
                exp(-length(st*vec2(10.0,1.0))*30.0)*600.+
                exp(-length(st*vec2(20.0,1.0))*60.0)*700.+
                exp(-length(rotToCenter*vec2(1.0,8.0))*37.5)*352.+
                exp(-length(rotToCenter*vec2(1.0,20.0))*75.0)*700.+
                exp(-length(rotToCenter*vec2(20.0,1.0))*75.0)*700.;
    outColor = vec4(res, res, 0., 0.);
    return;

//    vec2 st = fract(vUv + .5) * 2. - 1.;
//    st *= uAspect * scale;
//    st = st * .5 + .5;
//    vec2 texUv = st;
//    vec4 flareTex = texture(uFlareTexture, texUv);
//    outColor = vec4(flareTex.r, flareTex.r, 0., 0.) * 10.;
}