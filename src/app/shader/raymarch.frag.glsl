uniform vec3 uCamPos;
uniform mat4 uCamToWorldMat;
uniform mat4 uCamInvProjMat;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uEnvMapTexture;
uniform sampler2D uPaint;
uniform mat4 projectionMatrix;
uniform vec4 uAnimationParams;

in vec2 vUv;

layout(location = 0) out vec4 outColor;

#include <common>
#define ENVMAP_TYPE_CUBE_UV
#include <cube_uv_reflection_fragment>

float eps = 0.0001;
float maxDis = 30.;
int maxSteps = 50;

float sdTorus( vec3 p, vec2 t )
{
    vec2 q = vec2(length(p.xz)-t.x,p.y);
    return length(q)-t.y;
}

float sdRoundBox( vec3 p, vec3 b, float r )
{
    vec3 q = abs(p) - b + r;
    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r;
}

float sdCircle(vec2 p, float r)
{
    return length(p) - r;
}

float sdBox( vec2 p, vec2 b )
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

float sdPlane( vec3 p, vec3 n, float h )
{
    // n must be normalized
    return dot(p,n) + h;
}

float sdOctahedron( vec3 p, float s )
{
    p = abs(p);
    float m = p.x+p.y+p.z-s;
    vec3 q;
    if( 3.0*p.x < m ) q = p.xyz;
    else if( 3.0*p.y < m ) q = p.yzx;
    else if( 3.0*p.z < m ) q = p.zxy;
    else return m*0.57735027;

    float k = clamp(0.5*(q.z-q.y+s),0.0,s);
    return length(vec3(q.x,q.y-s+k,q.z-k));
}

float opSmoothSubtraction( float d1, float d2, float k )
{
    float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );
    return mix( d2, -d1, h ) + k*h*(1.0-h);
}

float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

float noise(vec3 p){
    vec3 a = floor(p);
    vec3 d = p - a;
    d = d * d * (3.0 - 2.0 * d);

    vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
    vec4 k1 = perm(b.xyxy);
    vec4 k2 = perm(k1.xyxy + b.zzww);

    vec4 c = k2 + a.zzzz;
    vec4 k3 = perm(c);
    vec4 k4 = perm(c + 1.0);

    vec4 o1 = fract(k3 * (1.0 / 41.0));
    vec4 o2 = fract(k4 * (1.0 / 41.0));

    vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
    vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

    return o4.y * d.y + o4.x * (1.0 - d.y);
}

float rippleDisplacement(
    in vec3 pos,
    in float time
) {
    vec3 p = vec3(pos);

    float freq = (.5 + uAnimationParams.y);
    float noise1 = noise(p * freq + time * 0.001);
    float noise2 = noise(p * freq - time * 0.002);
    float noise = sin(noise1 * 40. + cos(noise2 * 30.)) ;
    float displacement = (noise + 2.) * -0.018;

    return displacement;
}

mat3 rotation3dY(float angle) {
    float s = sin(angle);
    float c = cos(angle);

    return mat3(
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
    );
}

vec3 rotateY(vec3 v, float angle) {
    return rotation3dY(angle) * v;
}

float scene(vec3 p) {
    // get the view position of the world point
    vec3 viewPos = (viewMatrix * vec4(p, 1.)).xyz;

    // get the ndc position of the view point
    vec3 ndcPos = (projectionMatrix * vec4(viewPos, 0.)).xyz;

    // scale the ndc position for an approximated fit of the paint texture to the viewport
    ndcPos *= 1. / (length(uCamPos) + 1.5);

    // get the paint texture for the ndc position
    vec4 paint = texture(uPaint, ndcPos.xy * .5 + .5);
    float maxDepth = 2. * paint.w;

    // move the paint 2d distance to the origin
    vec2 p2d = vec2(1. - paint.z, (viewPos.z + length(uCamPos) + maxDepth * .5));

    // use a 2d box sdf to get a 3d sdf for the paint strokes
    float thickness = 0.65;
    float paintDist = sdBox(p2d.xy, vec2(thickness * paint.w, maxDepth)) - (thickness * .2);

    // distort sphere by paint velociyt
    p.xy -= paint.xy * .8;

    float rNoise = rippleDisplacement(p, uTime * .05);

    // sphere sdf
    float radius = 1.5 + paint.w * .1;
    float sphereDist = distance(p, vec3(0., 0., 0)) - radius;

    // octahedron sdf
    p = rotateY(p, uTime * 0.00015 - paint.x * 4.);
    float octaDist = sdOctahedron(p, 1.4) - .4;
    octaDist += rNoise * (uAnimationParams.y * .8 + .1);

    float rBoxDist = sdRoundBox(p, vec3(1.), .2);

    return opSmoothSubtraction(paintDist, octaDist, 1.);

}

