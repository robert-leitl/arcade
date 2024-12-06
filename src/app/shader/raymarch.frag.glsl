uniform vec3 uCamPos;
uniform mat4 uCamToWorldMat;
uniform mat4 uCamInvProjMat;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uBlueNoiseTexture;
uniform int uRenderStage;
uniform sampler2D uEnvMapTexture;
uniform sampler2D uPaint;
uniform mat4 projectionMatrix;

in vec2 vUv;

layout(location = 0) out vec4 outColor;

#include <common>
#define ENVMAP_TYPE_CUBE_UV
#include <cube_uv_reflection_fragment>

float eps = 0.0001;
float maxDis = 50.;
int maxSteps = 50;
vec3 L = vec3(0., 2., 0.);
vec3 lightColor = vec3(1.);
float diffIntensity = 0.5;
float specIntensity = .1;
float ambientIntensity = 0.045;
float shininess = 10.;

//	Simplex 3D Noise
//	by Ian McEwan, Stefan Gustavson (https://github.com/stegu/webgl-noise)
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //  x0 = x0 - 0. + 0.0 * C
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
    dot(p2,x2), dot(p3,x3) ) );
}

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

vec3 hash( vec3 p )      // this hash is not production ready, please
{                        // replace this by something better
    p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
    dot(p,vec3(269.5,183.3,246.1)),
    dot(p,vec3(113.5,271.9,124.6)));

    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

// return value noise (in x) and its derivatives (in yzw)
vec4 noised( in vec3 x )
{
    // grid
    vec3 i = floor(x);
    vec3 f = fract(x);

    // cubic interpolant
    vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);
    vec3 du = 30.0*f*f*(f*(f-2.0)+1.0);

    // gradients
    vec3 ga = hash( i+vec3(0.0,0.0,0.0) );
    vec3 gb = hash( i+vec3(1.0,0.0,0.0) );
    vec3 gc = hash( i+vec3(0.0,1.0,0.0) );
    vec3 gd = hash( i+vec3(1.0,1.0,0.0) );
    vec3 ge = hash( i+vec3(0.0,0.0,1.0) );
    vec3 gf = hash( i+vec3(1.0,0.0,1.0) );
    vec3 gg = hash( i+vec3(0.0,1.0,1.0) );
    vec3 gh = hash( i+vec3(1.0,1.0,1.0) );

    // projections
    float va = dot( ga, f-vec3(0.0,0.0,0.0) );
    float vb = dot( gb, f-vec3(1.0,0.0,0.0) );
    float vc = dot( gc, f-vec3(0.0,1.0,0.0) );
    float vd = dot( gd, f-vec3(1.0,1.0,0.0) );
    float ve = dot( ge, f-vec3(0.0,0.0,1.0) );
    float vf = dot( gf, f-vec3(1.0,0.0,1.0) );
    float vg = dot( gg, f-vec3(0.0,1.0,1.0) );
    float vh = dot( gh, f-vec3(1.0,1.0,1.0) );

    // interpolations
    return vec4( va + u.x*(vb-va) + u.y*(vc-va) + u.z*(ve-va) + u.x*u.y*(va-vb-vc+vd) + u.y*u.z*(va-vc-ve+vg) + u.z*u.x*(va-vb-ve+vf) + (-va+vb+vc-vd+ve-vf-vg+vh)*u.x*u.y*u.z,    // value
    ga + u.x*(gb-ga) + u.y*(gc-ga) + u.z*(ge-ga) + u.x*u.y*(ga-gb-gc+gd) + u.y*u.z*(ga-gc-ge+gg) + u.z*u.x*(ga-gb-ge+gf) + (-ga+gb+gc-gd+ge-gf-gg+gh)*u.x*u.y*u.z +   // derivatives
    du * (vec3(vb,vc,ve) - va + u.yzx*vec3(va-vb-vc+vd,va-vc-ve+vg,va-vb-ve+vf) + u.zxy*vec3(va-vb-ve+vf,va-vb-vc+vd,va-vc-ve+vg) + u.yzx*u.zxy*(-va+vb+vc-vd+ve-vf-vg+vh) ));
}

