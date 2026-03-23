# Super Wallet — Design System (iOS 26 Liquid Glass)

Guide complet pour reproduire le style visuel de Super Wallet dans un autre projet. Couvre le dark mode, le light mode, tous les composants, et les patterns Tailwind utilisés.

## Stack

- **Tailwind CSS** (utility-first)
- **React 18** + TypeScript
- **Dark mode** : via `class` strategy (`darkMode: 'class'` dans tailwind.config)
- **Font** : SF Pro Display / SF Pro Text (system font stack Apple)
- **Mode switching** : classe `dark` / `light` sur `<html>`, toggle via React context

---

## 1. Design Tokens

### CSS Custom Properties (`:root`)

```css
:root {
  --lg-bg: #0a0a0f;                          /* Page background (near-black) */
  --lg-bg-grouped: #111116;                   /* Grouped content bg */
  --lg-bg-secondary: rgba(255,255,255,0.06);  /* Secondary surfaces */
  --lg-text-primary: rgba(255,255,255,0.92);  /* Main text */
  --lg-text-secondary: rgba(255,255,255,0.55);/* Subtitle, labels */
  --lg-text-tertiary: rgba(255,255,255,0.30); /* Hints, timestamps */
  --lg-fill-primary: rgba(255,255,255,0.12);  /* Active fills */
  --lg-fill-secondary: rgba(255,255,255,0.08);/* Hover fills */
  --lg-fill-tertiary: rgba(255,255,255,0.06); /* Subtle fills */
  --lg-separator: rgba(255,255,255,0.12);     /* Dividers */
  --lg-accent: #00d4aa;                       /* Primary accent (emerald) */
  --lg-accent-blue: #0088ff;                  /* Secondary accent (blue) */
  --lg-card-radius: 26px;                     /* Cards */
  --lg-sheet-radius: 34px;                    /* Sheets, modals, elevated cards */
  --lg-shadow: 0px 8px 40px 0px rgba(0,0,0,0.12);
}
```

### Tailwind Extended Colors

```js
// tailwind.config.js
colors: {
  super: {
    50:  '#e6fff7', 100: '#b3ffe6', 200: '#80ffd4', 300: '#4dffc3',
    400: '#1affb1', 500: '#00d4aa', 600: '#00b892', 700: '#009c7a',
    800: '#008062', 900: '#00644a', 950: '#003d2e',
  },
  accent: { blue: '#38bdf8', cyan: '#22d3ee', purple: '#a78bfa' },
  surface: {
    dark: '#0a0a0f',
    light: '#f2f2f7',
    card: 'rgba(255, 255, 255, 0.06)',
    'card-light': 'rgba(255, 255, 255, 0.55)',
    border: 'rgba(255, 255, 255, 0.15)',
    hover: 'rgba(255, 255, 255, 0.10)',
    'hover-light': 'rgba(0, 0, 0, 0.04)',
  },
}
```

---

## 2. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
             system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

### Scale (iOS style — tracking = letter-spacing)

| Usage | Size | Weight | Tracking | Tailwind |
|-------|------|--------|----------|----------|
| Page title | 34px | Bold | +0.4px | `text-[34px] font-bold tracking-[0.4px]` |
| Section title | 17px | Semibold | -0.43px | `text-[17px] font-semibold tracking-[-0.43px]` |
| Body | 17px | Medium | -0.43px | `text-[17px] font-medium tracking-[-0.43px]` |
| Label | 13px | Semibold | -0.08px | `text-[13px] font-semibold tracking-[-0.08px]` |
| Caption / micro | 10px | Bold | wider | `text-[10px] uppercase tracking-wider` |
| Numbers | any | Bold | — | `tabular-nums` (monospaced digits) |

### Text Color Pattern (React)

```tsx
const { isDark } = useThemeContext();
const textPrimary   = isDark ? 'text-white'      : 'text-black/85';
const textSecondary = isDark ? 'text-white/60'    : 'text-black/55';
const textTertiary  = isDark ? 'text-white/40'    : 'text-black/40';
```

---

## 3. Backgrounds

### Page Background

```css
/* Dark */  background-color: #0a0a0f;
/* Light */ background-color: #f2f2f7;
```

```tsx
/* Body transitions smoothly between modes */
body { transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
```

### Anti-zoom (mobile)

```css
html {
  -webkit-text-size-adjust: 100%;
  touch-action: manipulation;
}
```

---

## 4. Cards

### Standard Card (`.glass` / `glassCard`)

Solid opaque card, no blur. Main container for content sections.

```css
/* Dark */
.glass {
  background: #1c1c1e;
  border-radius: 26px;
}

/* Light */
.light .glass {
  background: #ffffff;
}
```

