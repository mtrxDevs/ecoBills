/* ==========================================================================
   @ecobills/ui — the fluid component set
   --------------------------------------------------------------------------
   Every component here animates by default using the shared motion tokens, so
   adding a new instance of one produces correct motion with no animation code
   at the call site. Nothing in this package declares a duration, easing or
   spring of its own — see packages/ui/src/motion-tokens.ts.
   ========================================================================== */

/* Motion tokens + hooks. The canonical numbers live in this package so the
   app's `lib/motion.ts` can re-export instead of redefining them. */
export {
  dur,
  durMs,
  ease,
  easeCss,
  spring,
  stagger,
  stripTransformMotion,
  motionLimits,
  cardLiftOffset,
  pageRiseOffset,
  STAGGER_STEP,
  STAGGER_MAX_INDEX,
} from './motion-tokens'
export type { Bezier, DurationName, EaseName, SpringName } from './motion-tokens'

export {
  useReducedMotion,
  prefersReducedMotion,
  motionSafe,
  fadeIn,
  pageTransition,
  cardLift,
  pressFeedback,
  useStagger,
  listVariants,
  springPresets,
} from './motion'

/* Primitives */
export {
  cn,
  formatMoney,
  focusRing,
  Card,
  Section,
  GlassSurface,
  PageTitle,
  PageHint,
  Num,
  Badge,
  TextInput,
  TextArea,
  Select,
  Stat,
} from './primitives'
export type { CardProps, BadgeTone } from './primitives'

/* Components */
export { Button } from './button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './button'

export { Panel } from './panel'
export type { PanelProps, PanelSide } from './panel'

export { Field, TextField, TextAreaField, SelectField } from './field'
export type { FieldProps, FieldRenderProps, TextFieldProps, TextAreaFieldProps, SelectFieldProps } from './field'

export {
  Skeleton,
  SkeletonStats,
  SkeletonTable,
  SkeletonList,
  SkeletonForm,
  SkeletonChart,
  SkeletonSplit,
  SkeletonShapes,
  SkeletonShell,
  TextLine,
} from './skeleton'

export { EmptyState, ErrorState } from './empty-state'
export type { EmptyStateProps, ErrorStateProps } from './empty-state'

export { ToastProvider, useToast, LiveRegion } from './toast'
export type { Toast, ToastApi, ToastTone } from './toast'

export { CountUp } from './count-up'
export type { CountUpProps } from './count-up'

export { StaggerList, StaggerItem } from './stagger'
export type { StaggerListProps, StaggerItemProps } from './stagger'

export { AmbientField } from './ambient-field'
export type { AmbientFieldProps } from './ambient-field'

/* Icons — inline SVG, 1.5px stroke, currentColor. No emoji as interface icons. */
export {
  IconGrid,
  IconBox,
  IconReceipt,
  IconCart,
  IconChart,
  IconGear,
  IconUsers,
  IconSearch,
  IconPlus,
  IconClose,
  IconCheck,
  IconAlert,
  IconWarning,
  IconInfo,
  IconRefresh,
  IconInbox,
  IconDownload,
  IconChevronRight,
  IconLogout,
  IconTrend,
  icons,
} from './icons'
export type { IconProps, IconName } from './icons'
