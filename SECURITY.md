# Security policy

Strapla is a public, MIT-licensed application, but production deployments hold
sensitive financial data. Please do not open a public issue for a vulnerability.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:

https://github.com/tahopetis/strapla/security/advisories/new

(The **Report a vulnerability** button on the repository's **Security** tab opens
the same form.) Include the affected route or feature, reproduction steps and
the impact you believe it has. Do not include production data.

## What runs automatically

Every pull request and push runs the security checks described in
[`docs/agents/security.md`](docs/agents/security.md): a fail-closed
`security-gate` (gitleaks, osv-scanner, semgrep, Trivy config), CodeQL,
dependency review on pull requests, GitHub secret scanning with push
protection, and a report-only Trivy image scan of the published container.

A secret committed to the repository is treated as an incident: the value is
removed, the history is cleaned if needed, and the credential is rotated.