float findSurfaceIntersectionDist(vec3 ro, vec3 rd)
{
    float d = 0.; // total distance travelled
    float cd; // current scene distance
    vec3 p; // current position of ray

    for (int i = 0; i < maxSteps; ++i) { // main loop
        p = ro + d * rd; // calculate new position

        cd = scene(p); // get scene distance

        // if we have hit anything or our distance is too big, break loop
        if (cd < eps || d >= maxDis) break;

        // otherwise, add new scene distance to total distance
        d += cd * .75;
    }

    return d; // finally, return scene distance
}

float getSurfaceExitIntersectionDist(
    vec3 ro,
    vec3 rd
) {
    // raymarch constants
    float stepSize = 0.1;
    float stepMult = 1.4;
    int steps = 8;

    vec3 p = ro;
    float currStepSize = stepSize;
    float exitDist = 0.;

    for(int i = 0; i < steps; i++) {
        exitDist += currStepSize;
        p += currStepSize * rd;

        float cd = scene(p);

        if(cd >= 0.) {
            exitDist = exitDist - findSurfaceIntersectionDist(p + rd * stepSize, -rd);
            break;
        }

        currStepSize *= stepMult;
    }

    return exitDist;
}

vec3 calcNormal( in vec3 p )
{
    float h = 0.05;
    vec2 k = vec2(1.,-1.);
    return normalize(   k.xyy * scene( p + k.xyy*h ) +
                        k.yyx * scene( p + k.yyx*h ) +
                        k.yxy * scene( p + k.yxy*h ) +
                        k.xxx * scene( p + k.xxx*h ) );
}

vec3 getTransmittance(float dist, vec3 sigma) {
    vec3 tau = sigma * dist;
    vec3 tr = exp(-tau);

    return tr;
}

vec4 refraction(vec3 incident, vec3 normal, float ni_nt) {
    float ni_nt_sqr = ni_nt * ni_nt;
    float IdotN = dot( -incident, normal );
    float cosSqr = 1.0 - ni_nt_sqr*(1.0 - IdotN*IdotN);
    vec4 refraction = ( cosSqr <= 0.0 ?
        vec4( normalize(reflect( incident, normal )), -1.0 ) :
        vec4(refract(incident, normal, ni_nt), 1.)
    );
    return refraction;
}

vec4 getRefraction(vec3 viewDir, vec3 normal, float n1, float n2) {
    return refraction(viewDir, normal, n1 / n2);
}

vec4 getEnviornmentReflection(vec3 viewDir, vec3 normal) {
    vec3 R = normalize( reflect( viewDir, normal ) );
    return textureCubeUV(uEnvMapTexture, R, 0.);
}

vec2 getDialectricFresenlFactors(vec3 viewDir, vec3 normal, vec3 transmissionDir, float n1, float n2, float specularF90) {
    float dotVN;

    // check for internal reflection
    if (n1 > n2) {
        dotVN = dot(-transmissionDir, -normal);
    } else {
        dotVN = dot(-viewDir, normal);
    }

    float f0 = pow2((n2 - n1) / (n2 + n1));
    float f90 = specularF90;
    float fresnel = F_Schlick(f0, f90, max(0., dotVN));

    // art direction
    fresnel = max(0.001, fresnel * .8);

    return vec2(fresnel, (1. - fresnel) * pow2(n2 / n1));
}

float sdBox2d( vec2 p, vec2 b )
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

float circle(in vec2 _st, in float _radius){
    vec2 dist = _st;
    float softness = 0.8;
    return 1. - smoothstep(
                    _radius-(_radius*softness),
                    _radius+(_radius*softness),
                    dot(dist,dist)*1.0
    );
}

vec3 grid(vec2 uv, vec2 aspect, float softness) {
    vec4 paint = texture(uPaint, uv);

    uv -= paint.xy * .025;
    vec2 st = fract(uv * 8.) * 2. - 1.;
    float lineThickness = 0.03;
    float roundness = 0.05 + softness;

    float b = sdBox2d(st, vec2(1. - lineThickness - roundness)) - roundness;
    b = 1. - max(0., -b);
    b = smoothstep(1. - softness, 1., b);

    float centerDist = length(vUv * 2. - 1.);
    float glowMask = 1. - smoothstep(0.0, 1., centerDist * .8);
    glowMask = glowMask * .8 + .2;

    float shadowDist = length((vUv * 2. - 1. + vec2(0., .3)) * aspect);
    float shadow = smoothstep(0.2, .9, shadowDist);
    shadow = shadow * .9 + .1;

    vec3 gridColor = vec3(.7, 0.75, 1.7) * .8;
    gridColor = mix(vec3(0.008, 0.01, 0.02) * glowMask, gridColor * (paint.z * 16. + 1.) * glowMask, b) * shadow;

    vec2 dotUv = (vUv * 2. - 1.) * aspect;
    float dotMaskRadius = 4. * (1. - uAnimationParams.x);
    float dotMask = circle(dotUv, dotMaskRadius) - circle(dotUv, max(0., dotMaskRadius - 0.3));
    dotMask *= uAnimationParams.x;
    dotMask = uAnimationParams.x;
    float dotDist = sdBox2d(st, vec2(.05));
    dotDist = 1. - smoothstep(0., .05, dotDist);
    dotDist *= 80.;
    vec3 dotColor = vec3(1., 1., 1.9) * dotDist * dotMask;

    return max(dotColor, gridColor);
}

