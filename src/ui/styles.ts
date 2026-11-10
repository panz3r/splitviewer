// Single source of truth for the app's stylesheet (design tokens + utilities).
// Splitwise-adjacent tone: fresh green, soft paper, rounded, friendly copy.
// All pages render through PageShell so this is the only CSS that ships.

const TOKENS = `
  :root {
    --green: #1cb96e;
    --green-dark: #169a5c;
    --green-soft: #e7f8f0;
    --ink: #1d2521;
    --muted: #6b7a72;
    --paper: #ffffff;
    --soft: #f4f7f5;
    --line: #e3eae6;
    --danger: #c0392b;
    --radius-card: 14px;
    --radius-btn: 10px;
    --shadow: 0 1px 3px rgba(29, 37, 33, 0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #e6ece9;
      --muted: #93a49b;
      --paper: #17211c;
      --soft: #1e2a24;
      --line: #2c3a33;
      --green-soft: #173a2c;
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }
  }
`;

const BASE = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Lato", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--soft);
    color: var(--ink);
    line-height: 1.55;
  }
  h1, h2, h3, .logo, .btn, .btn--primary, .badge, dt {
    font-family: "Montserrat", "Lato", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  a { color: var(--green-dark); }
  code { background: var(--soft); padding: .1rem .4rem; border-radius: 6px; font-variant-numeric: tabular-nums; }
  img { max-width: 100%; height: auto; border-radius: var(--radius-card); box-shadow: var(--shadow); }
  :focus-visible { outline: 2px solid var(--green); outline-offset: 2px; border-radius: 4px; }
`;

const LAYOUT = `
  .shell { min-height: 100dvh; display: flex; flex-direction: column; }
  .container { width: 100%; max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }
  .pagepad { padding: 2rem 0 3rem; flex: 1; }
`;

const HEADER_FOOTER = `
  .topbar { background: var(--paper); border-bottom: 1px solid var(--line); }
  .topbar .container { display: flex; align-items: center; justify-content: space-between; height: 3.4rem; }
  .logo { font-weight: 800; font-size: 1.15rem; text-decoration: none; color: var(--ink);
          display: flex; align-items: center; gap: .45rem; }
  .logo .leaf { color: var(--green); }
  .navlinks { display: flex; gap: 1.1rem; }
  .navlinks a { color: var(--muted); text-decoration: none; font-size: .95rem; }
  .navlinks a:hover { color: var(--green-dark); }
  .footer { border-top: 1px solid var(--line); padding: 1.2rem 0 2rem; color: var(--muted); font-size: .88rem; }
  .footer .container { display: flex; flex-wrap: wrap; gap: .8rem 1.4rem; justify-content: space-between;
                       align-items: center; }
  .footer a { color: var(--muted); }
`;

const COMPONENTS = `
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
    padding: 0 1.1rem; min-height: 2.55rem; height: 2.55rem; border-radius: var(--radius-btn);
    border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-weight: 600;
    font-size: .95rem; text-decoration: none; cursor: pointer;
  }
  /* Uniform action rows: forms must not stretch their buttons */
  form .btn { height: 2.55rem; }
  .actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .7rem; }
  .actions .neg { margin-left: auto; }
  .actions form { display: inline-flex; margin: 0; }
  .btn--primary { background: var(--green); border-color: var(--green); color: #fff; }
  .btn--primary:hover { background: var(--green-dark); }
  .btn--danger { border-color: #d9a1a1; color: var(--danger); }
  .card {
    background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-card);
    box-shadow: var(--shadow); padding: 1.25rem 1.4rem;
  }
  .card + .card { margin-top: 1rem; }
  .badge { font-size: .78rem; font-weight: 600; padding: .15rem .55rem; border-radius: 999px;
           background: var(--green-soft); color: var(--green-dark); }
  .badge--off { background: var(--soft); color: var(--muted); }
  .flash { padding: .7rem 1rem; border-radius: var(--radius-btn); background: var(--green-soft);
           color: var(--ink); margin: 1rem 0; }
  .flash--err { background: #fdecec; color: var(--danger); }
  .muted { color: var(--muted); }
  .small { font-size: .88rem; }
`;

const HERO = `
  .hero { text-align: center; padding: 3.2rem 0 2.2rem; }
  .hero h1 { font-size: clamp(1.9rem, 4.5vw, 2.7rem); line-height: 1.15; margin: 0 0 .8rem; }
  .hero p { color: var(--muted); font-size: 1.12rem; max-width: 34rem; margin: 0 auto 1.6rem; }
  .hero .cta { display: flex; gap: .8rem; justify-content: center; flex-wrap: wrap; }
  .steps { display: grid; gap: 1rem; grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 640px) { .steps { grid-template-columns: 1fr; } }
  /* The sibling .card margin breaks grid row alignment - neutralize in steps */
  .steps .card { margin-top: 0; }
  .step { text-align: center; padding: 1.2rem 1rem; }
  /* Dashboard: group cards grid (M4) */
  .ggrid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
  @media (min-width: 768px) { .ggrid { grid-template-columns: 1fr 1fr; } }
  .gcard .row { display: flex; justify-content: space-between; align-items: center; gap: .8rem; }
  .gcard .gname { font-weight: 700; }
  /* Public page ledger (M4) */
  .pub-title { font-size: clamp(1.5rem, 4vw, 2rem); margin: .2rem 0 .2rem; }
  .pub-sub { color: var(--muted); font-size: .9rem; margin: 0 0 1.2rem; }
  .cur h2 { display: flex; align-items: center; gap: .5rem; margin: .2rem 0 .4rem; font-size: 1.05rem; }
  .ledger td { padding: .6rem 0; border-bottom: 1px solid var(--line); }
  .ledger tr:last-child td { border-bottom: none; }
  .ledger tbody tr:hover td { background: var(--soft); }
  .step .n { display: inline-flex; width: 2.1rem; height: 2.1rem; border-radius: 999px;
             background: var(--green); color: #fff; font-weight: 700; align-items: center;
             justify-content: center; margin-bottom: .6rem; }
  .step h3 { margin: 0 0 .3rem; font-size: 1.05rem; }
  .step p { margin: 0; color: var(--muted); font-size: .95rem; }
  .section-title { font-size: 1.35rem; margin: 2.6rem 0 1rem; }
  .checklist { list-style: none; padding: 0; margin: 0; }
  .checklist li { padding: .25rem 0; }
  .checklist li::before { content: "✓ "; color: var(--green); font-weight: 700; }
`;

export const APP_STYLE = `${TOKENS}${BASE}${LAYOUT}${HEADER_FOOTER}${COMPONENTS}${HERO}`;
