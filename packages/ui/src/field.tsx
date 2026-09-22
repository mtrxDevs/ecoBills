import * as React from 'react'
import { cn, Select, TextArea, TextInput } from './primitives'
import { IconAlert } from './icons'

/* ==========================================================================
   Field
   --------------------------------------------------------------------------
   Label above the control, helper text and error text below it, wired with
   `aria-describedby` and `aria-invalid`. The error container carries
   `role="alert"` and is mounted from the start, so the live region already
   exists in the DOM when a message is injected into it.

   Validation timing (spec §7 / a11y): a field is only validated on **blur**,
   never on the first keystroke — the shop owner is never told a half-typed
   value is wrong. Once a field has been blurred it re-validates on change, so
   the message clears as soon as the input becomes valid.
   ========================================================================== */

export type FieldRenderProps = {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  'aria-required': true | undefined
  onBlur: () => void
}

export type FieldProps = {
  id?: string
  label: string
  /** Helper text shown under the control while there is no error. */
  hint?: string
  /** External error (e.g. from the server). Always shown, overrides validation. */
  error?: string
  required?: boolean
  /** Current value, used for blur validation. Omit for render-prop usage. */
  value?: unknown
  /** Returns a message when invalid, or undefined when valid. */
  validate?: (value: unknown) => string | undefined
  /** Render prop (receives the aria wiring) or a plain control. */
  children: React.ReactNode | ((props: FieldRenderProps) => React.ReactNode)
  className?: string
}

export function Field({ id, label, hint, error, required, value, validate, children, className }: FieldProps) {
  const autoId = React.useId()
  const fieldId = id ?? autoId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  const [touched, setTouched] = React.useState(false)

  // Re-runs on every change, but the result is only *shown* once touched.
  const validationError = React.useMemo(() => {
    if (!validate || value === undefined) return undefined
    return validate(value)
  }, [validate, value])

  const shownError = error ?? (touched ? validationError : undefined)
  const describedBy =
    [hint ? hintId : null, shownError ? errorId : null].filter(Boolean).join(' ') || undefined

  const renderProps: FieldRenderProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': shownError ? true : undefined,
    'aria-required': required || undefined,
    onBlur: () => setTouched(true),
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--color-danger-text)]" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {typeof children === 'function' ? children(renderProps) : children}

      {hint && !shownError ? (
        <p id={hintId} className="mt-1 text-xs text-[var(--color-ink-subtle)]">
          {hint}
        </p>
      ) : null}

      {/* role="alert" container is always mounted; only its text changes. */}
      <p
        id={errorId}
        role="alert"
        className={cn(
          'mt-1 flex items-start gap-1 text-xs font-medium text-[var(--color-danger-text)]',
          !shownError && 'sr-only',
        )}
      >
        {shownError ? (
          <>
            <IconAlert className="mt-px shrink-0 text-[0.9em]" />
            <span>{shownError}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------
   Convenience wrappers — a developer adding a field writes no aria wiring.
   ------------------------------------------------------------------------- */

export type TextFieldProps = Omit<FieldProps, 'children' | 'value' | 'validate'> & {
  value: string
  onValueChange: (next: string) => void
  /** Runs on blur (and on change once touched). */
  validate?: (value: string) => string | undefined
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
}

export function TextField({ value, onValueChange, validate, inputProps, ...field }: TextFieldProps) {
  return (
    <Field
      {...field}
      value={value}
      validate={validate ? (v) => validate(String(v ?? '')) : undefined}
    >
      {(a) => (
        <TextInput
          {...inputProps}
          {...a}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export type TextAreaFieldProps = Omit<FieldProps, 'children' | 'value' | 'validate'> & {
  value: string
  onValueChange: (next: string) => void
  /** Runs on blur (and on change once touched). */
  validate?: (value: string) => string | undefined
  rows?: number
  textAreaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>
}

export function TextAreaField({ value, onValueChange, rows = 8, textAreaProps, validate, ...field }: TextAreaFieldProps) {
  return (
    <Field {...field} value={value} validate={validate ? (v) => validate(String(v ?? '')) : undefined}>
      {(a) => (
        <TextArea
          {...textAreaProps}
          {...a}
          rows={rows}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export type SelectFieldProps = Omit<FieldProps, 'children' | 'value' | 'validate'> & {
  value: string
  onValueChange: (next: string) => void
  selectProps?: React.SelectHTMLAttributes<HTMLSelectElement>
  children: React.ReactNode
}

export function SelectField({ value, onValueChange, selectProps, children, ...field }: SelectFieldProps) {
  return (
    <Field {...field} value={value}>
      {(a) => (
        <Select {...selectProps} {...a} value={value} onChange={(e) => onValueChange(e.target.value)}>
          {children}
        </Select>
      )}
    </Field>
  )
}
