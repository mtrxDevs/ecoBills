/**
 * AntigravityParticles — Framer Code Component
 * ---------------------------------------------------------------
 * HOW TO USE IN FRAMER:
 * 1. In Framer, insert → Code Component → New File, name it
 *    `AntigravityParticles`, and paste this entire file.
 * 2. Drag it onto the canvas, stretch it to fill the background layer,
 *    and send it backward (it renders transparent — layers behind show).
 * 3. Tune it from the properties panel on the right (density, speed,
 *    colors, ripple). No code changes needed.
 *
 * WHAT IT RECREATES (studied from antigravity.google's own frontend):
 * their hero background is a GPU particle field — dots anchored to home
 * positions, simplex-noise drift, plus a cursor-following ring that pushes
 * particles aside as it travels. This component reproduces that *behavior*
 * with a lightweight Canvas 2D engine (no three.js — Framer code components
 * must stay dependency-free), tinted to the ecoBills brand system:
 * deep-space canvas, emerald glow (#17A673), bright mint accents (#85E46B).
 *
 * PERFORMANCE / SAFETY (same contract as the product UI):
 * - Caps devicePixelRatio at 2 and particle count; additive look is faked
 *   with a two-pass dot+halo (shadowBlur per particle would tank mobile).
 * - Pauses when the tab is hidden; renders ONE static frame under
 *   prefers-reduced-motion; disposes everything on unmount.
 */

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// ---------------------------------------------------------------- brand ---
const BRAND = {
  dot: "#9fd8b8",
  glow: "#17a673",
  ring: "#85e46b",
}

type Props = {
  density: number
  speed: number
  dotColor: string
  glowColor: string
  ringColor: string
  showRing: boolean
  rippleRadius: number
  rippleStrength: number
  maxOpacity: number
  tapRipples: boolean
}

type P = {
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  alpha: number
}

