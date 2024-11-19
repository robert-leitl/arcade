uniform sampler2D uSrc;
uniform vec2 uTexelSize;
uniform float uSubtransformSize;
uniform bool uHorizontal;
uniform bool uForward;
uniform float uNormalization;

const float TWOPI = 6.283185307179586;

layout(location = 0) out vec4 outColor;

void main() {
    vec2 evenPos, oddPos, twiddle, outputA, outputB;
    vec4 even, odd;
    float index, evenIndex, twiddleArgument;

    index = (uHorizontal ? gl_FragCoord.x : gl_FragCoord.y) - 0.5;

    evenIndex = floor(index / uSubtransformSize) * (uSubtransformSize * 0.5) + mod(index, uSubtransformSize * 0.5) + 0.5;

    if (uHorizontal) {
        evenPos = vec2(evenIndex, gl_FragCoord.y);
        oddPos = vec2(evenIndex, gl_FragCoord.y);
    } else {
        evenPos = vec2(gl_FragCoord.x, evenIndex);
        oddPos = vec2(gl_FragCoord.x, evenIndex);
    }

    evenPos *= uTexelSize;
    oddPos *= uTexelSize;

    if (uHorizontal) {
        oddPos.x += 0.5;
    } else {
        oddPos.y += 0.5;
    }

    even = texture2D(uSrc, evenPos);
    odd = texture2D(uSrc, oddPos);

    twiddleArgument = (uForward ? TWOPI : -TWOPI) * (index / uSubtransformSize);
    twiddle = vec2(cos(twiddleArgument), sin(twiddleArgument));

    outColor = (even+vec4(twiddle.x*odd.xy-twiddle.y*odd.zw,twiddle.y*odd.xy+twiddle.x*odd.zw)) * uNormalization;
}