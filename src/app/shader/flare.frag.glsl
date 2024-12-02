uniform vec2 uAspect;
uniform sampler2D uFlareTexture;

in vec2 vUv;

layout(location = 0) out vec4 outColor;

void main(){
    float scale = 2.5;

    vec2 toCenter=(fract(vUv+0.5)-0.5) * uAspect * scale;
    vec2 rotToCenter=mat2(0.7071067811865476,-0.7071067811865476,0.7071067811865476,0.7071067811865476)*toCenter;
    float res=  exp(-length(toCenter)*1.0)*.15+
                exp(-length(toCenter)*7.5)*.75+
                exp(-length(toCenter)*25.0)*2.+
                exp(-length(toCenter*vec2(1.0,10.0))*30.0)*500.+
                exp(-length(toCenter*vec2(1.0,20.0))*60.0)*600.+
                exp(-length(toCenter*vec2(10.0,1.0))*30.0)*600.+
                exp(-length(toCenter*vec2(20.0,1.0))*60.0)*700.+
                exp(-length(rotToCenter*vec2(1.0,8.0))*37.5)*352.+
                exp(-length(rotToCenter*vec2(1.0,20.0))*75.0)*700.+
                exp(-length(rotToCenter*vec2(20.0,1.0))*75.0)*700.;
    outColor = vec4(res, res, 0., 0.);
    return;

    vec2 st = fract(vUv + .5) * 2. - 1.;
    st *= uAspect * scale;
    st = st * .5 + .5;
    vec2 texUv = st;
    vec4 flareTex = texture(uFlareTexture, texUv);
    outColor = vec4(flareTex.r, flareTex.r, 0., 0.) * 10.;
}