**Tailwind inline pattern** (most common) :

```tsx
const glassCard = `rounded-[26px] ${isDark ? 'bg-[#1c1c1e]' : 'bg-black/[0.04]'}`;

// Usage
<div className={`${glassCard} p-4`}>
  ...
</div>
```

### Elevated Card (`.glass-elevated`)

Frosted glass — for sheets, modals, hero cards. 34px radius.

```css
/* Dark */
.glass-elevated {
  background: rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 34px;
  box-shadow: 0px 8px 40px 0px rgba(0,0,0,0.12),
              inset 0 0.5px 0 0 rgba(255,255,255,0.15);
}

/* Light */
.light .glass-elevated {
  background: rgba(255, 255, 255, 0.70);
  border-color: rgba(255, 255, 255, 0.60);
  box-shadow: 0px 8px 40px 0px rgba(0,0,0,0.08),
              inset 0 0.5px 0 0 rgba(255,255,255,0.6);
}
```

### Card padding standard

```
p-4 (16px)  — normal cards
p-5 (20px)  — settings sections
p-3 (12px)  — compact/nested cards
```

### Inner card (nested section inside a card)

```tsx
<div className={`mx-3 mb-3 px-3 py-2.5 rounded-[20px] ${
  isDark ? 'bg-white/[0.04]' : 'bg-black/[0.02]'
}`}>
```

---

## 5. Buttons

### Primary Button (accent color)

```css
.super-btn-primary {
  background: #2c2c2e;           /* Dark mode */
  border: none;
  border-radius: 100px;          /* Full pill */
  padding: 13px 20px;
  color: #00d4aa;                /* Accent */
  font-size: 17px;
  letter-spacing: -0.43px;
}

.light .super-btn-primary {
  background: rgba(0, 0, 0, 0.85);
  color: white;
}
```

**Tailwind inline** (le plus utilisé) :

```tsx
<button className={`w-full py-2.5 rounded-full text-[15px] font-bold tracking-[-0.43px]
  transition-all active:scale-[0.96] ${
    isDark
      ? 'bg-[#00d4aa]/15 text-[#00d4aa] hover:bg-[#00d4aa]/25'
      : 'bg-[#00d4aa]/10 text-[#00916e] hover:bg-[#00d4aa]/15'
  }`}>
  Confirm
</button>
```

### Secondary Button

```css
.super-btn-secondary {
  background: #2c2c2e;
  color: rgba(255, 255, 255, 0.70);
  border-radius: 100px;
}

.light .super-btn-secondary {
  background: rgba(120, 120, 128, 0.12);
  color: rgba(0, 0, 0, 0.70);
}
```

### Small Action Button (deposit, withdraw, etc.)

```tsx
<button className={`px-3 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.08px]
  transition-colors ${
    isDark
      ? 'bg-[#00d4aa]/10 text-[#00d4aa] hover:bg-[#00d4aa]/20'
      : 'bg-[#00d4aa]/10 text-[#00916e] hover:bg-[#00d4aa]/15'
  }`}>
  Deposit
</button>
```

### Destructive / Red Button

```tsx
className={isDark
  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
  : 'bg-red-500/10 text-red-500 hover:bg-red-500/15'}
```

### Button Press Animation

```css
active:scale-[0.96]   /* All buttons shrink slightly on tap */
```

### Loading Spinner (inside buttons)

```tsx
<span className="w-4 h-4 border-2 border-[#00d4aa] border-t-transparent rounded-full animate-spin" />
```

---

## 6. Inputs

```css
.super-input {
  background: #1c1c1e;
  border: none;
  border-radius: 26px;
  height: 52px;
  padding: 0 16px;
  font-size: 17px;
  color: rgba(255, 255, 255, 0.92);
}

.super-input::placeholder { color: rgba(255, 255, 255, 0.30); }
.super-input:focus {
  box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.15);
  outline: none;
}

/* Light */
.light .super-input {
  background: white;
  color: rgba(0, 0, 0, 0.85);
}
.light .super-input::placeholder { color: rgba(60, 60, 67, 0.30); }
```

---

## 7. Bottom Navigation (Floating Pill Tab Bar)

iOS App Store-style floating tab bar :

```tsx
<nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 pb-[25px] pt-[16px] px-[25px]">
  <div className="flex items-center gap-1 px-2 py-1.5 rounded-full
    bg-white/[0.08]
    backdrop-blur-[16px] backdrop-saturate-[180%]
    border border-white/[0.20]
    shadow-[0px_8px_40px_0px_rgba(0,0,0,0.12)]">

    {/* Each tab */}
    <button className={`flex flex-col items-center gap-0.5 px-4 py-[6px] rounded-full
      transition-all duration-500 active:scale-[0.96] ${
        active
          ? 'bg-white/[0.12] text-[#00d4aa]'
          : 'text-white/[0.55] hover:text-white/[0.70]'
      }`}>
      {icon}
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>

  </div>
</nav>
```

