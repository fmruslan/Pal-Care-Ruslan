# Contributing

Thanks for your interest in Pal Care. This is primarily a solo hackathon project, and contributions should respect its small, auditable architecture.

## Development conventions

1. Open an issue describing one problem, the outcome and acceptance criteria.
2. Use a focused branch named `feat/...`, `fix/...` or `docs/...`.
3. Update docs and automated tests together with any behavior change.
4. Do not commit secrets, customer receipts, production personal information or live payment credentials.
5. Prefer one reviewable pull request per vertical slice, with a screenshot for UI changes and test output for payment changes.

## Pull requests

Complete the repository pull request template. Changes touching prices, policies, permission checks, PayPal operations or storage rules must include a failure-case test and a brief risk explanation.

See [AGENTS.md](AGENTS.md) for architecture and engineering guardrails.