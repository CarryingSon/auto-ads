# Design Guidelines: Rapid Ads Dashboard

## Design Approach

**Selected Framework**: Design System Approach using **Linear** and **Stripe Dashboard** as primary references
**Rationale**: This is a complex, data-intensive productivity tool requiring clarity, efficiency, and professional polish. Linear's clean information hierarchy and Stripe's sophisticated data handling patterns provide the perfect foundation.

## Core Design Principles

1. **Clarity Over Decoration**: Every visual element serves a functional purpose
2. **Progressive Disclosure**: Reveal complexity gradually through the wizard flow
3. **Status Transparency**: Always show connection states, validation results, and job progress
4. **Confident Actions**: Clear primary/secondary action hierarchy at each step

---

## Typography System

**Font Stack**: Inter (via Google Fonts CDN)

- **Headings**: 
  - H1 (Page titles): text-2xl, font-semibold
  - H2 (Section headers): text-xl, font-semibold
  - H3 (Card titles): text-lg, font-medium
- **Body**: text-base, font-normal
- **Labels**: text-sm, font-medium (uppercase for status badges)
- **Helper text**: text-sm, text-gray-600
- **Data/Numbers**: font-mono for IDs, indices, technical values

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **4, 6, 8, 12** consistently
- Component padding: p-6 or p-8
- Section spacing: gap-8 or gap-12
- Tight groupings: gap-4

**Container Strategy**:
- Dashboard max-width: max-w-7xl mx-auto
- Wizard steps: max-w-4xl mx-auto (focused workflow)
- Full-width tables when needed with inner padding

---

## Component Library

### Navigation & Structure

**Top Navigation Bar**:
- Fixed header with logo left, connections status indicators right
- Height: h-16
- Quick access: "Connections" link, user profile dropdown
- Active route highlighted with subtle border-b-2

**Sidebar Navigation** (Dashboard):
- Width: w-64, fixed position
- Sections: Dashboard, Bulk Ads, Connections, History
- Active state: subtle background fill + border-l-2 accent

**Wizard Progress Indicator**:
- Horizontal step tracker at top
- Three circles connected by lines
- States: Completed (filled), Current (outlined + pulse), Upcoming (ghost)
- Labels beneath: "Upload", "Parse & Preview", "Launch"

### Core UI Elements

**Cards & Panels**:
- Border: border border-gray-200
- Background: bg-white
- Radius: rounded-lg
- Shadow: shadow-sm (subtle elevation)
- Padding: p-6 or p-8

**Tables** (File/Ad Preview):
- Zebra striping: alternate row backgrounds
- Header: bg-gray-50, text-sm font-medium, sticky
- Cells: py-4 px-6, align content appropriately
- Status column: Always rightmost
- Row hover: subtle bg-gray-50 transition

**Status Badges**:
- Pill shape: px-3 py-1, rounded-full, text-xs font-medium uppercase
- Success: green background + green text
- Warning: amber background + amber text  
- Error: red background + red text
- Neutral: gray background + gray text
- Include icon (Heroicons) before text

**Buttons**:
- Primary: solid background, semibold text, px-6 py-3, rounded-lg
- Secondary: outline variant, same padding
- Danger: red variant for destructive actions
- Icon buttons: Square (h-10 w-10), centered icon
- Loading state: Spinner icon + "Processing..." text

**File Upload Zone**:
- Large dashed border: border-2 border-dashed border-gray-300
- Center-aligned icon (cloud upload) + text
- Padding: py-12
- Hover state: border-gray-400 + bg-gray-50
- Active drag: border-blue-500 + bg-blue-50

**Form Inputs**:
- Height: h-12
- Border: border border-gray-300, rounded-lg
- Focus: ring-2 ring-blue-500, border-transparent
- Label above: text-sm font-medium mb-2
- Helper text below: text-sm text-gray-600 mt-1
- Error state: border-red-500 + red helper text

**Dropdowns/Selects**:
- Same styling as inputs
- Chevron down icon right-aligned
- Menu: shadow-lg, rounded-lg, max-height with scroll

### Data Display

**Connection Cards** (/dashboard/connections):
- Grid: grid-cols-1 md:grid-cols-2, gap-6
- Each card shows:
  - Service logo/icon (top-left)
  - Connection status badge (top-right)
  - "What we access" bullet list (text-sm)
  - Action buttons at bottom (Connect/Disconnect/Test)

**Validation Results Panel**:
- Collapsible sections per ad
- Summary header: Ad index + headline + status icon
- Expanded view: Field-by-field validation with checkmarks/x-marks
- Missing fields highlighted in red with specific error messages

**Dry-Run Preview**:
- List view with dividers between ads
- Each preview shows: Video thumbnail, Index, Headline, Primary text (truncated), CTA, URL
- Expand/collapse details
- Overall summary at top: "X ads ready, Y warnings, Z errors"

**Job Progress Tracker**:
- Linear progress bar with percentage
- Current stage label (UPLOADING, CREATING_CREATIVES, etc.)
- Real-time log feed below (monospace font, scrollable, max-height)
- Per-ad status mini-table: Index | Status | Meta Ad ID (when created)

### Feedback & Empty States

**Empty State** (No uploads yet):
- Centered icon + heading + description
- Primary CTA button
- Padding: py-20

**Errors/Warnings**:
- Toast notifications (top-right stack)
- Alert banners (top of sections with appropriate color)
- Inline field errors (below inputs)

**Success Confirmations**:
- Green checkmark icon
- Success message
- "View in Meta" or "Create Another" action buttons

---

## Wizard Flow Specifics

**Step 1 - Upload**:
- Split layout: Upload zone (left 60%), Instructions sidebar (right 40%)
- File table below upload zone
- "Next" button: bottom-right, disabled state when validation fails

**Step 2 - Parse & Preview**:
- "Extract Copy" button top-center (prominent)
- Results appear as expandable ad cards in vertical list
- Validation summary panel at top
- Navigation: Back (secondary) | Next (primary)

**Step 3 - Match & Launch**:
- Three sections: Meta Account Selection | Ad Mapping Preview | Launch Controls
- Each section in a card with clear headers
- "Dry Run" button (secondary) before "Launch" (primary, larger)
- Launch confirmation modal with final review

---

## Images

**No hero image** - This is a utility dashboard, not a marketing site.

**Icons**: Use Heroicons (outline for navigation, solid for status indicators)
- Upload: cloud-arrow-up
- Success: check-circle
- Warning: exclamation-triangle
- Error: x-circle
- Connection: link
- Video: film
- Document: document-text

**Service Logos**: Display Google Drive and Meta logos at actual size (40×40px) in connection cards

---

## Animations

**Minimal, Purposeful Only**:
- Wizard step transitions: Fade in/out content areas (200ms)
- Progress bar: Smooth width transitions (300ms)
- Button hover: Subtle scale (1.02) and shadow increase
- Loading spinners: Continuous rotation
- Toast notifications: Slide in from top-right
- **No** scroll animations, parallax, or decorative effects