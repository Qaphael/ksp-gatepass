# Production dependency review

## Repeatable check

Run the lockfile-backed advisory check after dependency changes and in CI:

```sh
pnpm audit --prod --audit-level high
```

Review advisories against the exact affected package and installed version before changing dependencies. Prefer a compatible patched release; document any accepted advisory and its mitigation. Do not apply broad upgrades as a substitute for reviewing the impact on Next.js, Prisma, QR scanning, PDF rendering and database migrations.

## Current session

The local check was attempted for Phase 5, but this environment could not reach `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` (EACCES). No advisory result is claimed from that attempt. The hosted CI workflow will retry the check where registry access is available. The lockfile remains pinned to the versions already tested by this repository.
