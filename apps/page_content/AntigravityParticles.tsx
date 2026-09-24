import * as React from "react"
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/* ----------------------------------------------------------------------------
 * AntigravityParticles — Framer code component
 *
 * A dependency-free WebGL port of the hero particle field on antigravity.google:
 * a Poisson-disk scatter of tiny rounded "dashes" that point away from a ring
 * which chases the cursor (or wanders on its own), with simplex-noise drift,
 * ring-driven scale, and a 3-colour noise gradient.
 *
 * Differences from the original (deliberate):
 *  - No Three.js / GPGPU ping-pong. The original's feedback loop settles within
 *    ~1 frame, so it's evaluated in closed form inside the vertex shader.
 *    Result: no float render targets, no CDN import, ~1k particles instead of a
 *    65k-texel simulation for a viewport that only ever shows the centre of it.
 *  - Only the visible part of the field is generated (resolution-independent).
 *  - Ring smoothing is frame-rate independent.
 *  - Pauses off-screen, freezes in the Framer editor (toggle available), and
 *    honours prefers-reduced-motion.
 *
 * Simplex noise: Ian McEwan / Ashima Arts (MIT).
 * ------------------------------------------------------------------------- */

// ------------------------------------------------------------------ shaders --

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
            i.z+vec4(0.0,i1.z,i2.z,1.0))
          +i.y+vec4(0.0,i1.y,i2.y,1.0))
          +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

// Everything per-particle (position, size, colour, rotation) is computed here,
// once per vertex. The fragment shader only draws the rounded dash.
const VERT = /* glsl */ `
precision highp float;
attribute vec2 aRef;

uniform float uTime;
uniform vec2  uRing;
uniform float uRingRadius;
uniform float uRingW;
uniform float uRingW2;
uniform float uDisp;
uniform float uAspect;
uniform float uPointScale;
uniform float uMaxPoint;
uniform vec3  uC1;   // linear RGB
uniform vec3  uC2;
uniform vec3  uC3;

varying vec3  vColor;
varying float vAlpha;
varying float vRot;

${SNOISE}

vec3 toSRGB(vec3 c){
  return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c));
}

void main(){
  float time = uTime * 0.5;
  vec2 refPos = aRef;

  // --- ring mask -----------------------------------------------------------
  float dist  = distance(refPos, uRing);
  float n0    = snoise(vec3(refPos*0.2 + vec2(18.4924,72.9744), time*0.5));
  float dist1 = distance(refPos + n0*0.005, uRing);

  float t  = smoothstep(uRingRadius - uRingW*2.0,  uRingRadius, dist)
           - smoothstep(uRingRadius, uRingRadius + uRingW,  dist1);
  float t2 = smoothstep(uRingRadius - uRingW2*2.0, uRingRadius, dist)
           - smoothstep(uRingRadius, uRingRadius + uRingW2, dist1);
  float t3 = 1.0 - smoothstep(uRingRadius, uRingRadius + uRingW2, dist);

  t  = max(t,  0.0);
  t2 = max(t2, 0.0);
  t  = t * t;
  t2 = t2 * t2 * t2;

  t += t2 * 3.0;
  t += t3 * 0.4;
  t += snoise(vec3(refPos*30.0 + vec2(11.4924,12.9744), time*0.5)) * t3 * 0.5;
  float nS = snoise(vec3(refPos*2.0 + vec2(18.4924,72.9744), time*0.5));
  t += pow((nS + 1.5) * 0.5, 2.0) * 0.6;

  float scale = t;
  if (scale < 0.1) {               // would be fully transparent: skip the sprite
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0); vAlpha = 0.0; vRot = 0.0;
    return;
  }

  // --- drift ---------------------------------------------------------------
  float n1 = snoise(vec3(refPos*4.0  + vec2(88.494,32.4397),  time*0.35));
  float n2 = snoise(vec3(refPos*4.0  + vec2(50.904,120.947),  time*0.35));
  float n3 = snoise(vec3(refPos*20.0 + vec2(18.4924,72.9744), time*0.5));
  float n4 = snoise(vec3(refPos*20.0 + vec2(50.904,120.947), time*0.5));

  vec2 disp = vec2(n1, n2) * 0.03 + vec2(n3, n4) * 0.005;
  float dc = clamp(dist, 0.0, 1.0);
  disp.x += sin(refPos.x*20.0 + time*4.0) * 0.02 * dc;
  disp.y += cos(refPos.y*20.0 + time*3.0) * 0.02 * dc;

  // Steady state of the original's  p = 0.25*(0.8*p - push) + ref + disp
  vec2 refd = refPos + disp;
  vec2 push = (uRing - refd) * pow(t2, 0.75) * uDisp;
  vec2 pos  = (refd - 0.25 * push) / 0.8;

  // --- projection (original: fov 40, camera z 3.1, mesh scale 5) -----------
  vec2 world = pos * 5.0;
  const float VIEW_H = 1.1283;     // 3.1 * tan(20deg)
  gl_Position  = vec4(world.x / (VIEW_H * uAspect), world.y / VIEW_H, 0.0, 1.0);
  gl_PointSize = min(scale * uPointScale, uMaxPoint);

  // --- per-particle look ---------------------------------------------------
  float noiseAngle = snoise(vec3(pos*10.0 + vec2(18.4924,72.9744), uTime*0.85));
  float noiseColor = (snoise(vec3(pos*2.0 + vec2(74.664,91.556), uTime*0.5)) + 1.0) * 0.5;
  float angle = atan(pos.y - uRing.y, pos.x - uRing.x);

  const float H = 0.8;
  float progress = smoothstep(0.0, 0.75, noiseColor * noiseColor);
  vec3 col = progress < H
    ? mix(uC1, uC2, progress / H)
    : mix(uC2, uC3, (progress - H) / (1.0 - H));

  vColor = toSRGB(clamp(col, 0.0, 1.0));
  vAlpha = smoothstep(0.1, 0.2, scale);
  vRot   = -angle + noiseAngle * 0.5;
}
`

const FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3  vColor;
varying float vAlpha;
varying float vRot;

float sdRoundBox(vec2 p, vec2 b, vec4 r){
  r.xy = (p.x > 0.0) ? r.xy : r.zw;
  r.x  = (p.y > 0.0) ? r.x  : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  uv.y *= -1.0;
  float s = sin(vRot), c = cos(vRot);
  uv = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y);

  float d = sdRoundBox(uv, vec2(0.5, 0.2), vec4(0.25));
  float a = (1.0 - smoothstep(0.0, 0.1, d)) * vAlpha;
  if (a < 0.01) discard;

  gl_FragColor = vec4(vColor * a, a);   // premultiplied
}
`

// ------------------------------------------------------------------ helpers --

const VIEW_H = 1.1283

function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Bridson's Poisson-disk sampling over [0,w]x[0,h]. Returns x,y pairs. */
function poisson(
    w: number,
    h: number,
    r: number,
    k: number,
    rand: () => number
): Float32Array {
    const cell = r / Math.SQRT2
    const gw = Math.ceil(w / cell)
    const gh = Math.ceil(h / cell)
    const grid = new Int32Array(gw * gh).fill(-1)
    const pts: number[] = []
    const active: number[] = []
    const r2 = r * r

    const add = (x: number, y: number) => {
        const idx = pts.length / 2
        pts.push(x, y)
        active.push(idx)
        grid[Math.floor(y / cell) * gw + Math.floor(x / cell)] = idx
    }

    add(rand() * w, rand() * h)
    while (active.length && pts.length < 80000) {
        const ai = Math.floor(rand() * active.length)
        const px = pts[active[ai] * 2]
        const py = pts[active[ai] * 2 + 1]
        let found = false
        for (let n = 0; n < k && !found; n++) {
            const a = rand() * Math.PI * 2
            const d = r * (1 + rand())
            const x = px + Math.cos(a) * d
            const y = py + Math.sin(a) * d
            if (x < 0 || y < 0 || x >= w || y >= h) continue
            const gx = Math.floor(x / cell)
            const gy = Math.floor(y / cell)
            let ok = true
            for (
                let j = Math.max(0, gy - 2);
                j <= Math.min(gh - 1, gy + 2) && ok;
                j++
            ) {
                for (
                    let i = Math.max(0, gx - 2);
                    i <= Math.min(gw - 1, gx + 2);
                    i++
                ) {
                    const q = grid[j * gw + i]
                    if (q >= 0) {
                        const dx = pts[q * 2] - x
                        const dy = pts[q * 2 + 1] - y
                        if (dx * dx + dy * dy < r2) {
                            ok = false
                            break
                        }
                    }
                }
            }
            if (ok) {
                add(x, y)
                found = true
            }
        }
        if (!found) {
            active[ai] = active[active.length - 1]
            active.pop()
        }
    }
    return Float32Array.from(pts)
}

const hash1 = (n: number) => {
    const s = Math.sin(n * 127.1) * 43758.5453
    return s - Math.floor(s)
}
/** Smooth 1D value noise in [0,1] — drives the ring's idle wander. */
const noise1 = (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    const u = f * f * (3 - 2 * f)
    return hash1(i) * (1 - u) + hash1(i + 1) * u
}

const lin = (c: number) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Resolves hex / rgb() / hsl() / named / Framer `var(--token…)` colours via the browser. */
function resolveColor(
    host: HTMLElement,
    value: string | undefined,
    fallback: string
): [number, number, number] {
    const probe = document.createElement("span")
    probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none"
    probe.style.color = fallback
    if (value) probe.style.color = value
    host.appendChild(probe)
    const computed = getComputedStyle(probe).color
    host.removeChild(probe)
    const m = computed.match(/\d*\.?\d+/g)
    if (!m || m.length < 3) return hexToRgb(fallback)
    return [Number(m[0]), Number(m[1]), Number(m[2])]
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(
            "[AntigravityParticles] shader error:",
            gl.getShaderInfoLog(s)
        )
        gl.deleteShader(s)
        return null
    }
    return s
}

// ---------------------------------------------------------------- component --

interface Props {
    color1: string
    color2: string
    color3: string
    background: string
    density: number
    particlesScale: number
    ringWidth: number
    ringWidth2: number
    ringDisplacement: number
    interactive: boolean
    animateInEditor: boolean
    respectReducedMotion: boolean
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 720
 */
export default function AntigravityParticles(props: Props) {
    const { style, background } = props
    const hostRef = useRef<HTMLDivElement>(null)
    const propsRef = useRef(props)
    propsRef.current = props
    const invalidateRef = useRef<() => void>(() => {})

    // GL lifecycle: created once. Prop changes are read through propsRef.
    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        // Canvas is created imperatively so cleanup can safely lose its context
        // (safe under React StrictMode's mount → unmount → mount).
        const canvas = document.createElement("canvas")
        canvas.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none"
        host.appendChild(canvas)

        const gl = canvas.getContext("webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
        })
        if (!gl) {
            canvas.remove() // no WebGL: the background colour alone remains
            return
        }

        let program: WebGLProgram | null = null
        let buffer: WebGLBuffer | null = null
        let U: Record<string, WebGLUniformLocation | null> = {}
        let aRefLoc = -1
        let count = 0
        let geoKey = ""
        let maxPoint = 64
        let lost = false

        let raf = 0
        let lastTs = 0
        let time = 4 // seconds; also the frozen frame for static mode
        let ringX = 0
        let ringY = 0
        let ringInit = false
        let visible = true
        let colors: number[] = new Array(9).fill(0)
        let colorsDirty = true
        const pointer = { x: 0, y: 0, has: false, inside: false, nx: 0, ny: 0 }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")

        const build = (): boolean => {
            const vs = compile(gl, gl.VERTEX_SHADER, VERT)
            const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
            if (!vs || !fs) return false
            const p = gl.createProgram()
            if (!p) return false
            gl.attachShader(p, vs)
            gl.attachShader(p, fs)
            gl.linkProgram(p)
            gl.deleteShader(vs)
            gl.deleteShader(fs)
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
                console.error(
                    "[AntigravityParticles] link error:",
                    gl.getProgramInfoLog(p)
                )
                gl.deleteProgram(p)
                return false
            }
            program = p
            aRefLoc = gl.getAttribLocation(p, "aRef")
            U = {}
            for (const n of [
                "uTime",
                "uRing",
                "uRingRadius",
                "uRingW",
                "uRingW2",
                "uDisp",
                "uAspect",
                "uPointScale",
                "uMaxPoint",
                "uC1",
                "uC2",
                "uC3",
            ]) {
                U[n] = gl.getUniformLocation(p, n)
            }
            buffer = gl.createBuffer()
            geoKey = ""
            const range = gl.getParameter(
                gl.ALIASED_POINT_SIZE_RANGE
            ) as Float32Array | null
            maxPoint = range ? range[1] : 64
            return true
        }

        // Only the visible slice of the original field is generated. Aspect is
        // quantised upward so resizing doesn't reshuffle particles every frame.
        const ensureGeometry = (aspect: number, density: number) => {
            const aq = Math.min(10, Math.max(0.2, Math.ceil(aspect * 10) / 10))
            const d = Math.min(300, Math.max(50, density))
            const key = aq + "|" + d
            if (key === geoKey || !buffer) return
            const r = (10 - (d / 300) * 8) / 250 // original: 500x500 field, min-distance 10→2 px
            const hy = 0.26 // visible half-height ≈ 0.18 + drift/push margin
            const hx = hy * aq
            const pts = poisson(hx * 2, hy * 2, r, 20, mulberry32(1337))
            for (let i = 0; i < pts.length; i += 2) {
                pts[i] -= hx
                pts[i + 1] -= hy
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW)
            count = pts.length / 2
            geoKey = key
        }

        const refreshColors = () => {
            const p = propsRef.current
            const c = [
                resolveColor(host, p.color1, "#26ab07"),
                resolveColor(host, p.color2, "#e8e6d9"),
                resolveColor(host, p.color3, "#0e0f0c"),
            ]
            colors = c.flatMap(([r, g, b]) => [lin(r), lin(g), lin(b)])
            colorsDirty = false
        }

        const stepRing = (dt: number, snap: boolean, aspect: number) => {
            const p = propsRef.current
            pointer.inside = false
            if (p.interactive && pointer.has && !snap) {
                const r = host.getBoundingClientRect()
                if (r.width > 1 && r.height > 1) {
                    const nx = ((pointer.x - r.left) / r.width) * 2 - 1
                    const ny = -(((pointer.y - r.top) / r.height) * 2 - 1)
                    if (nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1) {
                        pointer.inside = true
                        pointer.nx = nx
                        pointer.ny = ny
                    }
                }
            }
            const wx = (noise1(time * 0.66 + 94.234) - 0.5) * 2
            const wy = (noise1(time * 0.75 + 21.028) - 0.5) * 2
            let tx: number
            let ty: number
            if (pointer.inside) {
                tx = pointer.nx * VIEW_H * aspect * 0.175 + wx * 0.1
                ty = pointer.ny * VIEW_H * 0.175 + wy * 0.1
            } else {
                tx = wx * 0.2
                ty = wy * 0.1
            }
            if (snap || !ringInit) {
                ringX = tx
                ringY = ty
                ringInit = true
                return
            }
            const k = 1 - Math.pow(1 - (pointer.inside ? 0.02 : 0.01), dt * 60)
            ringX += (tx - ringX) * k
            ringY += (ty - ringY) * k
        }

        const render = () => {
            if (lost || !program || !buffer) return
            const p = propsRef.current
            const w = canvas.width
            const h = canvas.height
            if (w < 2 || h < 2) return
            const aspect = w / h
            ensureGeometry(aspect, p.density)
            if (colorsDirty) refreshColors()

            gl.viewport(0, 0, w, h)
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.useProgram(program)
            gl.enable(gl.BLEND)
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.enableVertexAttribArray(aRefLoc)
            gl.vertexAttribPointer(aRefLoc, 2, gl.FLOAT, false, 0, 0)

            const R = 0.175 + Math.sin(time) * 0.03 + Math.cos(time * 3) * 0.02
            gl.uniform1f(U.uTime, time)
            gl.uniform2f(U.uRing, ringX, ringY)
            gl.uniform1f(U.uRingRadius, R)
            gl.uniform1f(U.uRingW, Math.max(0.001, p.ringWidth))
            gl.uniform1f(U.uRingW2, Math.max(0.001, p.ringWidth2))
            gl.uniform1f(U.uDisp, p.ringDisplacement)
            gl.uniform1f(U.uAspect, aspect)
            // original: size = scale * 7 * (dpr*0.5) * (cssWidth/2000) * particlesScale
            gl.uniform1f(U.uPointScale, 3.5 * (w / 2000) * p.particlesScale)
            gl.uniform1f(U.uMaxPoint, maxPoint)
            gl.uniform3f(U.uC1, colors[0], colors[1], colors[2])
            gl.uniform3f(U.uC2, colors[3], colors[4], colors[5])
            gl.uniform3f(U.uC3, colors[6], colors[7], colors[8])
            gl.drawArrays(gl.POINTS, 0, count)
        }

        const animatingNow = () => {
            const p = propsRef.current
            if (!visible) return false
            if (
                RenderTarget.current() === RenderTarget.canvas &&
                !p.animateInEditor
            )
                return false
            if (p.respectReducedMotion && reduced.matches) return false
            return true
        }

        const frame = (now: number) => {
            raf = 0
            const animating = animatingNow()
            const dt = lastTs ? Math.min((now - lastTs) / 1000, 0.1) : 0
            lastTs = animating ? now : 0
            if (animating) time += dt
            stepRing(dt, !animating, canvas.width / Math.max(1, canvas.height))
            render()
            if (animating) schedule()
        }
        const schedule = () => {
            if (!raf) raf = requestAnimationFrame(frame)
        }

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            const w = Math.max(1, Math.round(host.clientWidth * dpr))
            const h = Math.max(1, Math.round(host.clientHeight * dpr))
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
                render() // resizing clears the drawing buffer; repaint before the browser presents
            }
            schedule()
        }

        // Listeners -----------------------------------------------------------
        const onMove = (e: PointerEvent) => {
            pointer.x = e.clientX
            pointer.y = e.clientY
            pointer.has = true
        }
        const onLeave = () => {
            pointer.has = false
        }
        const onUp = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") pointer.has = false
        }
        const onLost = (e: Event) => {
            e.preventDefault()
            lost = true
        }
        const onRestored = () => {
            lost = false
            program = null
            if (build()) {
                colorsDirty = true
                resize()
            }
        }

        // Window-level, because this is a background: content layered above the
        // canvas would otherwise swallow the pointer.
        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerup", onUp, { passive: true })
        window.addEventListener("pointercancel", onLeave, { passive: true })
        window.addEventListener("blur", onLeave)
        document.documentElement.addEventListener("mouseleave", onLeave)
        canvas.addEventListener("webglcontextlost", onLost)
        canvas.addEventListener("webglcontextrestored", onRestored)
        reduced.addEventListener?.("change", schedule)

        const ro = new ResizeObserver(resize)
        ro.observe(host)
        const io = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) {
                lastTs = 0
                schedule()
            }
        })
        io.observe(host)

        invalidateRef.current = () => {
            colorsDirty = true
            schedule()
        }

        if (build()) {
            resize()
            schedule()
        }

        return () => {
            cancelAnimationFrame(raf)
            raf = 0
            ro.disconnect()
            io.disconnect()
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onLeave)
            window.removeEventListener("blur", onLeave)
            document.documentElement.removeEventListener("mouseleave", onLeave)
            reduced.removeEventListener?.("change", schedule)
            canvas.removeEventListener("webglcontextlost", onLost)
            canvas.removeEventListener("webglcontextrestored", onRestored)
            if (program) gl.deleteProgram(program)
            if (buffer) gl.deleteBuffer(buffer)
            gl.getExtension("WEBGL_lose_context")?.loseContext()
            canvas.remove()
            invalidateRef.current = () => {}
        }
    }, [])

    // Live-update in the Framer editor when controls change (also redraws the
    // frozen static frame, which has no running loop).
    useEffect(() => {
        invalidateRef.current()
    }, [
        props.color1,
        props.color2,
        props.color3,
        props.density,
        props.particlesScale,
        props.ringWidth,
        props.ringWidth2,
        props.ringDisplacement,
        props.animateInEditor,
        props.respectReducedMotion,
    ])

    return (
        <div
            ref={hostRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                ...style,
                background,
            }}
        />
    )
}

AntigravityParticles.defaultProps = {
    color1: "#26ab07",
    color2: "#e8e6d9",
    color3: "#0e0f0c",
    background: "#0e0f0c",
    density: 220,
    particlesScale: 0.65,
    ringWidth: 0.15,
    ringWidth2: 0.05,
    ringDisplacement: 0.23,
    interactive: true,
    animateInEditor: false,
    respectReducedMotion: true,
}

addPropertyControls(AntigravityParticles, {
    color1: {
        type: ControlType.Color,
        title: "Color 1",
        defaultValue: "#26ab07", // brand green — the dominant particle colour
    },
    color2: {
        type: ControlType.Color,
        title: "Color 2",
        defaultValue: "#e8e6d9", // parchment — highlights
    },
    color3: {
        type: ControlType.Color,
        title: "Color 3 (fade)",
        defaultValue: "#0e0f0c", // void — rare particles dissolve into the background
    },
    background: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#0e0f0c",
    },
    density: {
        type: ControlType.Number,
        title: "Density",
        min: 100,
        max: 300,
        step: 10,
        defaultValue: 220,
    },
    particlesScale: {
        type: ControlType.Number,
        title: "Particle size",
        min: 0.1,
        max: 2,
        step: 0.01,
        defaultValue: 0.65,
    },
    ringWidth: {
        type: ControlType.Number,
        title: "Ring width",
        min: 0.001,
        max: 0.2,
        step: 0.001,
        defaultValue: 0.15,
    },
    ringWidth2: {
        type: ControlType.Number,
        title: "Ring core",
        min: 0.001,
        max: 0.2,
        step: 0.001,
        defaultValue: 0.05,
    },
    ringDisplacement: {
        type: ControlType.Number,
        title: "Push",
        min: 0.01,
        max: 1,
        step: 0.01,
        defaultValue: 0.23,
    },
    interactive: {
        type: ControlType.Boolean,
        title: "Follow cursor",
        defaultValue: true,
    },
    animateInEditor: {
        type: ControlType.Boolean,
        title: "Animate in editor",
        defaultValue: false,
    },
    respectReducedMotion: {
        type: ControlType.Boolean,
        title: "Reduced motion",
        defaultValue: true,
        enabledTitle: "Respect",
        disabledTitle: "Ignore",
    },
})