float smin(float a, float b, float k) { // smooth min function
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

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

//float smin( float a, float b, float k )
//{
//    k *= 4.0;
//    float h = max( k-abs(a-b), 0.0 )/k;
//    return min(a,b) - h*h*k*(1.0/4.0);
//}

float sdPlane( vec3 p, vec3 n, float h )
{
    // n must be normalized
    return dot(p,n) + h;
}

float smax( float a, float b, float k )
{
    k *= 1.4;
    float h = max(k-abs(a-b),0.0);
    return max(a, b) + h*h*h/(6.0*k*k);
}

float opSmoothSubtraction( float d1, float d2, float k )
{
    float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );
    return mix( d2, -d1, h ) + k*h*(1.0-h);
}

float scene(vec3 p) {
    vec4 n = noised(p * vec3(13., 13., 1.));

    float dp = sdPlane(p, vec3(0., 0., 1.), 4.);

    vec3 co = (viewMatrix * vec4(p, 1.)).xyz;
    vec3 cp = (projectionMatrix * vec4(co, 0.)).xyz;
    cp *= 0.15;

    vec4 paint = texture(uPaint, cp.xy * .5 + .5);
    float maxDepth = 2. * paint.w;
    //vec2 p2d = vec2(1. - sin(paint.z * 9.), (co.z + length(uCamPos) + maxDepth * .5));
    vec2 p2d = vec2(1. - paint.z, (co.z + length(uCamPos) + maxDepth * .5));
    //float sc = sdCircle(p2d.xy, .5);
    float sc = sdBox(p2d.xy, vec2(0.65 * paint.w, maxDepth)) - .1;
    //sc += n.x * .7 * paint.r;

    // distance to sphere 1
    p.xy -= paint.xy * .7;
    float sd = distance(p, vec3(0., 0., 0)) - 1.5;
    //sd += n.x * 0.1;

    return opSmoothSubtraction(sc, sd, 1.);

    float td = sdTorus(p, vec2(1., .4));
    td += n.x * 0.1;

    //return td;

    float bd = sdRoundBox(p, vec3(1.), 0.2);
    bd += n.x * 0.1;

    //return bd;
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


vec3 findBackdropIntersection(vec3 ro, vec3 rd)
{
    float d = 0.; // total distance travelled
    float cd; // current scene distance
    vec3 p; // current position of ray

    for (int i = 0; i < maxSteps; ++i) {
        p = ro + d * rd;

        cd = sdPlane(p, vec3(0., 0., 1.), 5.);

        // if we have hit anything or our distance is too big, break loop
        if (cd < eps || d >= maxDis) break;

        // otherwise, add new scene distance to total distance
        d += cd ;
    }

    return ro + rd * d;
}

float getSurfaceExitIntersectionDist(
    vec3 ro,
    vec3 rd
) {
    // raymarch constants
    float stepSize = 0.1;
    float stepMult = 1.4;
    int steps = 8;

    vec4 blueNoise = texture(uBlueNoiseTexture, gl_FragCoord.xy / 1024.);
    float offset = 0.; //fract(blueNoise.r) * 2. - 1.;

    vec3 p = ro + rd * offset * .75;
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


vec3 normal(vec3 p) // from https://iquilezles.org/articles/normalsSDF/
{
    vec3 n = vec3(0, 0, 0);
    vec3 e;
    for(int i = 0; i < 4; i++) {
        e = 0.5773 * (2.0 * vec3((((i + 3) >> 1) & 1), ((i >> 1) & 1), (i & 1)) - 1.0);
        n += e * scene(p + e * eps);
    }
    return normalize(n);
}

vec3 calcNormal( in vec3 p ) // for function f(p)
{
    float h = 0.05; // replace by an appropriate value
    vec2 k = vec2(1.,-1.);
    return normalize(   k.xyy * scene( p + k.xyy*h ) +
                        k.yyx * scene( p + k.yyx*h ) +
                        k.yxy * scene( p + k.yxy*h ) +
                        k.xxx * scene( p + k.xxx*h ) );
}

//vec3 calcNormal( in vec3 pos )
//{
//    vec2 e = vec2(1.0,-1.0)*0.5773;
//    const float eps = 0.01;
//    return normalize( e.xyy*scene( pos + e.xyy*eps ) +
//                        e.yyx*scene( pos + e.yyx*eps ) +
//                        e.yxy*scene( pos + e.yxy*eps ) +
//                        e.xxx*scene( pos + e.xxx*eps ) );
//}


vec4 fbmD( in vec3 x, in float H )
{
    float G = exp2(-H);
    float f = 1.0;
    float a = 1.0;
    vec4 t = vec4(0.0);
    for( int i=0; i<5; i++ )
    {
        t += a * noised( f * x );
        f *= 2.0;
        a *= G;
    }
    return t;
}

float HenyeyGreenstein(float g, float costh) {
    float gg = g * g;
    return (1.0 / (4.0 * PI))  * ((1.0 - gg) / pow(1.0 + gg - 2.0 * g * costh, 1.5));
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


vec3 grid(vec2 uv) {
    vec2 st = fract(uv * 10.);
    float softness = 0.02;
    float lineThickness = 0.01;
    vec2 d1 =
        smoothstep(
            vec2(0.5 - (lineThickness * .5 + softness)),
            vec2(0.5 - (lineThickness * .5)),
            st) *
        smoothstep(
            vec2(0.5 - (lineThickness * .5 + softness)),
            vec2(0.5 - (lineThickness * .5)),
            1. - st);
    return vec3(max(d1.x, d1.y));
}


void main(){
    vec3 color = vec3(0.);

    float iorAir = 1.;
    float iorGlass = 1.45;

    vec3 backgroundColor = vec3(0.9, 0.93, 1.) * .01;

    vec4 paint = texture(uPaint, vUv);
    outColor = vec4(vec3(paint.z), 1.);
    //outColor = vec4(paint.xy * .5 + .5, 0., 1.);
    //return;

    // Get UV from vertex shader
    vec2 uv = vUv.xy;

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
        color = grid(vUv);
    } else {
        vec3 N = normal;

        // Calculate Diffuse model
        float NdotL = clamp(dot(N, L), 0., 1.);
        float diff = max(NdotL, 0.0) * .2;

        vec4 refraction = getRefraction(rd, N, iorAir, iorGlass);
        vec2 fresnel = getDialectricFresenlFactors(rd, N, refraction.xyz, iorAir, iorGlass, 1.);
        vec3 reflectedColor = getEnviornmentReflection(rd, N).rgb * fresnel.x;
        vec3 transmittance = vec3(1.) * fresnel.y;

        // ray march the volume
        rd = refraction.xyz;
        ro = surfaceEntryPoint - N * eps; // offset the ray origin to be inside the object
        float surfaceExitDist = getSurfaceExitIntersectionDist(ro, rd);
        vec3 surfaceExitPoint = ro + surfaceExitDist * rd;

        // Get normal of hit point
        vec3 exitNormal = calcNormal(surfaceExitPoint);

        refraction = getRefraction(rd, -exitNormal, iorGlass, iorAir);
        fresnel = getDialectricFresenlFactors(rd, exitNormal, refraction.xyz, iorGlass, iorAir, 1.);
        transmittance *= clamp(exp(-surfaceExitDist * .3), 0., 1.);
        reflectedColor += getEnviornmentReflection(rd, -exitNormal).rgb * .2 * fresnel.x * transmittance;
        transmittance *= fresnel.y;

        vec2 refractionOffset = refraction.xy * .8;
        vec3 transmittedColor = grid(vUv + refractionOffset) * transmittance;

        color = reflectedColor + transmittedColor + diff * vec3(1., 0., 1.);
    }

    outColor = vec4(color, 1.);
}