uniform sampler2D uFFT;
uniform sampler2D uKernel;

varying vec2 vUv;

layout(location = 0) out vec4 outColor;

vec2 multiplyComplex (vec2 a, vec2 b) {
    return vec2(a[0] * b[0] - a[1] * b[1], a[1] * b[0] + a[0] * b[1]);
}

void main(){
    vec4 a = texture(uFFT, vUv);
    vec4 b = texture(uKernel, vUv);

    outColor = vec4(a.xy * b.xy - a.zw * b.zw, a.xy * b.zw + a.zw * b.xy);

    // { x,     y,      z,      w    }
    // { Real1, Real2,  Img1,   Img2 }
    vec2 r1 = multiplyComplex(a.xz, b.xz);
    vec2 r2 = multiplyComplex(a.yw, b.yw);
    outColor = vec4(a.xy * b.xy - a.zw * b.zw, a.xy * b.zw + a.zw * b.xy);
    outColor = vec4(r1.x, r2.x, r1.y, r2.y);
}