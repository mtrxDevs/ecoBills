import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TOUR_TABS, lerp } from '../lib/tour'
import { scaleBars } from '../lib/chart'

/**
 * 3D dashboard tour: a procedural diorama of the ecoBills app (sidebar rail,
 * KPI cards, chart panel, statement slabs, stock bins, order slips, security
 * token) with a Jarvis-style guided tour — one tab per destination, camera
 * glides to each stop, the relevant part lights up, a callout dot tracks it.
 *
 * Same restraint contract as the hero: eased + bounded motion, static frame
 * under prefers-reduced-motion, no loop while hidden or offscreen, full
 * disposal on unmount, WebGL fallback.
 */

const TICK_INDEX: Record<string, number> = {
  dashboard: 0,
  billing: 1,
  customers: 2,
  inventory: 3,
  orders: 4,
  reports: 5,
  settings: 6,
}

const MONTHS = [3.2, 4.1, 3.6, 5.0, 4.4, 5.8, 5.2, 6.4]

export function DashboardTour() {
  const hostRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const [tabId, setTabId] = useState(TOUR_TABS[0].id)
  // Same no-effect pattern as the hero: support is read during render.
  const [failed] = useState(() => {
    try {
      const c = document.createElement('canvas')
      return !(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return true
    }
  })
  const tabRef = useRef(tabId)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)

  const select = (id: string) => {
    tabRef.current = id
    setTabId(id)
  }

  useEffect(() => {
    const host = hostRef.current
    const label = labelRef.current
    if (!host || failed) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    renderer.setClearColor(0x101210, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x101210, 0.022)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)

    scene.add(new THREE.HemisphereLight(0x9fd8b8, 0x101210, 0.5))
    const key = new THREE.DirectionalLight(0xeafff3, 1.1)
    key.position.set(7, 12, 6)
    scene.add(key)
    const rim = new THREE.PointLight(0x17a673, 16, 26, 1.6)
    rim.position.set(-6, 3, -4)
    scene.add(rim)

    // ---- materials (registered per group for highlight control) ----
    const groupMats: Record<string, THREE.MeshStandardMaterial[]> = {}
    const mat = (group: string, color: number, emissive = 0x17a673, base = 0.08, peak = 0.9) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: base, roughness: 0.5, metalness: 0.2 })
      m.userData.base = base
      m.userData.peak = peak
      ;(groupMats[group] = groupMats[group] || []).push(m)
      return m
    }
    const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)

    const groups: Record<string, THREE.Group> = {}
    const G = (name: string) => {
      const g = new THREE.Group()
      groups[name] = g
      scene.add(g)
      return g
    }

    // floor + grid
    const floor = box(20, 0.16, 13, mat('floor', 0x151815, 0x17a673, 0.02, 0.06))
    floor.position.y = -0.08
    scene.add(floor)
    const grid = new THREE.GridHelper(20, 20, 0x2a3a32, 0x1a1e1a)
    grid.position.y = 0.01
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    scene.add(grid)

    // sidebar rail + 7 nav ticks
    const rail = G('sidebar')
    const railBody = box(1.5, 4.6, 7.2, mat('sidebar', 0x1d201d))
    railBody.position.set(-6.8, 2.3, 0)
    rail.add(railBody)
    const tickMats: THREE.MeshStandardMaterial[] = []
    for (let i = 0; i < 7; i++) {
      const tm = new THREE.MeshStandardMaterial({ color: 0x2c332c, emissive: 0x17a673, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.2 })
      tickMats.push(tm)
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.62), tm)
      tick.position.set(-6.0, 3.6 - i * 0.62, 0)
      rail.add(tick)
    }

    // security token (settings)
    const tokenG = G('token')
    const tokenMat = mat('token', 0x1e8906, 0x85e46b, 0.5, 1.4)
    const token = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), tokenMat)
    token.position.set(-6.8, 5.5, 0)
    tokenG.add(token)

    // KPI cards
    const kpis = G('kpis')
    ;[-3.1, 0, 3.1].forEach((x) => {
      const card = box(2.4, 1.3, 1.7, mat('kpis', 0x1d201d))
      card.position.set(x, 0.65, -3.1)
      kpis.add(card)
      const strip = box(2.4, 0.09, 1.7, mat('kpis', 0x17a673, 0x17a673, 0.35, 1.2))
      strip.position.set(x, 1.34, -3.1)
      kpis.add(strip)
    })

    // chart panel + bars + trend line (billing / reports)
    const chart = G('chart')
    const deck = box(7.6, 0.22, 4.2, mat('chart', 0x1d201d))
    deck.position.set(0, 0.11, 1.8)
    chart.add(deck)
    const heights = scaleBars(MONTHS, 2.0)
    const lo = new THREE.Color(0x12855c)
    const hi = new THREE.Color(0x85e46b)
    const barGeo = new THREE.BoxGeometry(0.62, 1, 0.62)
    heights.forEach((h, i) => {
      const m = new THREE.MeshStandardMaterial({
        color: lo.clone().lerp(hi, i / (heights.length - 1)),
        emissive: 0x17a673,
        emissiveIntensity: 0.25,
        roughness: 0.42,
        metalness: 0.2,
      })
      m.userData.base = 0.25
      m.userData.peak = 1.1
      ;(groupMats['chart'] = groupMats['chart'] || []).push(m)
      const bar = new THREE.Mesh(barGeo, m)
      bar.scale.y = Math.max(h, 0.001)
      bar.position.set((i - (heights.length - 1) / 2) * 0.88, 0.22 + Math.max(h, 0.001) / 2, 1.8)
      chart.add(bar)
    })
    const lineG = G('line')
    const lineMat = new THREE.LineBasicMaterial({ color: 0x85e46b, transparent: true, opacity: 0.4 })
    const linePts = heights.map((h, i) => new THREE.Vector3((i - (heights.length - 1) / 2) * 0.88, 0.22 + h + 0.55, 1.8))
    lineG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), lineMat))

    // statement slabs (customers)
    const stmt = G('statement')
    for (let i = 0; i < 4; i++) {
      const slab = box(2.6, 0.15, 3.2, mat('statement', i % 2 ? 0x1d201d : 0x242824))
      slab.position.set(5.7, 0.28 + i * 0.24, 1.8)
      slab.rotation.y = (i % 2 ? -1 : 1) * 0.04
      stmt.add(slab)
    }

    // stock bins, one amber low-stock bin (inventory)
    const bins = G('bins')
    let bi = 0
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++, bi++) {
        const low = bi === 5
        const m = mat('bins', low ? 0x4a3413 : 0x232823, low ? 0xf59e0b : 0x17a673, low ? 0.9 : 0.08, low ? 1.5 : 0.7)
        const cube = box(0.62, 0.62, 0.62, m)
        cube.position.set(-5.5 + c * 0.95, 0.31, 4.3 + r * 0.95)
        if (low) cube.userData.lowBin = true
        bins.add(cube)
      }
    }

    // order slips (orders)
    const slips = G('slips')
    for (let i = 0; i < 3; i++) {
      const slip = box(2.4, 0.13, 1.15, mat('slips', 0xe8eae6, 0x17a673, 0.02, 0.5))
      slip.position.set(5.7, 0.25 + i * 0.22, -2.6)
      slip.rotation.y = (i - 1) * 0.09
      slips.add(slip)
    }

    // Jarvis scan ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.035, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x85e46b, transparent: true, opacity: 0.7 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, 0.07, -2.4)
    scene.add(ring)

    // ---- tour state ----
    const glow: Record<string, number> = {}
    const cur = { pos: new THREE.Vector3(...TOUR_TABS[0].camPos), look: new THREE.Vector3(...TOUR_TABS[0].camLook) }
    const tgt = { pos: cur.pos.clone(), look: cur.look.clone() }
    const ringTgt = new THREE.Vector3(0, 0.07, -2.4)
    camera.position.copy(cur.pos)
    camera.lookAt(cur.look)

    const applyTab = (id: string) => {
      const tab = TOUR_TABS.find((t) => t.id === id) || TOUR_TABS[0]
      tgt.pos.set(...tab.camPos)
      tgt.look.set(...tab.camLook)
      ringTgt.set(tab.anchor[0], 0.07, tab.anchor[2])
      if (reduceMotion) {
        cur.pos.copy(tgt.pos)
        cur.look.copy(tgt.look)
        camera.position.copy(cur.pos)
        camera.lookAt(cur.look)
        ring.position.copy(ringTgt)
      }
    }
    applyTab(tabRef.current)

    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let raf = 0
    const timers: number[] = []
    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
    })
    io.observe(host)

    const clock = new THREE.Clock()
    const proj = new THREE.Vector3()
    const render = (t: number) => {
      const tab = TOUR_TABS.find((x) => x.id === tabRef.current) || TOUR_TABS[0]
      const k = 0.05
      cur.pos.lerp(tgt.pos, k)
      cur.look.lerp(tgt.look, k)
      camera.position.copy(cur.pos)
      camera.lookAt(cur.look)

      for (const name of Object.keys(groupMats)) {
        const want = tab.highlight.includes(name) ? 1 : 0
        glow[name] = lerp(glow[name] ?? 0, want, 0.1)
        for (const m of groupMats[name]) {
          m.emissiveIntensity = lerp(m.userData.base as number, m.userData.peak as number, glow[name])
        }
      }
      const tickIdx = TICK_INDEX[tab.id] ?? 0
      tickMats.forEach((m, i) => {
        m.emissiveIntensity = lerp(m.emissiveIntensity, i === tickIdx ? 1.7 : 0.22, 0.12)
      })
      lineMat.opacity = 0.3 + (glow['line'] ?? 0) * 0.7

      ring.position.lerp(ringTgt, 0.07)
      const ringMat = ring.material as THREE.MeshBasicMaterial
      ringMat.opacity = 0.45 + Math.sin(t * 0.0022) * 0.25
      const s = 1 + Math.sin(t * 0.0022) * 0.04
      ring.scale.set(s, s, 1)

      token.rotation.y = t * 0.0009
      token.position.y = 5.5 + Math.sin(t * 0.0011) * 0.16

      renderer.render(scene, camera)

      if (label) {
        proj.set(tab.anchor[0], tab.anchor[1], tab.anchor[2]).project(camera)
        const behind = proj.z > 1
        const x = (proj.x * 0.5 + 0.5) * host.clientWidth
        const y = (-proj.y * 0.5 + 0.5) * host.clientHeight
        label.style.display = behind ? 'none' : 'block'
        label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -130%)`
        const title = label.querySelector('[data-tour-title]')
        if (title && title.textContent !== tab.title) title.textContent = tab.title
      }
    }

    // One loop in both modes: reduced motion freezes time (static frame that
    // still reflects tab switches) instead of stopping updates entirely.
    // The auto-advance interval below is what actually stays off.
    if (!reduceMotion) {
      const timer = window.setInterval(() => {
        if (pausedRef.current || document.hidden) return
        const i = TOUR_TABS.findIndex((t) => t.id === tabRef.current)
        const next = TOUR_TABS[(i + 1) % TOUR_TABS.length]
        tabRef.current = next.id
        setTabId(next.id)
      }, 6500)
      timers.push(timer)
    }
    const loop = () => {
      if (visible && !document.hidden) {
        const tab = TOUR_TABS.find((x) => x.id === tabRef.current)
        if (tab && tab.id !== (loop as { last?: string }).last) {
          applyTab(tab.id)
          ;(loop as { last?: string }).last = tab.id
        }
        render(reduceMotion ? 0 : clock.getElapsedTime() * 1000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      for (const t of timers) window.clearInterval(t)
      io.disconnect()
      ro.disconnect()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else if (m) m.dispose()
      })
      barGeo.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = TOUR_TABS.find((t) => t.id === tabId) || TOUR_TABS[0]

  if (failed) {
    return (
      <div
        className="tour-canvas"
        aria-hidden="true"
        style={{ background: 'radial-gradient(60% 50% at 50% 40%, rgba(23,166,115,0.22), transparent 70%), #101210' }}
      />
    )
  }

  return (
    <div>
      <div
        className="tour-tabs"
        role="tablist"
        aria-label="Dashboard tour stops"
        onPointerEnter={() => {
          pausedRef.current = true
          setPaused(true)
        }}
        onPointerLeave={() => {
          pausedRef.current = false
          setPaused(false)
        }}
      >
        {TOUR_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tabId}
            className={t.id === tabId ? 'tour-tab active' : 'tour-tab'}
            onClick={() => select(t.id)}
            onFocus={() => {
              pausedRef.current = true
              setPaused(true)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tour-stage">
        <div ref={hostRef} className="tour-canvas" aria-hidden="true" />
        <div ref={labelRef} className="tour-callout" aria-hidden="true">
          <span className="tour-dot" />
          <span data-tour-title>{active.title}</span>
        </div>
      </div>
      <div className="tour-panel" aria-live="polite">
        <strong className="font-display">{active.title}</strong>
        <p>{active.body}</p>
        <span className="tour-status tnum">{paused ? 'Paused — pick a stop' : 'Auto-touring — hover to pause'}</span>
      </div>
    </div>
  )
}
