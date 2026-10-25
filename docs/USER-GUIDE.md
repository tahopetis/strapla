# User guide — Strapla administrators

Strapla is the single source of truth for the IT portfolio: plan it, fund it, execute it, spend it
and report it in one place. Every account is an **administrator** in the first release.

## Signing in

- Your administrator creates your account and gives you an initial password out of band. Sign in at
  `/login`; if you were given a temporary password, ask an administrator to set a new one after your
  first sign-in (password reset is on the Members page).
- Only administrators can create accounts. There is no self-service signup.
- Sign out from the top-right button. Deactivating an account or resetting its password ends all its
  sessions immediately.

## The portfolio, top-down

```
Strategic plan (2026–2030)
└── Strategic initiative (SI) — five-year envelope
    └── Annual plan (one per fiscal year)
        └── Annual program (one SI, capex + opex budgets, carry-in)
            └── Project year allocation (the project's slice in that year)
                └── Commitments and spending (January release)
```

Recurring operations (leased lines, maintenance, subscriptions) sit under the annual plan, opex only,
with no SI link.

### Plan

1. **Strategic plan & SIs** (`Plan → Strategic plan & SIs`): create the plan horizon, then each SI
   with owner, objective, envelope and the prior program budget consumed (opening balance). Activate
   the plan when the SIs are in place.
2. **Annual plans** (`Plan → Annual plans`): create the FY plan inside the horizon and activate it.
3. **Programs**: inside an annual plan, add the programs (one SI each, capex/opex budgets, carry-in).
   A program that continues last year's work links to the previous program — that is the program
   thread.
4. **Projects & ijin prinsip** (`Plan → Projects`): create the project under its originating program,
   record the full-life figures (allocated, submitted price, final deal price) and the ijin prinsip
   record (number, date, approved amount, approver, document link).
5. **Recurring operations**: on the annual plan page, add the opex-only items with budget and carry-in.
6. **Opening balances** (`Plan → Opening balances`): the signed-off FY2026 bridge. Enter the opening
   figures on the entity forms, then reconcile the totals on this page before go-live.
7. **Annual allocations**: on the project page, add the allocation for each active fiscal year, with
   carry-in. The program page shows how much is still unallocated.

### Funding rules you will see

- **Remaining** = allocation + carry-in − open commitments − current-year spend (per component).
- **Unallocated program budget** = budget + carry-in − allocations, always visible.
- **Flags** warn but never block: final deal price above the approved budget (ijin prinsip), above
  the submitted price, lifetime commitments above the contract value, allocation above the program
  budget, cumulative program budgets above the SI envelope.
- Amounts are whole Rupiah; dots are ignored when typing (`1.234.567` = `1234567`).

### Reports

`Reports` has the SI five-year view, the annual plan by SI and program, the project register and
budget versus actual. Every report has **CSV** and **XLSX** downloads and a **Print / PDF** button
(the print view hides the app menu and fits A4 landscape).

Commitments and actual spend columns fill in with the January execution release; until then those
columns are marked M3.

### Administration

- **Members** (`Administration → Members`): create accounts, reset passwords, revoke sessions,
  deactivate/reactivate. Accounts are never deleted; the last active account and self-deactivation
  are blocked.
- **Audit trail** (`Administration → Audit trail`): every change with actor, time, before/after and
  reason; filter by entity or actor. Every record also has a **Change history** card.
- **Corrections**: nothing is hard-deleted. Cancel with a void + reason; corrections are audited
  edits. Closed years are read-only except audited administrator corrections.

## Good practices

- One record, one project: never duplicate a multi-year project for a new year — add its annual
  allocation instead.
- Record why a change was made in the reason field; the reason is what directors and finance will see.
- Export and review the four reports before each director/finance review.

## Not in the first release

- Spend entries, commitments and settlement (January 2027 execution release)
- Manual year close and carry-over (before the FY2027 close)
- File uploads (documents are referenced by number and link)
- CSV import, email notifications, per-vendor quote records, external SSO

## Help and defects

Raise defects in the GitHub issue tracker (`tahopetis/strapla`) with the page, the steps, what you
expected and a screenshot. Data-value defects that block the plan are treated as release blockers.
