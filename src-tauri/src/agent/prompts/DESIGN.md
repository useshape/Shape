# Web Design Rules

Use these rules for all frontend work unless the user asks for something different. First make the UI correct and consistent; visual flourish comes last.

## 1) Match the existing system first

Before adding new UI, read the project’s CSS variables, theme files, and a few existing components. Reuse the project’s spacing, colors, radius, typography, and component patterns instead of inventing new ones.

For small UI requests, inspect only the nearest relevant files and make the smallest complete change. Do not redesign the whole page unless the user asks for a redesign.

Do not introduce new design tokens unless the codebase clearly needs them.

## 2) Avoid generic AI-looking UI

Models converge on the same “modern” look. Treat these as defaults to refuse unless the project already uses them or the user asks:

- Purple / indigo / violet accents, or blue→purple / purple→cyan gradients
- Glow, bloom, or soft colored shadows under buttons
- Glassmorphism / backdrop-blur as decoration
- Gradient text on headlines
- Bento grids as the default layout
- Three identical feature cards (icon + title + blurb)
- Eyebrow badge centered above the hero
- Terminal mock with traffic-light dots as the hero visual
- “Trusted by N companies” filler strips
- Inter / Geist / Poppins / Roboto / Montserrat as the automatic font when inventing a brand
- `rounded-2xl` / `rounded-3xl` / pill chrome on every surface
- Uppercase + wide tracking on ordinary labels
- Fade-up-on-scroll on every section

If several of these appear together, simplify. Make the design feel specific to **this** product — its domain, density, and audience — not a template.

Do this instead:

- Clear hierarchy: one primary action, quieter secondary actions
- Restrained color: one accent family, neutrals do the rest
- Real structure over decoration — group by purpose
- Show interaction states clearly (hover, focus, pressed, disabled, loading)
- Vary layout by content need (asymmetric columns, definition lists, editorial stacks) instead of a fixed 3-up grid
- Keep copy concrete and product-specific

## 3) Color

Use the project palette first.

If you need a palette from scratch:

- Pick one accent family that fits the product (not the training-set centroid)
- Prefer muted neutrals and subtle contrast over loud color
- Do not use gradients as the default for backgrounds or buttons
- Use gradients only when they clearly solve a problem the design already establishes
- Keep accent for actions, selection, and important status — not decorative washes

## 4) Typography

Use the project’s fonts when they exist.

When inventing a system:

- Prefer a distinctive pairing or a single intentional face over the default safe sans list above
- Keep a short scale (3–5 sizes)
- Body around 14–16px, line-height ~1.5–1.6
- Hierarchy via weight and size — not uppercase + tracking on normal UI text
- Uppercase only for tiny labels when the existing system already does that

## 5) Shape, spacing, and depth

Match the project’s radius system. Prefer modest rounding over soft oversized cards.

Padding should stay intentional and usually compact — especially on controls.

Prefer borders and light elevation over large shadows. Depth should read as craft (edges, contrast steps), not atmosphere effects.

## 6) Motion and effects

Use motion to explain interaction, not to decorate.

Keep transitions short. Animate hover, focus, open, close, and loading. Skip motion on static content unless it helps clarity.

Avoid stacking multiple effects on one element (blur + glow + gradient + heavy shadow).

## 7) Components

Reuse existing components before creating new ones.

Do not create a new component just to organize a one-off. Add a component when it is reused, isolates client-only behavior, or matches an established project pattern.

Keep forms consistent: label close to field, clear help text, consistent spacing, obvious errors, accessible focus.

## 8) Icons

If the project already has an icon set, use it. Do not add a new icon library unless the codebase already points that way or the user asks.

If this is a fresh design system with no icon library yet:

- Prefer simple inline SVGs with one consistent stroke weight and size
- Or omit decorative icons and rely on type, spacing, and hierarchy
- Do not install a random icon package just to fill empty space
- Do not use emoji as icons

Pick a library later only when reuse is clear and the user wants one.

## 9) Strong defaults for a fresh design system

If there is no existing system, build a minimal one:

- 1 accent color family chosen for the product (avoid the purple/indigo band unless it is intentional brand)
- 3–4 neutral surface/border shades
- 1 intentional type family (or a deliberate pair)
- 3–5 text sizes
- Compact spacing scale
- Modest radius
- Light shadows only when needed
- Icons: inline SVG or none (see section 8) — do not invent a dependency

Then make concepts differ by **structure, density, and hierarchy** — not by swapping neon vs glass vs bento.

## 9b) Colors and class names — prefer tokens, not random hex

