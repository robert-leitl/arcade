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
    vec2 resolution = vec2(textureSize(uPrevPaint, 0));
    float deviceSizeFactor = 3. - clamp((max(resolution.x, resolution.y) / 800.), 0., 3.);

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
    float radiusScale = 1.5;
    float strength = length(uPointerInfo.velocity);
    float newRadius = strength * radiusScale;
    float prevRadius = length(uPointerInfo.previousVelocity) * radiusScale;

    // interpolate between previous and new radius over the segment length
    float radius = newRadius * (1. - sdf.y) + prevRadius * sdf.y;
    radius = clamp(radius, 0.0, 1.);

    // get a smooth paint from the distance to the segment
    float smoothness = .07 * deviceSizeFactor;
    float paint = 1. - smoothstep(radius, radius + smoothness, dist + smoothness * .5);

    // the velocity has more influence than the actual paint
    float velocityMaskRadius = radius * 4.;
    float velocityMaskSmoothness = .1;
    float velocityMask = 1. - smoothstep(velocityMaskRadius, velocityMaskRadius + velocityMaskSmoothness, dist + velocityMaskSmoothness * .2);
    // amplify the pointer velocity
    vec2 vel = uPointerInfo.velocity * 1000.;
    // mask the velocity
    vel *= velocityMask;
    // combine the new velocity with a bit of the current samples velocity
    vel = (prevPaint.xy + vel) * .5;

    // calculate the general flow field velocity for this sample (center force)
    vec2 flowVel = (st * 2. - 1.);
    flowVel = normalize(flowVel) * min(0.25, max(0., (length(flowVel))));

    // add a little bit of force from the current pointer position
    vec2 pointerOffsetVel = uPointerInfo.position - vUv;
    pointerOffsetVel = normalize(pointerOffsetVel) * (1. - smoothstep(0., 1., length(pointerOffsetVel)));
    pointerOffsetVel *= 0.1;
    pointerOffsetVel += flowVel * .5;

    // find the input value which was moved to this samples location
    float velOffsetStrength = .02;
    vec2 velOffset = (vUv - (vel + pointerOffsetVel) * velOffsetStrength);
    vec4 offsetInputValue = texture(uPrevPaint, velOffset);



    // move velocity
    vel = (offsetInputValue.xy * 1.5 + vel) / 2.;
    // dissipate the velocity over time
    vel *= 0.95;

    // the strength according to the velocity
    paint = min(1., paint * strength * 200.);

    // combine with the previous paint
    paint += offsetInputValue.z;
    paint = clamp(paint, 0., 1.);
    // dissipate the paint over time
    paint *= 0.97;


    float speed = (length(vel) * 2. + offsetInputValue.w) * .5;
    speed *= .98;


    data = vec4(vel, paint, speed);

    outData = data;
}
