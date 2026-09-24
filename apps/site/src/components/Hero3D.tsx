import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { scaleBars } from '../lib/chart'

/**
 * Hero scene: twelve months of revenue as green bars on a dark grid, with a
 * slow drift of particles. Procedural — no model files, no Blender needed.
 *
 * Restraint rules (same as the product): one animated element, eased and
 * bounded; `prefers-reduced-motion` renders a single static frame; the loop
 * pauses when the tab is hidden; everything is disposed on unmount. If WebGL
 * is unavailable the hero degrades to a static gradient (never a blank hole).
 */
const MONTHS = [3.2, 4.1, 3.6, 5.0, 4.4, 5.8, 5.2, 6.4, 5.6, 7.0, 6.3, 7.6]
const BAR_MAX_H = 4.4
const FLOOR_Y = -2.2

export function Hero3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  // WebGL support is read during render (initializer runs once, no effect
  // involved), so a missing GPU shows the static fallback without any
  // setState-in-effect. Construction itself is further guarded below.
  const [failed] = useState(() => {
    try {
      const c = document.createElement('canvas')
      return !(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return true
    }
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host || failed) return

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      return
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    renderer.setClearColor(0x101210, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x101210, 0.026)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    const camBase = new THREE.Vector3(7.6, 5.0, 11.5)
    camera.position.copy(camBase)
    camera.lookAt(0, 0.4, 0)

    scene.add(new THREE.HemisphereLight(0x9fd8b8, 0x101210, 0.55))
    const key = new THREE.DirectionalLight(0xeafff3, 1.15)
    key.position.set(6, 10, 4)
    scene.add(key)
    const rim = new THREE.PointLight(0x17a673, 14, 24, 1.6)
    rim.position.set(-5, 2.5, -3)
    scene.add(rim)

    const grid = new THREE.GridHelper(28, 28, 0x2a3a32, 0x1d201d)
    grid.position.y = FLOOR_Y
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.55
    scene.add(grid)

    const group = new THREE.Group()
    const heights = scaleBars(MONTHS, BAR_MAX_H)
    const lo = new THREE.Color(0x12855c)
    const hi = new THREE.Color(0x85e46b)
    const barGeo = new THREE.BoxGeometry(0.8, 1, 0.8)
    heights.forEach((h, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: lo.clone().lerp(hi, i / (heights.length - 1)),
        roughness: 0.42,
        metalness: 0.18,
      })
      const bar = new THREE.Mesh(barGeo, mat)
      bar.scale.y = Math.max(h, 0.001)
      bar.position.set((i - (heights.length - 1) / 2) * 1.15, FLOOR_Y + Math.max(h, 0.001) / 2, 0)
      group.add(bar)
    })
    scene.add(group)

    const COUNT = 170
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22
      pos[i * 3 + 1] = Math.random() * 7 - 2
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14
      seed[i] = Math.random() * Math.PI * 2
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0x2fbf82, size: 0.05, transparent: true, opacity: 0.65, depthWrite: false }),
    )
    scene.add(points)

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

    const mouse = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      mouse.x = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2
      mouse.y = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2
    }
    if (!reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true })

    let raf = 0
    const clock = new THREE.Clock()
    const render = () => {
      const t = clock.getElapsedTime()
      group.rotation.y = t * 0.07
      const p = pGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < COUNT; i++) {
        p.setY(i, p.getY(i) + Math.sin(t * 0.6 + seed[i]) * 0.0009)
      }
      p.needsUpdate = true
      camera.position.x += (camBase.x + mouse.x * 0.7 - camera.position.x) * 0.03
      camera.position.y += (camBase.y - mouse.y * 0.4 - camera.position.y) * 0.03
      camera.lookAt(0, 0.4, 0)
      renderer.render(scene, camera)
    }

    if (reduceMotion) {
      render()
    } else {
      const loop = () => {
        if (!document.hidden) render()
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
      barGeo.dispose()
      if (renderer) {
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  }, [failed])

  if (failed) {
    return (
      <div
        className="hero-canvas"
        aria-hidden="true"
        style={{ background: 'radial-gradient(60% 50% at 70% 40%, rgba(23,166,115,0.25), transparent 70%), #101210' }}
      />
    )
  }
  return <div ref={hostRef} className="hero-canvas" aria-hidden="true" />
}
