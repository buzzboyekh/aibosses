// The visual system for the operator-facing pages.
//
// These screens are read from the back of a room, off a projector, while
// someone is talking over them. That is the whole brief. Two things follow:
//
// 1. Everything is a size larger than it would be on a laptop, and the greys
//    are darker than they look like they need to be — projector gamma eats
//    low contrast, and #888 on white disappears past the third row of seats.
//
// 2. Figures that came out of code are set in the system mono face at display
//    size; prose stays in the UI sans. The pitch's central claim is "a model
//    did not calculate that number", and the typography says it before anyone
//    reads a word. Never set a model-generated number in `figure`.
//
// No web fonts on purpose: the venue plan is phones on 4G and no reliance on
// venue wifi, so a font that has to be fetched is one more way for the demo
// to look broken.

export const color = {
  ink: "#14171A",
  /** Body-weight secondary text. Passes contrast on white, survives a projector. */
  muted: "#5A6169",
  /** Superseded or de-emphasised — the price you are no longer paying. */
  faint: "#8B939B",

  // Two border weights, because they do different jobs. A hairline between
  // table rows can be faint; the outline of a card cannot. The dashboard had
  // already been through a contrast pass that pushed its card borders to
  // #949494 — a near-white edge is invisible once a projector has washed the
  // image out, and a card with no visible edge is not a card.
  /** Dividers inside a block: table rows, a rule under a header. */
  line: "#DDE1E4",
  /** The outline of a card or an input. Must survive projection. */
  edge: "#A9B1B7",

  surface: "#FFFFFF",
  ground: "#F7F8F9",

  // Semantics, unchanged from the dashboard so the demo does not change
  // colour language halfway through.
  good: "#047857",
  goodBg: "#ECFDF5",
  goodLine: "#A7F3D0",
  warn: "#B45309",
  warnBg: "#FFFBEB",
  warnLine: "#FDE68A",
  bad: "#B91C1C",
  badBg: "#FEF2F2",
  badLine: "#FECACA",
  active: "#4338CA",
} as const;

const SANS = "system-ui, -apple-system, 'Segoe UI', 'Noto Sans TC', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const font = { sans: SANS, mono: MONO } as const;

/* ---------------------------------------------------------------- layout */

// Note: the white canvas these pages assume is painted on <body> in
// app/layout.tsx. Without it a browser set to prefer dark gives them dark ink
// on a dark background, which is one laptop setting away from wrecking a demo.
export const page: React.CSSProperties = {
  maxWidth: 940, margin: "0 auto", padding: "40px 24px 80px",
  color: color.ink, fontFamily: SANS,
};

export const title: React.CSSProperties = {
  fontSize: 26, fontWeight: 650, letterSpacing: "-0.01em", margin: 0,
};

export const lede: React.CSSProperties = {
  fontSize: 15, lineHeight: 1.6, color: color.muted,
  margin: "8px 0 0", maxWidth: 620,
};

export const section: React.CSSProperties = {
  fontSize: 12, letterSpacing: "0.09em", textTransform: "uppercase",
  color: color.muted, fontWeight: 650, margin: "36px 0 12px",
};

export const card: React.CSSProperties = {
  border: `1px solid ${color.edge}`, borderRadius: 12,
  padding: "18px 20px", marginBottom: 12, background: color.surface,
};

export const empty: React.CSSProperties = {
  border: `1px dashed ${color.edge}`, borderRadius: 12, padding: 24,
  textAlign: "center", color: color.muted, fontSize: 15,
};

/** Errors state what happened and stay legible. They do not apologise. */
export const errorNote: React.CSSProperties = {
  ...empty, borderStyle: "solid", borderColor: color.badLine,
  background: color.badBg, color: color.bad, textAlign: "left",
};

/* ------------------------------------------------------------------ text */

export const body: React.CSSProperties = { fontSize: 15, lineHeight: 1.55 };
export const meta: React.CSSProperties = { fontSize: 13, color: color.muted };

/** A figure the code worked out. The one thing on the page set in mono. */
export const figure: React.CSSProperties = {
  fontFamily: MONO, fontVariantNumeric: "tabular-nums",
  fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1,
};

/** The same, at table scale. */
export const figureSm: React.CSSProperties = {
  fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 15,
};

/** A figure that has been superseded — the price before, the wrong count. */
export const figureWas: React.CSSProperties = {
  ...figureSm, color: color.faint, textDecoration: "line-through",
};

/* ----------------------------------------------------------------- forms */

export const label: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: 13, color: color.muted, flex: "1 1 220px",
};

export const input: React.CSSProperties = {
  padding: "9px 11px", fontSize: 15, fontFamily: "inherit",
  border: `1px solid ${color.edge}`, borderRadius: 7, color: color.ink,
};

export const button: React.CSSProperties = {
  padding: "10px 18px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
  background: color.ink, color: color.surface,
  border: "none", borderRadius: 7, cursor: "pointer",
};

export const buttonBusy: React.CSSProperties = {
  ...button, background: color.faint, cursor: "not-allowed",
};

/* --------------------------------------------------------------- banners */

const banner: React.CSSProperties = {
  marginTop: 12, padding: "14px 16px", borderRadius: 10,
  fontSize: 15, lineHeight: 1.5, border: "1px solid",
};
export const bannerGood: React.CSSProperties = {
  ...banner, background: color.goodBg, borderColor: color.goodLine, color: color.good,
};
export const bannerWarn: React.CSSProperties = {
  ...banner, background: color.warnBg, borderColor: color.warnLine, color: color.warn,
};
export const bannerBad: React.CSSProperties = {
  ...banner, background: color.badBg, borderColor: color.badLine, color: color.bad,
};
export const bannerPlain: React.CSSProperties = {
  ...banner, background: color.ground, borderColor: color.line, color: color.ink,
};
