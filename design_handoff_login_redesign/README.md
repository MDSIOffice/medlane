# Handoff: Medlane OS Login Page Redesign

## Overview
Redesigned sign-in page for Medlane OS (Medlane Diagnostic Solutions, Inc.), matching the visual identity of the marketing site at medlanesolutions.com. Replaces the previous cluttered, floating-icon background with a clean split layout: a brand panel on the left and a focused sign-in form on the right.

## About the Design Files
The file in this bundle (`Medlane Login.dc.html`) is a **design reference built in HTML** — a prototype showing the intended look, layout, and copy. It is not production code to copy directly into the app. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, whatever the Medlane OS frontend already uses) using its established components, routing, and auth logic — or, if no frontend framework exists yet for this screen, choose the most appropriate one and implement there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final. Recreate pixel-perfectly using the codebase's existing form components and input/button patterns where they exist; otherwise implement styles as specified below.

## Screens / Views

### Sign In
**Purpose:** Authenticate a Medlane OS user with email + password.

**Layout:**
- Full-viewport two-column grid: `grid-template-columns: minmax(420px, 42%) 1fr`.
- Left column: brand hero panel, dark gradient background, fixed padding `56px 56px 44px`, flex column with `justify-content: space-between` (logo/tagline block at top, stats row at bottom).
- Right column: centered flex container, max-width `400px` form column, `padding: 40px`.
- Responsive note: below ~900px viewport width, stack to a single column (hero panel collapses to a shorter top banner, or hides tagline/stats — use judgment based on the app's existing breakpoints).

**Left panel components:**
- Background: `linear-gradient(160deg, #0a2540 0%, #0d3b63 45%, #0077bd 100%)`.
- Decorative dot-grid overlay (radial-gradient dots, 28px grid, ~10% white opacity) — optional, low priority to replicate exactly; a subtle static pattern is fine.
- Two soft radial glow blobs: one teal (`rgba(15,139,139,0.35)`) top-right, one orange (`rgba(245,130,10,0.20)`) bottom-left.
- Logo mark: 44×44px white rounded-square (radius 10px) containing a simple blue chevron "M" glyph (see Assets). Wordmark "MEDLANE" (Sora 700, 18px, white) + subtitle "Diagnostic Solutions, Inc." (12px, #b9d3e8) beside it.
- Pill badge: "Licensed Importer & Distributor Since 1997" — pill shape, `rgba(255,255,255,0.12)` fill, `1px solid rgba(255,255,255,0.18)` border, 12px text, color `#dcecf9`.
- Headline: "Precision diagnostics, delivered." — Sora 800, 44px, line-height 1.12, white, letter-spacing -0.01em.
- Body copy: "Sign in to Medlane OS to coordinate equipment, reagents, and field service across every branch — in real time." — Inter 16px, `#c6dcee`, max-width 420px.
- Stats row (top border `1px solid rgba(255,255,255,0.15)`, 40px top padding, 36px gap): three stat blocks, each a number (Sora 700, 22px, white) over a label (12.5px, `#b9d3e8`):
  - "29+" / "Years of operation"
  - "2" / "Branches, NCR & Bicol"
  - "FDA" / "Licensed & compliant"

**Right panel (form) components:**
- Small header row: 32×32px logo mark (blue `#0077bd` square, radius 10px, white chevron) + "Medlane OS" (Sora 700, 14px, `#0a2540`) / "Diagnostic Solutions System" (11.5px, `#7791a6`).
- Heading: "Sign in to your account" — Sora 700, 28px, `#0a2540`.
- Subtext: "Enter your credentials to access your workspace." — 14.5px, `#6b8296`.
- Form fields, 20px vertical gap:
  - **Email** — label (13px, weight 600, `#0a2540`), text input, placeholder "name@medlane.local", padding `13px 14px`, border-radius 8px, border `1px solid #d7e2ea`, background `#fbfcfd`, font 14.5px.
  - **Password** — label same style, with a right-aligned "Forgot password?" link (12.5px, brand blue) on the same row as the label. Password input, same styling as email, placeholder masked dots.
  - **Remember me** checkbox — "Remember email and password on this device", 13.5px, `#4d6478`, checkbox accent-color `#0077bd`.
  - **Login button** — full width, padding 14px, border-radius 8px, background `linear-gradient(120deg, #0077bd, #0f8b8b)`, white text, Sora 600, 15px, box-shadow `0 10px 24px -8px rgba(0,119,189,0.45)`.
- Bottom accent bar: 4px tall, full width, border-radius 4px, `linear-gradient(90deg, #0077bd, #0f8b8b, #f5820a)` — echoes the tri-color brand mark.
- Footer copy: "© 2026 Medlane Diagnostic Solutions, Inc. · Licensed Importer" — centered, 12px, `#9db0bf`.

## Interactions & Behavior
- Standard form submit on Login button click; wire to existing auth endpoint/logic.
- "Forgot password?" links to the existing password-reset flow (already present on medlanesolutions.com as a "Create New Password" screen — reuse that).
- Remember-me checkbox should persist email/password locally per existing app behavior (this mirrors copy already used on the live site's login form).
- Inputs should get a visible focus state (e.g. border color shift to brand blue + subtle box-shadow) — not implemented in the static mock, but expected in production.
- No loading/error states designed — apply the codebase's existing patterns for auth errors (invalid credentials, network failure) and a loading state on the Login button (spinner or disabled state).

## State Management
- Two controlled fields: `email`, `password`.
- One boolean: `rememberMe`.
- Submit state: idle / submitting / error (message).

## Design Tokens

**Colors**
- Navy (dark text / hero bg base): `#0a2540`
- Navy mid (hero gradient): `#0d3b63`
- Brand blue (primary): `#0077bd`
- Teal (secondary accent, gradients): `#0f8b8b`
- Orange (tertiary accent, used sparingly): `#f5820a`
- Hero body text: `#c6dcee` / `#b9d3e8` / `#dcecf9`
- Form label text: `#0a2540`
- Form helper/subtext: `#6b8296` / `#7791a6` / `#9db0bf` / `#4d6478`
- Input border: `#d7e2ea`
- Input background: `#fbfcfd`
- Page background: `#eef3f7`

**Typography**
- Headings: Sora (weights 500/600/700/800), Google Fonts
- Body/UI: Inter (weights 400/500/600/700), Google Fonts

**Spacing / Radius**
- Card/input radius: 8px
- Logo mark radius: 10px
- Pill badge radius: 999px (full)
- Left panel padding: 56px 56px 44px
- Form gap: 20px between fields

**Shadows**
- Login button: `0 10px 24px -8px rgba(0,119,189,0.45)`

## Assets
- **Logo mark**: recreated as inline SVG in the mock — a simple chevron "M" glyph in brand blue on white (large version) or white on blue (small version). The real Medlane logo (`medlane.jpg` on medlanesolutions.com) should be substituted in production — use the actual brand asset, not the inline SVG approximation.
- No photography used on this screen.

## Files
- `Medlane Login.dc.html` — the full design reference (HTML/inline CSS). View in a browser to see the live layout; treat all inline styles as the source of truth for the values listed above.
