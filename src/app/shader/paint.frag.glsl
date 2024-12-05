uniform sampler2D uPrevPaint;
uniform vec2 uAspect;

struct PointerInfo {
    bool isDown;
    vec2 position;
    vec2 previousPosition;
    vec2 velocity;
    vec2 previousVelocity;
};

uniform PointerInfo uPointerInfo;

layout(location = 0) out vec4 outData;

in vec2 vUv;

vec2 sdSegment( in vec2 p, in vec2 a, in vec2 b )
{
    vec2 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return vec2(length( pa - ba*h ), h);
}

void main() {
    vec2 st = (vUv * 2. - 1.) * uAspect;
    st = st * .5 + .5;
    vec4 prevPaint = texture(uPrevPaint, vUv);

    vec4 data = vec4(0.);

    // aspect correction
    vec2 pointerPos = ((uPointerInfo.position * 2. - 1.) * uAspect) * .5 + .5;
    vec2 prevPointerPos = ((uPointerInfo.previousPosition * 2. - 1.) * uAspect) * .5 + .5;

    vec2 sdf = sdSegment(st, pointerPos, prevPointerPos);
    float dist = max(0., sdf.x);

    // calculate the radius for the new and previous point
    float radiusScale = 1.;
    float strength = length(uPointerInfo.velocity);
    float newRadius = strength * radiusScale;
    float prevRadius = length(uPointerInfo.previousVelocity) * radiusScale;

    // interpolate between previous and new radius over the segment length
    float radius = newRadius * (1. - sdf.y) + prevRadius * sdf.y;
    radius = clamp(radius, 0.0, 1.);

    // get a smooth paint from the distance to the segment
    float smoothness = .1;
    float paint = 1. - smoothstep(radius, radius + smoothness, dist);

    // the velocity has more influence than the actual paint
    float velocityMaskRadius = radius * 4.;
    float velocityMaskSmoothness = .1;
    float velocityMask = 1. - smoothstep(velocityMaskRadius, velocityMaskRadius + velocityMaskSmoothness, dist + velocityMaskSmoothness * .2);
    // amplify the pointer velocity
    vec2 vel = uPointerInfo.velocity * 1000.;
    // mask the velocity
    vel *= velocityMask;
    // combine the new velocity with a bit of the current samples velocity
    vel = (prevPaint.yz * .5 + vel * .5);
    // dissipate the velocity over time
    vel *= 0.999;

    // the strength according to the velocity
    paint = min(1., paint * strength * 200.);

    // combine with the previous paint
    paint += prevPaint.x;
    paint = clamp(paint, 0., 1.);
    // dissipate the paint over time
    paint *= 0.955;

    data.r = paint;
    data.yz = vel;
    data.w = (length(vel) + prevPaint.w) * .5;
    data.w *= .95;

    data.a = 1.;

    outData = data;
}