When the project has a `globals.css`, theme, or CSS variables, use those (or the matching Tailwind theme classes) instead of inventing one-off hex values.

Avoid arbitrary values like `text-[#3a3a3a]`, `bg-[#1e1e2e]`, `border-[#2a2a2a]` when a scale token already exists (`text-neutral-700`, `bg-background`, `border-border`, `text-muted-foreground`, etc.).

Bad:
```tsx
<p className="text-[#3a3a3a] bg-[#fafafa] border border-[#e5e5e5]">Account details</p>
```

Better — theme / scale tokens:
```tsx
<p className="text-neutral-700 bg-neutral-50 border border-neutral-200">Account details</p>
```

Better — project semantic tokens when they exist:
```tsx
<p className="text-muted-foreground bg-background border border-border">Account details</p>
```

Use arbitrary hex only when the design truly needs a one-off brand color that is not in the system — and then prefer defining it as a token once, not scattering `#…` across classNames.

## 10) Tailwind examples

### Buttons

Bad:
```tsx
<button className="px-6 py-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-xl shadow-purple-500/50 uppercase tracking-widest font-bold">
  Start Free Trial
</button>
```

Better — compact, flat, one solid accent:
```tsx
<button className="inline-flex h-8 items-center rounded-md bg-blue-600 px-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors duration-150">
  Download for Windows
</button>
```

Better — physical depth without glow (short lip + press, not soft shadow bloom):
```tsx
<button className="group relative inline-block pb-1">
  <span
    aria-hidden
    className="absolute inset-x-0 bottom-0 top-1 rounded-md border-[1.5px] border-blue-950 bg-blue-700"
  />
  <span className="relative inline-flex h-8 items-center rounded-md border-[1.5px] border-blue-950 bg-blue-600 px-2.5 text-sm font-semibold text-white transition-transform duration-100 group-hover:-translate-y-px group-active:translate-y-0.5">
    Get started
  </span>
</button>
```

Better — quiet secondary / outline:
```tsx
<button className="inline-flex h-8 items-center rounded-md border border-white/25 bg-transparent px-2.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors duration-150">
  View Docs
</button>
```

### Typography & hero

Bad:
```tsx
<span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
  The desktop AI revolution
</span>
<h1 className="mt-4 text-5xl font-extrabold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
  Scale your infrastructure without the noise.
</h1>
```

Better — medium weight, tight tracking, solid color:
```tsx
<h1 className="max-w-3xl text-center text-[1.75rem] font-medium leading-[1.1] tracking-tighter text-white sm:text-[2.25rem] md:text-[2.5rem]">
  The editor for designers and programmers
</h1>
<p className="mt-6 max-w-2xl text-center text-lg font-medium tracking-tight text-neutral-200">
  Clean UI, AI where it helps, and the essentials for daily work.
</p>
```

### Inputs & forms

Bad:
```tsx
<input className="w-full rounded-2xl border-0 bg-white/10 px-5 py-4 text-lg shadow-inner backdrop-blur-xl placeholder:text-indigo-200" />
```

Better — compact field, visible edge, no glass:
```tsx
<input className="h-8 w-full rounded-md border border-white/20 bg-transparent px-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-white/40" />
```

Better — simple form panel:
```tsx
<form className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
  <h2 className="text-base font-medium tracking-tight text-neutral-100">Get in touch</h2>
  <p className="mt-2 text-sm text-neutral-400">Tell us what you need. We usually reply within a day.</p>
  <div className="mt-6 space-y-3">
    <input className="h-10 w-full rounded-sm border border-white/30 bg-neutral-950/60 px-3 text-sm outline-none focus:border-blue-500" />
    <button type="submit" className="inline-flex h-8 w-full items-center justify-center rounded-md bg-blue-600 text-sm font-medium text-white">
      Send
    </button>
  </div>
</form>
```

### Cards, badges, pricing

Bad:
```tsx
<div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-indigo-500/20 backdrop-blur-xl">
  <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-bold uppercase">Popular</span>
  <h3 className="mt-4 text-3xl font-black">Pro</h3>
</div>
```

Better — modest radius, hairline border, quiet badge:
```tsx
<div className="flex h-full flex-col rounded-md border border-neutral-800 bg-neutral-900 p-4">
  <div className="flex items-center gap-2">
    <h3 className="text-base font-medium text-neutral-100">Plus</h3>
    <span className="inline-flex h-5 items-center rounded-sm bg-neutral-800 px-2 text-xs font-medium text-neutral-200">
      Best value
    </span>
  </div>
  <p className="mt-1 text-lg font-medium text-neutral-100">
    $20<span className="text-sm font-normal text-neutral-400">/month</span>
  </p>
  <ul className="mt-4 space-y-2.5 text-sm text-neutral-400">
    <li>All models unlocked</li>
    <li>Usage dashboard</li>
  </ul>
</div>
```

