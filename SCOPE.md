# ecoBills v0.1.1 — Scope

Source of truth for what is IN vs OUT of v0.1. Do not scope-creep mid-build.

## In scope
- Inventory & stock ledger (append-only `stock_ledger`, derived current stock)
- Customers & suppliers CRUD
- Invoice / billing with tax (GST CGST+SGST / IGST split, non-GST bill fallback) + payments
- Credit notes for returns
- Profit & loss dashboard (accrual basis, net of credit notes, last-cost stock valuation)
- Automated ordering: draft → preview → send → receive (human must click Send; idempotent send)
- Single business per account, single location
- Role-based access: Owner / Staff (server-side enforcement, see permission matrix in spec §6.1)
- Web (full), Windows via Tauri (full), Android via Capacitor (dashboard-only build)

## Explicitly deferred (do NOT build in v0.1, do NOT architect against)
- Multi-branch / multi-location
- Barcode scanner SDK integration (HID keyboard-wedge scanners already work via focused text field; camera scanning deferred to v0.2)
- WhatsApp / SMS integration (except the cheap WhatsApp deep-link Share action on invoices)
- AI-predicted reorder quantities ("Polish with AI" prose rewrite is in scope; quantity prediction is not)
- Multi-currency in actual use (schema tolerates it via `Business.currency`)
- Full-featured native mobile app (dashboard-only shell in v0.1)
- Offline-first sync, including offline read caching
- Multi-supplier price comparison per item (one `primary_supplier_id` in v0.1)
- FIFO / weighted-average inventory costing (v0.1 uses last-cost)
