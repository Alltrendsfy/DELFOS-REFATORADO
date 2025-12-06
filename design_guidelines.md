# DELFOS Trading Platform - Design Guidelines

## Design Approach

**Selected Approach:** Design System + Trading Platform Reference
**Justification:** Professional trading application requiring data density, real-time clarity, and trust. Drawing inspiration from TradingView (charts/analysis), Kraken (crypto trading), and Linear (modern productivity) for clean information architecture.

**Core Principles:**
1. **Clarity First:** Financial data must be instantly readable
2. **Trust & Security:** Professional, sober aesthetic that conveys reliability
3. **Data Density:** Display critical information without overwhelming
4. **Responsive Intelligence:** Adapt complexity based on viewport

---

## Color Palette (DELFOS Logo-Inspired)

**Logo Brand Colors:**
- Steel Blue (Primary): `#5B9FB5` - Main metallic blue from logo triangle
- Cyan Highlight: `#7DD3E8` - Bright accent from logo inner elements
- Metallic Silver: `#A8B5BD` - Text and secondary elements
- Deep Charcoal: `#1A1D23` - Dark background matching logo base

**Light Mode:**
- Primary: `#5B9FB5` (Steel Blue)
- Accent: `#7DD3E8` (Cyan Highlight)
- Secondary: `#A8B5BD` (Metallic Silver)
- Background: `#F8FAFB` (Subtle blue-tinted white)
- Surface: `#F0F4F6` (Light silver-blue)
- Text Primary: `#1E2428` (Deep charcoal)
- Text Secondary: `#6B7985` (Medium gray-blue)

**Dark Mode:**
- Primary: `#7DD3E8` (Cyan Highlight - brightened for contrast)
- Accent: `#5B9FB5` (Steel Blue - muted)
- Secondary: `#3A4550` (Dark steel)
- Background: `#1A1D23` (Deep charcoal matching logo)
- Surface: `#24272D` (Elevated dark steel)
- Text Primary: `#E8EBED` (Light silver)
- Text Secondary: `#9BA5AF` (Medium silver-blue)

**Status Colors (Consistent Both Modes):**
- Success/Long: `#10B981` (Green)
- Danger/Short: `#EF4444` (Red)
- Warning: `#F59E0B` (Amber)
- Neutral: `#6B7280` (Gray)

---

## Typography

**Font Families:**
- Primary (Interface): `'Inter', system-ui, sans-serif`
- Monospace (Numbers/Data): `'JetBrains Mono', 'Roboto Mono', monospace`

**Hierarchy:**
- Hero/Page Title: 32px, weight 700
- Section Headers: 24px, weight 600
- Card Titles: 18px, weight 600
- Body Text: 14px, weight 400
- Data/Metrics: 16px monospace, weight 500
- Small Labels: 12px, weight 500
- Micro Text: 11px, weight 400

**Financial Data Typography:**
- Use monospace for all numerical values (prices, percentages, volumes)
- Tabular figures for alignment in tables
- Color-code positive/negative values (green/red)

---

## Animations

### 3D Logo Animation

**Location:** Landing page hero section  
**Purpose:** Premium, high-tech branding effect for DELFOS logo

**CSS Classes:**
- `.logo-3d-container` - Provides 3D perspective (1000px) for child elements
- `.logo-3d-rotate` - Applies continuous 3D rotation animation

**Animation Details:**
- **Duration:** 8 seconds per rotation
- **Timing:** ease-in-out (smooth acceleration/deceleration)
- **Transform:** 360° Y-axis rotation with subtle 5° X-axis tilt at midpoint
- **Loop:** Infinite continuous animation

**Accessibility:**
- Automatically pauses for users with `prefers-reduced-motion` setting
- No layout shifts or performance impact during rotation
- GPU-accelerated transforms for smooth rendering

**Usage:**
```tsx
<div className="logo-3d-container">
  <div className="logo-3d-rotate">
    <DelfosLogo variant="icon" className="w-40 h-40 sm:w-48 sm:h-48" />
  </div>
</div>
```

---

## Layout System

**Spacing Units (Tailwind):**
Primary scale: `2, 3, 4, 6, 8, 12, 16`
- Tight spacing: `p-2, gap-2` (8px)
- Standard spacing: `p-4, gap-4` (16px)
- Section spacing: `p-6, gap-6` (24px)
- Large spacing: `p-8` (32px)

**Grid System:**
- Dashboard: 12-column grid
- Card layouts: 2-4 columns desktop, 1 column mobile
- Data tables: Full-width with horizontal scroll on mobile

**Container Widths:**
- Dashboard max-width: `max-w-[1600px]`
- Content sections: `max-w-7xl`
- Modals/Forms: `max-w-2xl`

