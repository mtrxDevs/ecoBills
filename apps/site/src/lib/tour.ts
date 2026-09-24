/**
 * Dashboard tour data + camera math. Pure — unit-tested, no Three.js here.
 * The 3D component (DashboardTour.tsx) consumes these poses and tab entries.
 */

export type Vec3 = [number, number, number]

export type TourTab = {
  id: string
  label: string
  /** Jarvis callout: "this is …" */
  title: string
  body: string
  /** Camera pose for this stop. */
  camPos: Vec3
  camLook: Vec3
  /** Diorama groups to light up. */
  highlight: string[]
  /** World-space anchor the callout dot tracks. */
  anchor: Vec3
}

export const TOUR_TABS: TourTab[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'This is home base',
    body: "Today's sales, low stock and pending orders in one glance — the numbers a shop owner checks every morning.",
    camPos: [10.5, 8, 13.5],
    camLook: [0, 0.4, 0],
    highlight: ['kpis', 'chart', 'sidebar'],
    anchor: [0, 3.4, -2.4],
  },
  {
    id: 'billing',
    label: 'Billing',
    title: 'This is the bill counter',
    body: 'Pick a customer, scan items, totals update live. GST splits itself into CGST+SGST or IGST by place of supply.',
    camPos: [3.5, 5.5, 10.5],
    camLook: [0, 0.8, 1.2],
    highlight: ['chart', 'kpis'],
    anchor: [0, 3.6, 1.6],
  },
  {
    id: 'customers',
    label: 'Customers',
    title: 'This is who owes you',
    body: 'Every bill, payment and return lines up into a running statement — outstanding and overdue, per customer.',
    camPos: [-1.5, 5, 11.5],
    camLook: [4.6, 0.8, 1.4],
    highlight: ['statement'],
    anchor: [4.6, 2.6, 1.4],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    title: 'This is stock that cannot lie',
    body: 'Every unit is a ledger entry, never an overwritten number. The amber bin is below reorder level — the app says so first.',
    camPos: [-8.5, 6, 9],
    camLook: [-3.4, 0.8, -2.4],
    highlight: ['bins'],
    anchor: [-3.4, 2.6, -2.4],
  },
  {
    id: 'orders',
    label: 'Orders',
    title: 'This is the reorder assistant',
    body: 'Low stock becomes a draft email per supplier. You review, you press send — nothing ever goes out on its own.',
    camPos: [9.5, 5.5, 7.5],
    camLook: [4.6, 0.7, -2.2],
    highlight: ['slips'],
    anchor: [4.6, 2.2, -2.2],
  },
  {
    id: 'reports',
    label: 'Reports',
    title: 'This is real profit',
    body: 'Revenue minus cost of goods minus expenses — with GST collected shown separately, never counted as your money.',
    camPos: [0, 9.5, 8.5],
    camLook: [0, 0.6, 1.2],
    highlight: ['chart', 'line'],
    anchor: [0, 4.2, 1.6],
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'This is the lock on the door',
    body: 'Owner-only reports and settings, staff fenced to billing and stock, email 2FA on every account that wants it.',
    camPos: [-11, 4.5, 6.5],
    camLook: [-6.5, 1.8, 0],
    highlight: ['sidebar', 'token'],
    anchor: [-6.5, 4.6, 0],
  },
]

/** eased 0→1, slow at both ends — camera moves never slam. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpPose(from: { pos: Vec3; look: Vec3 }, to: { pos: Vec3; look: Vec3 }, t: number): { pos: Vec3; look: Vec3 } {
  const e = easeInOutCubic(t)
  return {
    pos: [lerp(from.pos[0], to.pos[0], e), lerp(from.pos[1], to.pos[1], e), lerp(from.pos[2], to.pos[2], e)],
    look: [lerp(from.look[0], to.look[0], e), lerp(from.look[1], to.look[1], e), lerp(from.look[2], to.look[2], e)],
  }
}