### Active Tab Gradient Text

```css
.bottom-nav-active span {
  background: linear-gradient(135deg, #5eead4 0%, #818cf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Content Padding (avoid overlap)

```tsx
<main className="pb-28">  {/* 112px bottom padding */}
```

---

## 8. Badges & Tags

### Side Badge (Long/Short)

```tsx
<span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
  isLong
    ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
    : 'bg-red-500/10 text-red-400'
}`}>
  {isLong ? 'LONG' : 'SHORT'}
</span>
```

### Status Badge

```tsx
// Premium
<span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">Premium</span>

// Open
<span className="bg-yellow-500/10 text-yellow-400">open</span>

// Closed
<span className={isDark ? 'bg-white/[0.06] text-white/40' : 'bg-black/[0.04] text-black/35'}>closed</span>
```

---

## 9. Settings Section Pattern

```tsx
<div className={`rounded-[26px] p-5 mb-4 ${isDark ? 'bg-[#1c1c1e]' : 'bg-white'}`}>
  {/* Section title */}
  <h2 className={`text-[13px] font-semibold tracking-[-0.08px] mb-3 ${
    isDark ? 'text-white/[0.55]' : 'text-black/55'
  }`}>
    Section Name
  </h2>

  {/* Toggle row */}
  <button className={`w-full flex items-center justify-between py-3 px-1 ${
    isDark ? 'text-white/[0.92]' : 'text-black/85'
  }`}>
    <div className="flex items-center gap-3">
      {/* Icon circle */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        isDark ? 'bg-[#2c2c2e]' : 'bg-gray-100'
      }`}>
        <svg ... />
      </div>
      <span className="text-[17px] font-medium tracking-[-0.43px]">Toggle Label</span>
    </div>

    {/* iOS toggle switch */}
    <div className={`w-[51px] h-[31px] rounded-full p-[2px] transition-colors ${
      enabled ? 'bg-[#00d4aa]' : isDark ? 'bg-[#2c2c2e]' : 'bg-gray-300'
    }`}>
      <div className={`w-[27px] h-[27px] rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-[20px]' : 'translate-x-0'
      }`} />
    </div>
  </button>
</div>
```

---

## 10. Overlays & Modals

### Modal Backdrop

```tsx
<div className="fixed inset-0 z-50 flex items-end justify-center">
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onClick={onClose} />
  <div className={`relative w-full max-w-md rounded-t-[34px] p-5 pb-8 ${
    isDark ? 'bg-[#1c1c1e]' : 'bg-white'
  }`}>
    {/* Content */}
  </div>
</div>
```

### Toast / Notification

```tsx
<div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60]
  px-4 py-2 rounded-full
  bg-white/10 backdrop-blur-md
  text-white/70 text-xs font-medium
  animate-fade-in">
  Coming Soon
</div>
```

---

## 11. Dividers

```tsx
<div className={`border-t ${isDark ? 'border-white/[0.08]' : 'border-black/[0.06]'} mx-1`} />
```

---

## 12. PnL Colors

```tsx
const pnlPositive = pnl >= 0;

// Text
className={pnlPositive ? 'text-[#00d4aa]' : 'text-red-400'}

// Background row
className={pnlPositive ? 'bg-[#00d4aa]/10' : 'bg-red-500/10'}

// Button color by PnL
className={pnlPositive
  ? isDark ? 'bg-[#00d4aa]/15 text-[#00d4aa]' : 'bg-[#00d4aa]/10 text-[#00916e]'
  : isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-500/10 text-red-500'}
```

---

## 13. Animations

### Tailwind Config Keyframes

```js
animation: {
  'fade-in': 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  'slide-up': 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  'glow-pulse': 'glowPulse 3s ease-in-out infinite',
},
keyframes: {
  fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
  slideUp: {
    '0%': { opacity: '0', transform: 'translateY(10px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
  glowPulse: {
    '0%, 100%': { opacity: '0.4' },
    '50%': { opacity: '0.8' },
  },
}
```

### CSS Keyframes (globals.css)

```css
@keyframes flashFade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes popIn {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
```

### Transition Defaults

```
transition-all duration-500    /* Cards, backgrounds (slow, smooth) */
transition-all duration-300    /* Text color, numbers */
transition-colors              /* Simple color swaps */
active:scale-[0.96]            /* Button press */
cubic-bezier(0.4, 0, 0.2, 1)  /* iOS spring-like easing */
```

---

## 14. Slider (Range Input — iOS style)

```css
.perp-leverage-slider {
  -webkit-appearance: none;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
}

.perp-leverage-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 38px;
  height: 24px;
  border-radius: 100px;
  background: white;
  box-shadow: 0px 0.5px 4px rgba(0,0,0,0.12), 0px 6px 13px rgba(0,0,0,0.12);
}

/* Light mode */
.light .perp-leverage-slider {
  background: rgba(120, 120, 120, 0.20);
}
```

---

## 15. Scrollbar

```css
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

/* Light */
.light ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); }
```

---

## 16. Glow Effects

### Subtle Ambient Glow (behind cards)

```css
.glass-glow::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(0,212,170,0.08), rgba(0,136,255,0.04));
  z-index: -1;
  filter: blur(24px);
  opacity: 0.3;
}

