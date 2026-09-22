import { z } from 'zod'

// Money: integer paise. Tax: integer basis points. Qty: positive decimal-as-string/number.
export const moneyInt = z.number().int().min(0)
export const bpsInt = z.number().int().min(0).max(10000)
export const qtyDec = z.coerce.number().positive().max(1_000_000)

export const roleSchema = z.enum(['owner', 'staff'])

export const signupSchema = z.object({
  businessName: z.string().min(1).max(120),
  state: z.string().min(1).max(80),
  gstin: z.string().max(15).optional().nullable(),
  ownerName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const verify2faSchema = z.object({
  challengeToken: z.string().min(16).max(128),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
})

export const resend2faSchema = z.object({
  challengeToken: z.string().min(16).max(128),
})

export const enable2faSchema = z.object({
  challengeToken: z.string().min(16).max(128),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
})

export const disable2faSchema = z.object({
  password: z.string().min(1),
})

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: roleSchema,
})

export const customerSchema = z.object({
  name: z.string().min(1).max(160),
  phone: z.string().max(20).default(''),
  email: z.string().email().optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  state: z.string().max(80).default(''),
  address: z.string().max(500).default(''),
})

export const supplierSchema = z.object({
  name: z.string().min(1).max(160),
  contactEmail: z.string().email().optional().or(z.literal('')).default(''),
  phone: z.string().max(20).default(''),
  address: z.string().max(500).default(''),
})

export const itemSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().min(1).max(64),
  category: z.string().max(80).default('General'),
  unit: z.string().max(16).default('pcs'),
  hsnCode: z.string().max(16).optional().nullable(),
  costPrice: moneyInt.default(0),
  salePrice: moneyInt.default(0),
  taxRateBps: bpsInt.default(0),
  reorderThreshold: z.coerce.number().min(0).default(0),
  primarySupplierId: z.string().optional().nullable(),
})

export const stockAdjustSchema = z.object({
  itemId: z.string().min(1),
  deltaQty: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 1_000_000, 'deltaQty must be non-zero'),
  note: z.string().max(300).default(''),
})

const invoiceLineInput = z.object({
  itemId: z.string().min(1),
  qty: qtyDec,
  unitPrice: moneyInt.optional(), // defaults to item.sale_price; editable per line
  taxRateBps: bpsInt.optional(), // defaults to item.tax_rate_bps
})

export const createInvoiceSchema = z.object({
  customerId: z.string().optional().nullable(),
  placeOfSupplyState: z.string().max(80).optional(),
  issueDate: z.string().optional(), // ISO date
  lines: z.array(invoiceLineInput).min(1).max(200),
})

export const recordPaymentSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).default('cash'),
  note: z.string().max(300).default(''),
})

export const createCreditNoteSchema = z.object({
  reason: z.string().max(500).default(''),
  lines: z
    .array(z.object({ itemId: z.string().min(1), qty: qtyDec }))
    .min(1)
    .max(200),
})

export const createPOSchema = z.object({
  supplierId: z.string().min(1),
  lines: z
    .array(z.object({ itemId: z.string().min(1), qtyRequested: qtyDec }))
    .min(1)
    .max(200),
  emailSubject: z.string().max(200).optional(),
  emailBody: z.string().max(8000).optional(),
})

export const sendPOSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().max(12000).optional(),
})

export const receivePOSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().min(1), qtyReceived: z.coerce.number().min(0) })).min(1),
})

export const expenseSchema = z.object({
  category: z.string().min(1).max(80),
  amount: moneyInt.refine((n) => n > 0, 'amount must be > 0'),
  note: z.string().max(500).default(''),
  date: z.string().optional(),
})

export const businessPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  gstin: z.string().max(15).optional().nullable(),
  state: z.string().max(80).optional(),
  address: z.string().max(500).optional(),
  invoicePrefix: z.string().max(12).optional(),
  poFollowupDays: z.number().int().min(1).max(60).optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
