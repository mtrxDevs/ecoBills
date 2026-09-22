# MOTION.md — the ecoBills motion system

Handoff spec. Read this before adding motion to anything.

The interface is allowed to feel fluid. It is **not** allowed to make the user
wait, to move without meaning, or to ignore the OS accessibility setting.

---

## 1. Where the numbers live

One definition, four mirrors. Never retype a number.

| File | Role |
| --- | --- |
| `packages/ui/src/motion-tokens.ts` | **THE SOURCE.** Durations, easings, springs, stagger, reduced-motion helpers. |
| `packages/config/tokens.css` | Same values as CSS custom properties (`--dur-*`, `--ease-*`, `--spring-*`). |
| `packages/config/tailwind.preset.js` | Same durations/easings as `duration-*` / `ease-*` utilities. |
| `apps/web/src/lib/motion.ts` | The app-facing surface: re-exports the tokens plus the variant builders screens use. |

`packages/ui` owns the numbers because the dependency only points one way
(`web -> ui`). Import motion in app code from `../lib/motion`, never from
`framer-motion` literals.

**Verification — this must return only token definitions:**

```bash
grep -rn "duration: 0\.\|ease:\|cubic-bezier" apps/web/src packages/ui/src
```

---

## 2. Duration scale

| Token | CSS | Framer | Used for |
| --- | --- | --- | --- |
| `instant` | `--dur-instant: 90ms` | `dur.instant` = `0.09` | State echo: press feedback, checkmark tick. |
| `fast` | `--dur-fast: 150ms` | `dur.fast` = `0.15` | Hover in/out, colour crossfades, focus ring. |
| `base` | `--dur-base: 200ms` | `dur.base` = `0.2` | Default: panels, badges, toast enter, stagger step. |
| `slow` | `--dur-slow: 300ms` | `dur.slow` = `0.3` | Largest reveal: sheet/overlay, checkmark morph. |
| `page` | `--dur-page: 240ms` | `dur.page` = `0.24` | Page cross-fade (spec §7 window is 150–250ms). |

Framer Motion takes **seconds**; the CSS tokens are **milliseconds**. `dur` and
`durMs` are the same scale in the two units.

**Continuous motion is not on this scale.** A spinner rotation and a shimmer
sweep have no beginning or end, so no entrance duration describes them. They
live in `indeterminate` (`rotationDuration 0.9s`, `shimmerCycleDuration 1.2s`,
`shimmerRepeatDelay 0.35s`, `ease: 'linear'`) and are always linear — an easing
curve makes a loop appear to stall at the same point every revolution. Both are
bounded: the shimmer stops after `shimmerCycles`, and the button spinner
escalates to a static "Still working…" after `loadingEscalateMs` (60s).

---

## 3. Easing curves

| Token | Curve | Used for |
| --- | --- | --- |
| `standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default for UI state changes. |
| `entrance` | `cubic-bezier(0.16, 1, 0.3, 1)` | Things arriving. Fast out, soft landing. |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving. Accelerates away. |

Rule of thumb: **`entrance` on the way in, `exit` on the way out, `standard`
for everything that is neither.**

---

## 4. Springs

| Token | Stiffness / damping | Used for |
| --- | --- | --- |
| `spring.default` | `180 / 26` | Cards, hover lift, the sidebar's shared `layoutId` indicator. |
| `spring.snappy` | `320 / 30` | Press and press-release, count-up. Settles fast. |
| `spring.ambient` | `120 / 20` | Pointer-follow / ambient field. Slow enough to read as atmosphere. |

### Curve vs spring — the rule

Use a **spring** when the motion is *driven by the user's body* and should feel
physical: pointer position, hover, press, a thing that follows a finger or an
indicator that slides between two positions the user just chose. Springs absorb
interruption gracefully, which is exactly what a pointer does.

Use a **curve + duration** when the motion is *the interface's own statement*
and must be predictable and bounded: page transitions, panel/sheet reveals,
toasts, fade-ins, opacity changes. These need to land on a known duration so
they cannot make the user wait.

If a transition is a pure opacity or colour crossfade — use a curve. Springs on
opacity look like lag, not weight.

---

## 5. The stagger rule

A list animates as **one gesture**, never as N independent ones, and the delay
**must never grow with list length**.

```ts
STAGGER_STEP     = 0.03   // seconds added per index
STAGGER_MAX_INDEX = 6     // index cap
stagger(i)               // min(i, 6) * 0.03  → capped at 180ms
```

Index 7 and index 70 both start at 180ms, so a 40-row table takes exactly as
long to settle as a 7-row one. Use `<StaggerList>` + `<StaggerItem index={i}>`
rather than hand-rolling delays.

---

## 6. `prefers-reduced-motion` contract

When the user has asked for reduced motion:

1. **Strip every transform-based animation** — translate, scale, rotate, skew,
   `pathLength`, and shared-layout (`layout` / `layoutId`) transitions.
2. **Keep opacity and colour crossfades.** These are safe and their removal
   would make the interface feel broken, not calm.
3. **Keep all function.** Nothing may become unreachable, unreadable or
   un-announced. A reduced-motion user gets the same app with less movement.

Two mechanisms enforce this, and you need both:

- **Global safety net:** the app tree is wrapped in
  `<MotionConfig reducedMotion="user">` (`apps/web/src/App.tsx`).
- **Explicit gate:** every animated element goes through a token-aware builder —
  `pageTransition(reduce)`, `cardLift(reduce)`, `pressFeedback(reduce)`,
  `useStagger(index)`, or `motionSafe()` for one-off props. Components read
  `useReducedMotion()` from the token module, which is **reactive**: flipping the
  OS setting applies live, without a reload.

Statically-rendered fallbacks are the same design at rest, so the two paths look
alike: `AmbientField` never attaches its pointer listener, `Skeleton` renders no
shimmer, `Button` draws the checkmark without the draw-on, `Layout` renders a
plain `<span>` instead of the shared-layout indicator, `CountUp` prints the
final number.

Do **not** add a blanket `* { animation: none; transition: none }` reset. It
would flatten every hover and focus response. `apps/web/src/index.css` documents
this deliberately.

---

## 7. Applying this to a NEW screen

Five patterns to copy. Three do/don't pairs first, because they are where new
screens go wrong.

### Do — page cross-fade via the token builder

```tsx
const reduce = useReducedMotion()
const page = pageTransition(reduce)          // 240ms, opacity-first, +4px rise

