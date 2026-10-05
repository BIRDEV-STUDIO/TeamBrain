# Security policy

Please do not file public issues for vulnerabilities. Report them privately to the future project maintainers with reproduction steps, impact, and a suggested fix where possible.

Until a dedicated security contact is published, do not treat this pre-release code as suitable for sensitive or regulated data. Threat-model changes involving Git remotes, relay authentication, local API exposure, or AI provider data transfer require security review.

Security defaults: loopback-only server, no telemetry, no hook installation without a displayed confirmation, no automatic sync without explicit opt-in, no remote AI provider, and privacy-gated agent outcomes/pending receipts. Approved automatic sync is restricted to `shared/` and `teams/`; conflicts require human resolution. `doctor` reports missing tools and configuration but does not install software or weaken trust settings.