---

## Component Library

### Navigation
**Top Bar (Fixed):**
- Height: 64px
- Logo left, language selector, dark mode toggle, user profile right
- Notification bell with unread badge
- Sticky on scroll with subtle shadow

**Sidebar (Dashboard):**
- Width: 240px desktop, collapsible to 64px (icons only)
- Drawer overlay on mobile
- Sections: Dashboard, Trading, Performance, Risk Management, Settings
- Active state: Blue accent with background tint

### Cards & Panels
**Metric Cards:**
- White/dark surface with subtle border (`border border-gray-200 dark:border-gray-700`)
- Rounded corners: `rounded-lg`
- Padding: `p-4` or `p-6`
- Shadow: `shadow-sm hover:shadow-md` transition

**Data Cards Structure:**
- Label (12px, uppercase, secondary color)
- Primary value (24px, monospace, bold)
- Change indicator (+/- with arrow icon, colored)
- Mini chart or sparkline (optional)

### Forms & Inputs
**Input Fields:**
- Height: 40px
- Border: `border border-gray-300 dark:border-gray-600`
- Rounded: `rounded-md`
- Focus: Blue ring (`ring-2 ring-blue-500`)
- Disabled: 50% opacity

**Buttons:**
- Primary: Blue background, white text, `px-6 py-2.5`
- Secondary: White/dark surface with blue border
- Danger: Red background for critical actions
- Icon buttons: 40px square
- Hover: Slight brightness increase, no heavy animations

### Data Visualization
**Tables:**
- Striped rows (subtle gray on alternate rows)
- Header: Bold, uppercase 11px, sticky on scroll
- Row height: 48px minimum
- Hover: Light background tint
- Monospace for numerical columns

**Charts (TradingView-Style):**
- Candlestick charts with volume bars below
- Grid lines: Subtle gray (`stroke-gray-200 dark:stroke-gray-700`)
- Tooltips: Dark surface with white text, rounded corners
- Time axis: Bottom, clear labels

**Real-time Indicators:**
- WebSocket status: Green dot (connected), red dot (disconnected)
- Pulse animation for live data updates (subtle)
- Staleness warning: Yellow triangle icon with tooltip

### Risk Management UI
**Three-Layer Display:**
- **Micro (Asset):** Mini cards in grid, traffic light colors
- **Meso (Cluster):** Medium cards with summary metrics
- **Macro (Global):** Fixed top bar showing portfolio-wide risk

**Circuit Breaker States:**
- Active: Green outline
- Warning: Yellow/orange outline with icon
- Paused: Red outline with lock icon

### Notifications
**Toast Style:**
- Position: Top-right
- Max 3 visible at once
- Auto-dismiss: 5 seconds (info), manual (critical)
- Types: Success (green), Error (red), Warning (yellow), Info (blue)

---

## Mobile Responsive Strategy

**Breakpoints:**
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Mobile Adaptations:**
- Sidebar → hamburger drawer
- Multi-column grids → single column stack
- Tables → horizontal scroll or card view toggle
- Charts → simplified with pinch-to-zoom
- Bottom navigation bar for key actions (Trade, Portfolio, Alerts, Profile)

---

## Animations & Microinteractions

**Minimal Animation Philosophy:**
- Data updates: Subtle flash (200ms) on change
- Loading states: Skeleton screens, not spinners
- Transitions: 150ms ease-in-out for state changes
- Avoid: Heavy animations, parallax, complex scroll effects
- Chart interactions: Smooth crosshair tracking

---

## Accessibility

- WCAG 2.1 AA compliance minimum
- Color contrast: 4.5:1 for text, 3:1 for UI components
- Keyboard navigation: Full support with visible focus states
- Screen reader: Proper ARIA labels for all interactive elements
- Financial data: Always provide text alternatives for visual indicators

---

## Images & Icons

**Icons:** Lucide React (outline and solid variants)
**Brand:** DELFOS logo - Metallic steel blue triangle with circular oracle symbol containing candlestick chart. Logo conveys precision, foresight, and professional trading.
**Logo Usage:**
  - Full logo with text: Navigation header, login/splash screens
  - Icon only (triangle): Favicon, mobile nav, compact views
  - Color: Maintain metallic steel blue (#5B9FB5) on light backgrounds, cyan highlight (#7DD3E8) on dark backgrounds
**Illustrations:** Minimal use - abstract geometric patterns for empty states only
**Photography:** No hero images - this is a data-dense application dashboard

---

## Language Support

Toggle between PT-BR, EN, ES in top navigation
All labels, tooltips, and messages externalized for translation
Number formatting: Locale-aware (decimals, thousands separators)