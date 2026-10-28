# Add Lead — UX spec

Goal: log a new lead in under 15 seconds. Implemented in
`src/app/leads-management/components/AddLeadForm.tsx` (form),
`src/components/ui/Modal.tsx` (`variant="drawer"`), `leadPaste.ts` (quick paste),
`/api/leads/exists` + `lead_exists()` (inline "already exists" hint).

## 1. Information architecture

| Tier | Fields | Rule |
| --- | --- | --- |
| **Core (required)** | Full name · Phone **or** email (one is enough) · Lead source | Save is blocked until all three are satisfied. |
| **Secondary (optional, collapsed under "+ More details")** | Assign to (admin/manager only, max 2) · Stage · First follow-up date · Location · Developer → Project · Referral · Notes | Never required. Stage defaults to the last one used. |
| **Hidden / automated** | `created_by` (current user) · auto-assignee (self, or rotation when enabled) · source id · session memory of last source/stage · duplicate flags (server decides) · created-at | Never shown as inputs. |

Not in the form today: budget, tags, timeline, full address. The lead model supports
budget; adding it is a one-field change inside the collapsed panel.

## 2. User flow

1. Click **Add lead** (or the mobile FAB). A drawer slides in from the end edge on desktop; a bottom sheet rises on phones. The list stays visible behind it.
2. **Name** is focused immediately. Type the name.
3. `Tab` → **Phone** (numeric/tel keypad, formats as you type, understands `+20`, `0020`, `01x`). Email is the next field; either one satisfies the contact rule.
4. While typing, a debounced check runs. If the lead exists, a soft amber note appears under the contact fields. Saving is still allowed.
5. `Tab` → **Source** chips. The last used source is pre-selected; arrow/Tab + Enter/Space changes it.
6. `Enter` (or `Ctrl/Cmd+Enter`) saves. Or press **Save & add another** — the form clears, focus returns to Name, the source is kept.
7. A toast shows **"Lead created — {name}"** with a **View lead** action. The new lead is already at the top of the list (optimistic insert, no reload).
8. Shortcut for pasted leads: tap **Fill from text** (or paste into the Quick paste box). Name, phone and email are filled; focus lands on the first missing field.

## 3. Layout

### Desktop drawer (≥ 640px, width ~28rem, full height)

```
┌───────────────────────────────────────┐
│ New lead                          [×] │  sticky header
│ Name, phone or email, source          │
├───────────────────────────────────────┤
│ ┌┄ Quick paste ───────── [Fill from ┐ │
│ ┆  Paste a WhatsApp message…  text]  ┆ │
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ │
│ ┌───────────────────────────────────┐ │
│ │ Full name *                       │ │
│ │ [👤 Ahmed Hassan               ]  │ │
│ │ Phone / Email *  (one is enough)  │ │
│ │ [📞 010 1234 5678  (large)     ]  │ │
│ │ [✉  ahmed@email.com            ]  │ │
│ │ ⚠ This lead already exists (soft) │ │
│ │ Lead source *                     │ │
│ │ (Facebook✓) (Google) (Referral) + │ │
│ └───────────────────────────────────┘ │
│ ┌┄ + More details            ⌄ ┄┄┄┄┐ │  collapsed accordion
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ │
├───────────────────────────────────────┤
│ Enter or Ctrl+Enter to save           │  sticky footer
│ [Cancel]   [Save & add another][Save lead]
└───────────────────────────────────────┘
```

### Mobile bottom sheet (< 640px, up to 92dvh)

```
┌─────────────────────────┐
│ New lead            [×] │
├─────────────────────────┤
│ Quick paste  [Fill text]│
│ Full name *             │
│ Phone / Email *         │  tel keypad (digits, +)
│ Lead source *  chips    │
│ + More details      ⌄   │
├─────────────────────────┤  footer lifts above the keyboard
│ [        Save lead     ]│  primary, thumb zone, 48px
│ [ Save & add another   ]│
│ [        Cancel        ]│
└─────────────────────────┘
```

Specs: inputs 16px (no iOS zoom), 48px high (phone 56px), all targets ≥ 44px, sections as cards, safe-area padding on the footer, panel animates with `drawer-enter` (respects reduced motion, RTL-aware).

## 4. Micro-interactions

- **Auto-focus:** Name on open (120 ms after mount) and again after *Save & add another*.
- **Keyboard:** `Tab` order = Quick paste → Name → Phone → Email → Source chips → More details → Save. `Enter` saves from any input; on a button it keeps its native action (selects a chip). `Ctrl/Cmd+Enter` saves from anywhere, including Notes. `Esc` closes. Collapsed details are `inert` (not tabbable).
- **Phone:** formats while typing, caret preserved, `+20 / 0020 / 010` normalised on save.
- **Validation:** inline, on blur. Phone-or-email is cross-checked (editing one re-validates the other). Name and source show their own message.
- **Duplicate hint:** 450 ms debounce, spinner text while checking, amber note when found. It never names the owner and has no link: the adder may not be allowed to see the original lead. On save a duplicate is not created; it goes to the lead owner's Duplicates page.
- **Quick paste:** parses name / phone / email from free text (WhatsApp prefixes, timestamps and Arabic-Indic digits are ignored/converted). Toast says how many fields were filled, or that nothing was found. Clipboard button needs browser permission; if denied it falls back to the text box.
- **Feedback:** toast "Lead created — {name}" + **View lead**; list updates optimistically; no page reload.