void main(){
    vec3 color = vec3(0.);
    float AA_size = 2.0;
    float count = 0.0;
    vec2 texelSize = 1. / uResolution;
    vec2 aspect = uResolution / max(uResolution.x, uResolution.y);
    float iorAir = 1.;
    vec3 L = vec3(2., 2., 0.);
    float iorGlass = 1.45;
    bool marchVolume = false;
    vec4 volumeEntryRefraction;
    vec3 volumeEntryPoint;

    for (float aaY = 0.0; aaY < AA_size; aaY++)
    {
        for (float aaX = 0.0; aaX < AA_size; aaX++)
        {
            vec2 uv = vUv + texelSize * vec2(aaX, aaY) / AA_size;
            vec4 paint = texture(uPaint, uv);

            // Get ray origin and direction from camera uniforms
            vec3 ro = uCamPos;
            vec3 rd = (uCamInvProjMat * vec4(uv * 2.-1., 0, 1)).xyz;
            rd = (uCamToWorldMat * vec4(rd, 0)).xyz;
            rd = normalize(rd);

            // Get the environment texture color
            vec4 envColor = texture(uEnvMapTexture, equirectUv(normalize(rd + vec3(0., 0., 0.8))));

            // Ray marching and find total distance travelled
            float surfaceEntryDist = findSurfaceIntersectionDist(ro, rd); // use normalized ray

            // Find the hit position
            vec3 surfaceEntryPoint = ro + surfaceEntryDist * rd;

            // Get normal of hit point
            vec3 normal = calcNormal(surfaceEntryPoint);

            if (surfaceEntryDist >= maxDis) { // if ray doesn't hit anything
                color += grid(uv, aspect, 0.02);
            } else {
                vec3 N = normal;

                // Calculate Diffuse model
                float NdotL = clamp(dot(N, L), 0., 1.);
                float diff = max(NdotL, 0.0);

                vec4 refraction = getRefraction(rd, N, iorAir, iorGlass);
                vec2 fresnel = getDialectricFresenlFactors(rd, N, refraction.xyz, iorAir, iorGlass, 1.);
                vec3 reflectedColor = getEnviornmentReflection(rd, N).rgb * fresnel.x * (diff * .3 + .7);

                marchVolume = true;
                volumeEntryRefraction = refraction;
                volumeEntryPoint = surfaceEntryPoint - N * eps; // offset the ray origin to be inside the object

                color += reflectedColor + diff * vec3(.8, 0.1, 1.) * .2;
            }

            count += 1.0;
        }
    }

    if (marchVolume) {
        // ray march the volume
        vec3 rd = volumeEntryRefraction.xyz;
        vec3 ro = volumeEntryPoint;
        float surfaceExitDist = getSurfaceExitIntersectionDist(ro, rd);
        vec3 surfaceExitPoint = ro + surfaceExitDist * rd;

        // Get normal of hit point
        vec3 exitNormal = calcNormal(surfaceExitPoint);

        vec4 refraction = getRefraction(rd, -exitNormal, iorGlass, iorAir);
        vec2 fresnel = getDialectricFresenlFactors(rd, exitNormal, refraction.xyz, iorGlass, iorAir, 1.);
        vec3 transmittance = vec3(1.) * clamp(exp(-surfaceExitDist * .3), 0., 1.);
        vec3 reflectedColor = getEnviornmentReflection(rd, -exitNormal).rgb * .2 * fresnel.x * transmittance;
        transmittance *= fresnel.y;

        vec2 refractionOffset = refraction.xy * .8;
        vec3 transmittedColor = grid(vUv + refractionOffset, aspect, 0.07) * transmittance * 4.;

        color += (reflectedColor + transmittedColor) * AA_size * AA_size;
    }

    color /= count;

    outColor = vec4(color, 1.);
}