import { Fragment } from 'react'
import { Hero3D } from './components/Hero3D'
import { DashboardTour } from './components/DashboardTour'
import { SITE } from './site'

const FEATURES = [
  {
    kicker: 'Billing',
    title: 'GST bills in seconds',
    body: 'CGST+SGST or IGST picked automatically from place of supply. Clean bills for unregistered shops too — no forced GST fields.',
  },
  {
    kicker: 'Inventory',
    title: 'Stock that cannot lie',
    body: 'Every sale, receipt and adjustment is a ledger entry. Low-stock alerts surface before the shelf goes empty.',
  },
  {
    kicker: 'Customers',
    title: 'Know who owes you',
    body: 'Records with running balances and chronological statements. Outstanding and overdue are always one glance away.',
  },
  {
    kicker: 'Purchasing',
    title: 'Supplier orders, drafted',
    body: 'Low stock becomes a draft email per supplier. You review, you press send — nothing ever goes out on its own.',
  },
  {
    kicker: 'Reports',
    title: 'Profit, net of everything',
    body: 'Revenue minus cost of goods minus expenses, with GST collected shown separately — never counted as your money.',
  },
  {
    kicker: 'Access',
    title: 'Owner and staff, separated',
    body: 'Staff bill and manage stock; reports, settings and voids stay owner-only — enforced on the server, with email 2FA.',
  },
]

const STEPS = [
  { title: 'Sell', body: 'Pick a customer, scan or search items, totals update live.' },
  { title: 'Collect', body: 'Record Cash, Card, UPI or bank payments — partials included.' },
  { title: 'Know', body: 'Balance, statement and P&L update from the same records.' },
]

const INSIDE = [
  ['Dashboard', "Today's sales, low stock, pending orders at a glance."],
  ['Billing', 'Invoice builder, payments, PDFs, WhatsApp share.'],
  ['Customers', 'Statements, balances, payment history.'],
  ['Inventory', 'Products, stock movements, reorder levels.'],
  ['Orders', 'Draft, preview, send and receive supplier orders.'],
  ['Reports', 'Profit & loss with GST shown separately.'],
  ['Settings', 'Business profile, taxes, team, verification.'],
]

const FAQS = [
  {
    q: 'Does it work offline?',
    a: 'Not yet — ecoBills needs a connection today. Offline-tolerant reads are on the roadmap, but we will not claim offline until retries can never duplicate a bill or payment.',
  },
  {
    q: 'Does it file GST returns?',
    a: 'No. ecoBills calculates CGST/SGST/IGST correctly and keeps GST out of your revenue, but GSTR filing and e-invoicing are future milestones — we will not claim government integration before it exists.',
  },
  {
    q: 'Is my shop data safe?',
    a: 'Data lives in managed Postgres with automated backups. Money is stored as integer paise, stock as an append-only ledger, and every sensitive action is audit-logged.',
  },
  {
    q: 'How much does it cost?',
    a: 'Free pilot for early shops while core workflows land. Paid plans start low and grow only as the product earns it — contact us to join the pilot.',
  },
]

