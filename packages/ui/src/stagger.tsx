import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from './primitives'
import { useReducedMotion, useStagger } from './motion'

/* ==========================================================================
   StaggerList / StaggerItem
   --------------------------------------------------------------------------
   The stagger rule, made mechanical: a list animates as ONE gesture and the
   delay is capped, so a 40-row table settles in the same time as a 7-row one.

   A developer gets this for free by wrapping rows:

     <StaggerList>
       {rows.map((r, i) => <StaggerItem key={r.id} index={i}>{...}</StaggerItem>)}
     </StaggerList>

   Under reduced motion the vertical offset is dropped and only opacity is
   animated.
   ========================================================================== */

const RISE = 6 // px — the whole list travels less than a card lift

export type StaggerListProps = {
  as?: 'ul' | 'ol' | 'div' | 'tbody'
  className?: string
  children: React.ReactNode
}

export function StaggerList({ as = 'ul', className, children }: StaggerListProps) {
  const Tag = as as React.ElementType
  return <Tag className={className}>{children}</Tag>
}

export type StaggerItemProps = {
  /** Position in the list. Only the first few indices get a delay. */
  index: number
  as?: 'li' | 'div' | 'tr'
  className?: string
  children: React.ReactNode
}

export function StaggerItem({ index, as = 'li', className, children }: StaggerItemProps) {
  const reduce = useReducedMotion()
  const transition = useStagger(index)
  const Tag = motion[as] as React.ComponentType<Record<string, unknown>>

  return (
    <Tag
      className={cn(className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: RISE }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={transition}
    >
      {children}
    </Tag>
  )
}