/* Disabled in light mode */
.light .glass-glow::before { display: none; }
```

### Box Shadow Glow Scale

```js
boxShadow: {
  'glow-sm': '0 0 20px rgba(0, 212, 170, 0.06)',
  'glow-md': '0 0 40px rgba(0, 212, 170, 0.08)',
  'glow-lg': '0 0 60px rgba(0, 212, 170, 0.12)',
}
```

---

## 17. Selection

```css
/* Dark */
::selection { background: rgba(0, 212, 170, 0.25); color: white; }

/* Light */
.light ::selection { background: rgba(0, 0, 0, 0.12); color: black; }
```

---

## 18. Color Palette Summary

### Dark Mode

| Element | Color |
|---------|-------|
| Page bg | `#0a0a0f` |
| Card bg | `#1c1c1e` |
| Elevated bg | `rgba(255,255,255,0.10)` + blur |
| Primary text | `rgba(255,255,255,0.92)` |
| Secondary text | `rgba(255,255,255,0.55)` |
| Tertiary text | `rgba(255,255,255,0.30)` |
| Accent | `#00d4aa` (emerald) |
| Accent blue | `#0088ff` |
| Red (loss) | `text-red-400` / `bg-red-500/15` |
| Green (profit) | `text-[#00d4aa]` / `bg-[#00d4aa]/15` |
| Borders | `rgba(255,255,255,0.08)` to `0.20` |
| Button bg | `#2c2c2e` |
| Button hover | `#3a3a3c` |

### Light Mode

| Element | Color |
|---------|-------|
| Page bg | `#f2f2f7` |
| Card bg | `#ffffff` or `bg-black/[0.04]` |
| Elevated bg | `rgba(255,255,255,0.70)` + blur |
| Primary text | `rgba(0,0,0,0.85)` |
| Secondary text | `rgba(0,0,0,0.55)` |
| Tertiary text | `rgba(0,0,0,0.40)` |
| Accent | `#00916e` (darker emerald for contrast) |
| Red (loss) | `text-red-500` / `bg-red-500/10` |
| Green (profit) | `text-[#00916e]` / `bg-[#00d4aa]/10` |
| Borders | `rgba(0,0,0,0.06)` |
| Button bg | `rgba(0,0,0,0.85)` (primary), `rgba(120,120,128,0.12)` (secondary) |

---

## 19. Quick Start (new project)

### 1. Install

```bash
npm install tailwindcss @tailwindcss/forms
```

### 2. tailwind.config.js

Copy the full config from Section 2 (colors, fonts, borderRadius, animations, boxShadow).

### 3. globals.css

Copy the full CSS from `super-extension/src/styles/globals.css` — it contains all glass classes, light mode overrides, slider styles, and keyframes.

### 4. Theme Context (React)

```tsx
const ThemeContext = createContext({ isDark: true, toggle: () => {} });

function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### 5. Use in components

```tsx
const { isDark } = useThemeContext();
const textPrimary = isDark ? 'text-white' : 'text-black/85';
const glassCard = `rounded-[26px] ${isDark ? 'bg-[#1c1c1e]' : 'bg-black/[0.04]'}`;
```

---

## Source Files

| File | Contains |
|------|----------|
| `super-extension/src/styles/globals.css` | All CSS: tokens, glass classes, light mode, slider, keyframes |
| `super-extension/tailwind.config.js` | Full Tailwind config: colors, fonts, radius, shadows, animations |
| `super-extension/src/components/BottomNav.tsx` | Floating pill tab bar |
| `super-extension/src/contexts/ThemeContext.tsx` | Dark/light toggle context |
| `super-extension/src/fullpage/pages/Settings.tsx` | Settings section pattern with iOS toggles |
