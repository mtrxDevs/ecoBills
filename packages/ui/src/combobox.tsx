import { useId, useMemo, useRef, useState } from 'react'
import { cn } from './primitives'
import { Field } from './field'
import { INDIAN_STATES } from './india-states'

/** Case-insensitive substring filter. Pure — order of options is preserved. */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  return options.filter((o) => o.toLowerCase().includes(q))
}

export type ComboboxProps = {
  id?: string
  value: string
  onValueChange: (v: string) => void
  options: readonly string[]
  placeholder?: string
  /** When true (default), any typed text is a valid value, not just a listed option. */
  allowCustom?: boolean
  autoFocus?: boolean
  ariaLabel: string
  className?: string
  /** Wiring from <Field>'s render prop — prefer <ComboboxField> over passing these. */
  fieldId?: string
  describedBy?: string
  invalid?: true
  onFieldBlur?: () => void
  disabled?: boolean
}

/**
 * Type-to-filter dropdown. A text field with a suggestion list: ArrowUp/Down
 * to move, Enter to pick, Escape to close. Typing an unlisted value is kept
 * (allowCustom), so this never traps data entry.
 * Motion is opacity-only (safe under reduced motion); durations come from CSS
 * tokens, never literals.
 */
export function Combobox({
  id, value, onValueChange, options, placeholder,
  allowCustom = true, autoFocus, ariaLabel, className,
  fieldId, describedBy, invalid, onFieldBlur, disabled,
}: ComboboxProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => filterOptions(options, value), [options, value])
  const showList = open && (matches.length > 0 || (!allowCustom && value !== ''))

  function pick(v: string) {
    onValueChange(v)
    setOpen(false)
    setActive(0)
  }

  return (
    <span className={cn('relative block', className)}>
      <input
        ref={inputRef}
        id={fieldId ?? id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-describedby={describedBy}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] disabled:opacity-50"
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          onFieldBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && matches.length) {
            e.preventDefault()
            setOpen(true)
            setActive((a) => (a + 1) % matches.length)
          } else if (e.key === 'ArrowUp' && matches.length) {
            e.preventDefault()
            setOpen(true)
            setActive((a) => (a - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter' && open && matches.length) {
            e.preventDefault()
            pick(matches[active] ?? matches[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--elev-2)]"
          style={{ transition: 'opacity var(--dur-fast) var(--ease-standard)' }}
        >
          {matches.map((m, i) => (
            <li key={m} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                // mousedown fires before blur: preventDefault keeps focus so the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full px-3 py-1.5 text-left text-sm text-[var(--color-ink)]',
                  i === active ? 'bg-[var(--color-accent-tint)]' : 'bg-transparent',
                )}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && allowCustom && value.trim() !== '' && matches.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          No listed match — “{value.trim()}” will be used as-is.
        </p>
      ) : null}
    </span>
  )
}

export function StateCombobox(props: Omit<ComboboxProps, 'options'>) {
  return <Combobox {...props} options={INDIAN_STATES} placeholder={props.placeholder || 'Select state…'} />
}

export type ComboboxFieldProps = Omit<ComboboxProps, 'id' | 'ariaLabel' | 'fieldId' | 'describedBy' | 'invalid' | 'onFieldBlur'> & {
  id?: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  /** Runs on blur (and on change once touched), like <TextField>. */
  validate?: (value: string) => string | undefined
}

/** Labeled combobox with the same label/hint/blur-validation chrome as <TextField>. */
export function ComboboxField({ id, label, hint, error, required, validate, ...rest }: ComboboxFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} value={rest.value} validate={validate as (v: unknown) => string | undefined} id={id}>
      {(fp) => (
        <Combobox
          {...rest}
          ariaLabel={label}
          fieldId={fp.id}
          describedBy={fp['aria-describedby']}
          invalid={fp['aria-invalid'] as true | undefined}
          onFieldBlur={fp.onBlur}
        />
      )}
    </Field>
  )
}