/** Cheap smooth pseudo-noise in [-1, 1] — no library needed. */
function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 0.7 + seed) * 0.55 +
    Math.sin(t * 1.7 + seed * 2.3) * 0.3 +
    Math.sin(t * 3.1 + seed * 4.1) * 0.15
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  const n = parseInt(v, 16)
  if (Number.isNaN(n)) return [159, 216, 184]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export default function AntigravityParticles(props: Props) {
  const {
    density = 220,
    speed = 1,
    dotColor = BRAND.dot,
    glowColor = BRAND.glow,
    ringColor = BRAND.ring,
    showRing = true,
    rippleRadius = 130,
    rippleStrength = 60,
    maxOpacity = 0.85,
    tapRipples = true,
  } = props

  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  // Ripples spawned by taps/clicks (expanding rings that shove particles).
  const ripplesRef = React.useRef<Array<{ x: number; y: number; r: number; life: number }>>([])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let w = 0
    let h = 0
    let dpr = 1
    let parts: P[] = []

    const seedField = () => {
      const count = Math.max(40, Math.min(600, Math.round(density)))
      // Poisson-ish scatter: random candidates, keep the first that is not
      // too close to an accepted dot (bounded tries — cheap and even).
      const pts: Array<[number, number]> = []
      const minD = Math.max(9, Math.sqrt((w * h) / count) * 0.42)
      let guard = count * 14
      while (pts.length < count && guard-- > 0) {
        const x = Math.random() * w
        const y = Math.random() * h
        let ok = true
        for (let i = pts.length - 1; i >= Math.max(0, pts.length - 24); i--) {
          const dx = pts[i][0] - x
          const dy = pts[i][1] - y
          if (dx * dx + dy * dy < minD * minD) {
            ok = false
            break
          }
        }
        if (ok) pts.push([x, y])
      }
      parts = pts.map(([x, y]) => ({
        hx: x,
        hy: y,
        x,
        y,
        vx: 0,
        vy: 0,
        r: 0.7 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.65,
      }))
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seedField()
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, inside: false }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.tx = e.clientX - r.left
      pointer.ty = e.clientY - r.top
      pointer.inside = true
    }
    const onLeave = () => {
      pointer.inside = false
    }
    const onTap = (e: PointerEvent) => {
      if (!tapRipples) return
      const r = canvas.getBoundingClientRect()
      ripplesRef.current.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 8, life: 1 })
      if (ripplesRef.current.length > 6) ripplesRef.current.shift()
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("pointerdown", onTap)

    const [dr, dg, db] = hexToRgb(dotColor)
    const [gr, gg, gb] = hexToRgb(glowColor)
    const [rr, rg, rb] = hexToRgb(ringColor)

    let raf = 0
    let last = performance.now()
    const R = Math.max(40, rippleRadius)
    const S = Math.max(0, rippleStrength)

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000

      // Eased cursor ring (the antigravity cursor feel).
      pointer.x += (pointer.tx - pointer.x) * 0.16
      pointer.y += (pointer.ty - pointer.y) * 0.16

      ctx.clearRect(0, 0, w, h)

      const ripples = ripplesRef.current
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        rp.r += 260 * dt
        rp.life -= dt * 1.1
        if (rp.life <= 0) ripples.splice(i, 1)
      }

      for (const p of parts) {
        // 1. Noise drift around home (the antigravity "breathing" field).
        const n = wobble(t * speed, p.phase)
        const n2 = wobble(t * speed + 40, p.phase * 1.7)
        p.vx += (n * 9 * speed + (p.hx - p.x) * 1.6) * dt
        p.vy += (n2 * 9 * speed + (p.hy - p.y) * 1.6) * dt

        // 2. Cursor ring repulsion (falloff squared — tight, physical).
        if (pointer.inside) {
          const dx = p.x - pointer.x
          const dy = p.y - pointer.y
          const d = Math.hypot(dx, dy)
          if (d < R && d > 0.001) {
            const f = (1 - d / R) * (1 - d / R) * S * 22 * dt
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }
        }

        // 3. Tap ripples shove particles on their expanding front.
        for (const rp of ripples) {
          const dx = p.x - rp.x
          const dy = p.y - rp.y
          const d = Math.hypot(dx, dy)
          const band = Math.abs(d - rp.r)
          if (band < 26 && d > 0.001) {
            const f = (1 - band / 26) * rp.life * 130 * dt
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }
        }

        // 4. Integrate with damping (the spring back home).
        p.vx *= 1 - Math.min(0.9, 3.2 * dt)
        p.vy *= 1 - Math.min(0.9, 3.2 * dt)
        p.x += p.vx * dt * 60 * 0.16
        p.y += p.vy * dt * 60 * 0.16

        const tw = 0.72 + 0.28 * Math.sin(t * 1.4 * speed + p.phase)
        const a = Math.max(0, Math.min(1, p.alpha * tw)) * maxOpacity

        // Halo pass (additive look, no shadowBlur cost), then hot core.
        ctx.beginPath()
        ctx.fillStyle = `rgba(${gr},${gg},${gb},${(a * 0.16).toFixed(3)})`
        ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = `rgba(${dr},${dg},${db},${a.toFixed(3)})`
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // 5. The ring itself.
      if (showRing && pointer.inside) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},0.55)`
        ctx.lineWidth = 1.4
        ctx.arc(pointer.x, pointer.y, R * 0.52, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.fillStyle = `rgba(${rr},${rg},${rb},0.9)`
        ctx.arc(pointer.x, pointer.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      for (const rp of ripples) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},${(0.4 * rp.life).toFixed(3)})`
        ctx.lineWidth = 1.2
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2)
        ctx.stroke()
      }

      raf = requestAnimationFrame(frame)
    }

    if (reduceMotion) {
      // One static frame: drift settled, ring parked off-canvas.
      last = performance.now()
      const once = () => {
        ctx.clearRect(0, 0, w, h)
        for (const p of parts) {
          ctx.beginPath()
          ctx.fillStyle = `rgba(${dr},${dg},${db},${(p.alpha * maxOpacity).toFixed(3)})`
          ctx.arc(p.hx, p.hy, p.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      once()
    } else {
      raf = requestAnimationFrame(frame)
    }

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!reduceMotion && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("pointerdown", onTap)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", background: "transparent" }}
    />
  )
}

addPropertyControls(AntigravityParticles, {
  density: {
    type: ControlType.Number,
    title: "Density",
    defaultValue: 220,
    min: 40,
    max: 600,
    step: 10,
    displayStepper: true,
  },
  speed: {
    type: ControlType.Number,
    title: "Drift speed",
    defaultValue: 1,
    min: 0,
    max: 3,
    step: 0.1,
    displayStepper: true,
  },
  dotColor: { type: ControlType.Color, title: "Dot", defaultValue: BRAND.dot },
  glowColor: { type: ControlType.Color, title: "Glow", defaultValue: BRAND.glow },
  ringColor: { type: ControlType.Color, title: "Ring", defaultValue: BRAND.ring },
  showRing: { type: ControlType.Boolean, title: "Cursor ring", defaultValue: true, enabledTitle: "Show", disabledTitle: "Hide" },
  rippleRadius: {
    type: ControlType.Number,
    title: "Ripple radius",
    defaultValue: 130,
    min: 40,
    max: 320,
    step: 5,
    displayStepper: true,
  },
  rippleStrength: {
    type: ControlType.Number,
    title: "Ripple force",
    defaultValue: 60,
    min: 0,
    max: 160,
    step: 5,
    displayStepper: true,
  },
  maxOpacity: {
    type: ControlType.Number,
    title: "Max opacity",
    defaultValue: 0.85,
    min: 0.1,
    max: 1,
    step: 0.05,
    displayStepper: true,
  },
  tapRipples: { type: ControlType.Boolean, title: "Tap ripples", defaultValue: true, enabledTitle: "On", disabledTitle: "Off" },
})