return (
  <motion.section
    initial={page.initial as never}
    animate={page.animate as never}
    transition={page.transition as never}
  >
```

### Don't — hand-rolled entrance with a retyped duration

```tsx
// ✗ WRONG: bypasses the tokens and ignores reduced motion entirely.
<motion.section
  initial={{ opacity: 0, y: 24, scale: 0.96 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  transition={{ duration: 0.45, ease: 'easeOut' }}
>
```

Three separate violations: a duration not on the scale, an off-scale easing, and
a 24px + scale entrance that a reduced-motion user cannot opt out of.

### Do — a list as one gesture

```tsx
<StaggerList className="flex flex-col gap-3">
  {rows.map((r, i) => <StaggerItem key={r.id} index={i}>{/* … */}</StaggerItem>)}
</StaggerList>
```

### Don't — `delay={i * 0.08}` on a 40-row table

```tsx
// ✗ WRONG: row 40 starts 3.2 seconds after the page painted.
<motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
  transition={{ delay: i * 0.08 }} />
```

The delay must be capped (`stagger()`), never proportional to the list.

### Do — card hover through the token builder

```tsx
const reduce = useReducedMotion()
<Card {...cardLift(reduce)}>   {/* spring lift, -3px, nothing under reduce */}
```

### Don't — an infinite decorative animation on a data screen

```tsx
// ✗ WRONG: an unbounded, eye-drawing loop behind live data.
<motion.div animate={{ backgroundPositionX: ['0%', '200%'] }}
  transition={{ duration: 6, repeat: Infinity }} />
```

Spec §7 allows **at most one** eye-drawing animated element per view
(`motionLimits.maxEyeDrawingElements = 1`), and an idle screen must do zero
work. The one exception is `AmbientField`, which animates only in response to
the pointer and does nothing at all when idle.

### The checklist for a new screen

- [ ] Every route reachable through the nav still renders under `DASHBOARD_ONLY`.
- [ ] Loading uses a `Skeleton*` shape that **mirrors the final layout** — never a generic spinner.
- [ ] Empty state is designed and says what to do next (icon, title, description, action).
- [ ] Error state offers a **recovery action** (`refetch`), not just a message.
- [ ] Interactive elements carry `focusRing`; financial figures carry `.tnum`.
- [ ] Icons come from `packages/ui/src/icons.tsx`. **No emoji as interface icons.**
- [ ] Money is formatted at render time only; no arithmetic changes.

---

## 8. Values that are not motion

| Token | Value | Meaning |
| --- | --- | --- |
| `motionLimits.maxEyeDrawingElements` | `1` | Spec §7 budget per view. |
| `motionLimits.loadingEscalateMs` | `60_000` | Spinner → static "Still working…". |
| `motionLimits.successHoldMs` | `1400` | How long a sent/created confirmation holds before its panel closes. One value for every confirmation. |

Toast display lifetimes (`success`/`info` 5000ms, `error` 9000ms) live in
`packages/ui/src/toast.tsx` — they are reading time, not animation.
