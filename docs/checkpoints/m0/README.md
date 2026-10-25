# M0 walking skeleton — checkpoint

Captured 2026-10-25 from the local production build (`pnpm build && pnpm start`) with
PostgreSQL 18 in Docker.

| Screenshot | What it shows |
| --- | --- |
| `01-setup.png` | First-run setup (`/setup`); only reachable while no user exists |
| `02-dashboard.png` | Signed-in shell after setup: database connected, administrator and audit counts |
| `03-plan.png` | Plan module placeholder with the M1 issue breakdown |
| `04-funding.png` | Funding module placeholder with the M2 issue breakdown |
| `05-login.png` | Sign-in page (director/finance never log in; accounts are administrator-only) |

Verified in the same run: first-run setup → signed-in dashboard → sign-out; one `users` row,
one `member_create` audit entry, one session created and revoked on sign-out; `/healthz`
returned `{"status":"ok","database":"ok"}`.

Screenshots were produced with the headless system Chromium; the script is not committed
(it performed the first-run setup with test credentials).