export function App() {
  return (
    <>
      <header className="nav">
        <div className="wrap nav-inner">
          <a className="brand font-display" href="#top" aria-label="ecoBills home">
            <img src="./logo.png" alt="" />
            <span>
              <span style={{ color: 'var(--accent-text)' }}>eco</span>Bills
            </span>
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#tour">Tour</a>
            <a href="#features">Features</a>
            <a href="#inside">Inside the app</a>
            <a href="#pricing">Pricing</a>
            <a href="#download">Download</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <a className="btn btn-ghost" href={SITE.releasesUrl} target="_blank" rel="noreferrer">
              Download
            </a>
            <a className="btn btn-primary" href={SITE.appUrl}>
              Open app
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-label="Introduction">
          <Hero3D />
          <div className="hero-scrim" />
          <div className="wrap">
            <div className="hero-copy">
              <span className="eyebrow">mtrxDevs · ecoBills</span>
              <h1 className="font-display">
                One place to <span className="eco">run your shop.</span>
              </h1>
              <p className="sub">
                Billing, stock, customers and profit for small Indian businesses — built like accounting software, priced
                like a utility. Your books stay correct even when prices change, stock moves, or two people bill at once.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary" href={SITE.appUrl}>
                  Open the app
                </a>
                <a className="btn btn-ghost" href="#download">
                  Get Windows app
                </a>
              </div>
              <p className="hero-note tnum">Free pilot · No card · Your data stays yours</p>
            </div>
          </div>
        </section>

        <section className="block" id="tour" aria-label="Guided tour">
          <div className="wrap">
            <h2 className="section-title font-display">Walk the dashboard in 3D</h2>
            <p className="section-sub">
              Every destination, one stop at a time — the camera moves, the module lights up, the callout says what
              it is. Pick a stop or let it tour itself.
            </p>
            <DashboardTour />
          </div>
        </section>

        <section className="block" id="features" aria-label="Features">
          <div className="wrap">
            <h2 className="section-title font-display">Everything a day in the shop needs</h2>
            <p className="section-sub">
              Six modules, one shared ledger. Nothing here is a mock — every card below is a working part of the product.
            </p>
            <div className="grid-3">
              {FEATURES.map((f) => (
                <article className="card" key={f.title}>
                  <span className="kicker">{f.kicker}</span>
                  <h3 className="font-display">{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="block" aria-label="How it works">
          <div className="wrap">
            <h2 className="section-title font-display">Sale to statement in three moves</h2>
            <p className="section-sub">The cashier flow the whole product is shaped around.</p>
            <div className="steps">
              {STEPS.map((s, i) => (
                <Fragment key={s.title}>
                  <article className="card">
                    <span className="kicker">0{i + 1}</span>
                    <h3 className="font-display">{s.title}</h3>
                    <p>{s.body}</p>
                  </article>
                  {i < STEPS.length - 1 ? (
                    <span className="step-arrow" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        <section className="block" id="inside" aria-label="Inside the app">
          <div className="wrap">
            <h2 className="section-title font-display">Inside the app</h2>
            <p className="section-sub">Seven destinations, one thing per screen. Built for a shop owner, not a power user.</p>
            <div className="chip-row">
              {INSIDE.map(([name, desc]) => (
                <span className="chip" key={name} title={desc}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="block" id="pricing" aria-label="Pricing">
          <div className="wrap">
            <h2 className="section-title font-display">Priced like a utility</h2>
            <p className="section-sub">Pilot shops use ecoBills free while core workflows land. Paid plans start low and grow only as the product earns it.</p>
            <div className="grid-2">
              <article className="card">
                <span className="kicker">Pilot</span>
                <h3 className="font-display">Free</h3>
                <p>Full product for early shops. Help shape the roadmap; keep your data forever.</p>
              </article>
              <article className="card">
                <span className="kicker">Growth</span>
                <h3 className="font-display">
                  From ₹499<span style={{ fontSize: 14, fontWeight: 400 }}>/mo</span>
                </h3>
                <p>Paid tiers unlock as accounting depth, GST tooling and multi-device polish ship. No surprises.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="block" id="download" aria-label="Download">
          <div className="wrap">
            <h2 className="section-title font-display">Get ecoBills</h2>
            <p className="section-sub">Use it in the browser today, or install the native Windows shell around the same app.</p>
            <div className="grid-3">
              <article className="card">
                <span className="kicker">Windows</span>
                <h3 className="font-display">Desktop app</h3>
                <p>Full product with system tray and low-stock notifications. Grab the installer from Releases.</p>
                <p style={{ marginTop: 14 }}>
                  <a className="btn btn-primary" href={SITE.releasesUrl} target="_blank" rel="noreferrer">
                    Download .exe
                  </a>
                </p>
              </article>
              <article className="card">
                <span className="kicker">Browser</span>
                <h3 className="font-display">Web app</h3>
                <p>Nothing to install — the complete product, same login everywhere.</p>
                <p style={{ marginTop: 14 }}>
                  <a className="btn btn-ghost" href={SITE.appUrl}>
                    Open in browser
                  </a>
                </p>
              </article>
              <article className="card">
                <span className="kicker">Android</span>
                <h3 className="font-display">
                  Dashboard app<span className="soon">Coming soon</span>
                </h3>
                <p>Today's sales, low stock and pending orders on your phone. Billing stays on desktop until it is ready.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="block faq" id="faq" aria-label="Questions">
          <div className="wrap">
            <h2 className="section-title font-display">Honest answers</h2>
            <p className="section-sub">What the product does and does not do yet.</p>
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="site">
        <div className="wrap">
          <span className="font-display" style={{ color: 'var(--ink)' }}>
            <span style={{ color: 'var(--accent-text)' }}>eco</span>Bills
          </span>
          <span>by mtrxDevs</span>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={SITE.appUrl}>Open app</a>
          <a href={`mailto:${SITE.contactEmail}`}>Contact</a>
        </div>
      </footer>
    </>
  )
}