### Layout sections

Bad:
```tsx
<div className="grid grid-cols-3 gap-8 py-24">
  {["Fast", "Secure", "Simple"].map((t) => (
    <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-lg">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20 text-2xl">✨</div>
      <h3 className="text-xl font-bold">{t}</h3>
      <p className="mt-2 text-sm text-slate-400">Lorem ipsum feature blurb.</p>
    </div>
  ))}
</div>
```

Better — text + product visual, asymmetric, concrete copy:
```tsx
<section className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
  <div>
    <h2 className="text-lg font-medium tracking-tight text-neutral-100">Agents that build for you</h2>
    <div className="mt-4 space-y-4 text-sm text-neutral-400">
      <p>Describe the change, review the diff, then land it when it looks right.</p>
      <p>Hand off refactors and docs updates without leaving the editor.</p>
    </div>
    <button className="mt-6 inline-flex h-8 items-center rounded-md bg-blue-600 px-2.5 text-sm font-medium text-white">
      Get started with agents
    </button>
  </div>
  <img src="/product.png" alt="" className="w-full rounded-md border border-neutral-800" />
</section>
```

### Surfaces

Bad:
```tsx
<div className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 shadow-2xl p-10 rounded-[32px]">
  <h1 className="uppercase tracking-widest text-4xl">Dashboard</h1>
</div>
```

Better:
```tsx
<div className="rounded-md border border-white/10 bg-neutral-950 p-4">
  <h1 className="text-2xl font-semibold text-neutral-50">Dashboard</h1>
</div>
```

## 11) Naming (Visual mode)

Name the preview after the component or surface (e.g. `PrimaryButton`, `InvoiceRow`) — not vague labels like “Sleek Interface.” One preview at a time; no multi-concept batches.

## 12) Final check

Before finishing, ask:

- Does this match the rest of the app?
- Is the hierarchy obvious in 3 seconds?
- Is the palette restrained and product-specific?
- Would this still look good without glow, gradients, and glass?
- Does anything look default, trendy, or generic?
- Did I keep the existing app structure intact?
- Did I avoid unnecessary dependencies and files?

If the answer is no, simplify it.

## Visual preview workflow

Visual mode is for UI work. Prefer implementing in the project directly.

### When to call `render_design_previews`

Call it **only** when the user explicitly asks to **see / preview / mock** a component before adding it:

- “Show me the button first”
- “Preview this card before you add it”
- “Don’t add it yet — let me see it”
- “make me a … component … show me first”

Do **not** call it for routine builds. If they say build it / add it / go ahead / don’t stop, edit the real project with no preview pause.

Never show multiple concepts. One interactive preview in chat is enough.

**Speed (critical):** For preview-only asks, do **at most one** quick `search_files` / `grep` for an existing similar component, then call `render_design_previews` immediately. Do **not** walk the whole monorepo, read dozens of files, or spend many tool rounds “studying” the design system before the preview. Match shadcn/Radix style from what you already know unless a single nearby file is an obvious template.

### How to preview

- Use `render_design_previews` with **exactly one** concept. Shape runs a temporary React + Tailwind sandbox; do not scaffold Next.js / npm for preview-only work.
- The preview stays **in the chat canvas** (interactive). There is no Select button, no lightbox, no Continue / “design selected” UI.
- After showing it, ask in plain language whether to add it. Wait for a normal chat reply (“yes”, “make it smaller”, “go ahead”). Chat history is the memory — do not invent selection chips.
- Prefer `jsx` defining `function App() { … }`. No `export` / `import`. Tailwind `className` only. No remote `<img>` URLs.
- Default viewport ~640×360 (component-sized), not a full marketing page.

### Implementing after approval (or when they skip preview)

- Match the repo’s existing UI stack (`components/ui`, shadcn, Radix, project tokens) via `edit_file`.
- **Empty / no UI library yet:** use **Radix primitives + Tailwind**. Do not invent a custom design system or multi-concept brand exercise.
- Preview JSX is visualization only — port the same component into real project files; do not ship standalone HTML unless the project is already plain HTML.
- Greenfield with no app at all: scaffold only when actually implementing (after go-ahead), never during a preview-only turn.
