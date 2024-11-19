uniform sampler2D uFFT;
uniform sampler2D uKernel;

varying vec2 vUv;

layout(location = 0) out vec4 outColor;

void main(){
    vec4 a = texture(uFFT, vUv);
    vec4 b = texture(uKernel, vUv);
    outColor = vec4(a.xy * b.xy - a.zw * b.zw, a.xy * b.zw + a.zw * b.xy);
}