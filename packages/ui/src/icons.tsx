import * as React from 'react'

/* ==========================================================================
   Line-icon set
   --------------------------------------------------------------------------
   Spec §7 / a11y rule: no emoji as interface icons. Every glyph here is inline
   SVG on a 24px grid with a 1.5px stroke, `currentColor`, round caps/joins, and
   no fill — so icons inherit text colour and never fight the palette.

   Icons are decorative by default (`aria-hidden`). Pass `title` only when the
   icon is the sole carrier of meaning, which also promotes it to `role="img"`.
   ========================================================================== */

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, 'children'> & {
  /** Accessible name. Omit for icons that sit next to a visible label. */
  title?: string
}

function Icon({ title, className, ...rest }: IconProps, children: React.ReactNode) {
  const labelled = Boolean(title)
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const IconGrid = (p: IconProps) => Icon(p, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>)
export const IconBox = (p: IconProps) => Icon(p, <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>)
export const IconReceipt = (p: IconProps) => Icon(p, <><path d="M5 3.5h14v17l-2.5-1.6-2.3 1.6L12 19l-2.2 1.5-2.3-1.6L5 20.5z" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></>)
export const IconCart = (p: IconProps) => Icon(p, <><path d="M3 4h2.2l2 10.5h10.4L20 7H6" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>)
export const IconChart = (p: IconProps) => Icon(p, <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>)
export const IconGear = (p: IconProps) => Icon(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v0a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11A1.7 1.7 0 0 0 19.4 15z" /></>)
export const IconUsers = (p: IconProps) => Icon(p, <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.9M18 14.6a6.2 6.2 0 0 1 3.3 5.4" /></>)
export const IconSearch = (p: IconProps) => Icon(p, <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></>)
export const IconPlus = (p: IconProps) => Icon(p, <path d="M12 5v14M5 12h14" />)
export const IconClose = (p: IconProps) => Icon(p, <path d="M6 6l12 12M18 6 6 18" />)
export const IconCheck = (p: IconProps) => Icon(p, <path d="m4.5 12.5 5 5 10-11" />)
export const IconAlert = (p: IconProps) => Icon(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.3v.2" /></>)
export const IconWarning = (p: IconProps) => Icon(p, <><path d="M10.6 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0z" /><path d="M12 9v4M12 16.3v.2" /></>)
export const IconInfo = (p: IconProps) => Icon(p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.7v.2" /></>)
export const IconRefresh = (p: IconProps) => Icon(p, <><path d="M20 11a8 8 0 1 0-2.3 6.3" /><path d="M20 4.5V11h-6.5" /></>)
export const IconInbox = (p: IconProps) => Icon(p, <><path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" /><path d="M5.5 4.5h13l1.5 9v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-6z" /></>)
export const IconDownload = (p: IconProps) => Icon(p, <><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>)
export const IconChevronRight = (p: IconProps) => Icon(p, <path d="m9.5 5.5 7 6.5-7 6.5" />)
export const IconLogout = (p: IconProps) => Icon(p, <><path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M11 16.5 15.5 12 11 7.5M15.5 12H4" /></>)
export const IconTrend = (p: IconProps) => Icon(p, <><path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" /><path d="M15 6.5h5.5V12" /></>)

/** Registry so EmptyState can take an icon by name without hand-written SVG. */
export const icons = {
  grid: IconGrid,
  box: IconBox,
  receipt: IconReceipt,
  cart: IconCart,
  chart: IconChart,
  gear: IconGear,
  users: IconUsers,
  search: IconSearch,
  inbox: IconInbox,
  alert: IconAlert,
  warning: IconWarning,
  trend: IconTrend,
  download: IconDownload,
} as const

export type IconName = keyof typeof icons
