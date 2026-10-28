# Deployment and operations

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection used by Prisma. Compose supplies the internal database URL to the app. |
| `POSTGRES_PASSWORD` | Yes for Compose | Database password. Replace the example value with a generated secret. |
| `POSTGRES_DB` | No | Compose database name; defaults to `ksp_gatepass`. |
| `APP_PORT` | No | Loopback-only host port for local app access; defaults to `3000`. |
| `GATEPASS_DOMAIN` | HTTPS profile | Public DNS name served by Caddy. Point its A/AAAA records at the host and permit inbound TCP 80/443 and UDP 443. |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte base64url AES-256-GCM key for encrypted QR reprint copies. Generate as shown in `.env.example`; never rotate without a planned data migration. |
| `BRANDING_STORAGE_DIR` | No | Local filesystem directory outside `public/` for event images. Compose fixes this to the mounted `/var/lib/ksp-gatepass/branding` volume. |
| `COOKIE_SECURE` | Production: `true` | Adds the Secure flag to the session cookie. HTTPS is required in production. |
| `SESSION_TTL_HOURS` | No | Server session lifetime; defaults to 72 hours. |
| `LOGIN_RATE_LIMIT_MAX` | No | Failed-login limit in the configured window; defaults to 5. |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | No | Failed-login observation window; defaults to 15 minutes. |
| `LOGIN_LOCKOUT_MINUTES` | No | Lockout duration after the limit; defaults to 15 minutes. |
| `BACKUP_DIR` | Backup script | Host-side shell variable for a restricted backup directory, outside the project and live database volume. Store a second copy on separately managed storage. |

All application and Compose variables are listed in `.env.example`. The backup destination is a host process variable, not an application secret; set it in the scheduler's environment.

Event posters and optional logos are served publicly from random, versioned image URLs. Do not upload private or confidential artwork. Upload, replace and removal actions remain restricted to administrators and are audited without storing file contents.

## HTTPS deployment with Caddy

1. Copy `.env.example` to `.env`, replace all placeholder secrets, and set `GATEPASS_DOMAIN` to the real DNS name.
2. Confirm DNS resolves to the host and that ports 80 and 443 are reachable from the internet. Caddy obtains and renews the TLS certificate automatically.
3. Start the stack from the project directory:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
   ```

4. Confirm the site redirects HTTP to HTTPS, sign in, test camera permission from a supported Android browser, and verify that direct app access is loopback-only.
5. Back up the Compose data volume and Caddy's certificate volume as part of host recovery planning. Do not expose PostgreSQL or app port 3000 publicly.

This deployment configuration has not been exercised on the production VPS. DNS, certificate issuance, firewall rules and camera access still require a real-host check.

## Scheduled database backups

Backups include PostgreSQL's custom archive and a separate archive of the `event_branding` volume. The database archive is checked with `pg_restore --list`; the branding archive is checked with `tar -tzf`. The app container must be running so the script can read its mounted volume. Run backups before migrations and daily during event sales. Example on a Linux host, using a protected mount that is not part of the database or branding volumes:

```cron
0 2 * * * cd /opt/ksp-gatepass && BACKUP_DIR=/mnt/secure-ksp-backups bash scripts/backup-postgres.sh >> /var/log/ksp-gatepass-backup.log 2>&1
```

Restrict the backup directory and log to the administrator. Copy both timestamp-matched archives and their `.sha256` checksums to a separate host or approved off-site storage, then verify each checksum after transfer. Define retention with the organiser's data-retention policy; this script does not delete old backups.

## Restore rehearsal

Never rehearse over the live database. Verify the archive checksum, then restore to a new scratch database name:

```sh
cd /mnt/secure-ksp-backups && sha256sum -c ksp-gatepass-YYYYMMDDTHHMMSSZ.dump.sha256
bash scripts/restore-postgres-to-scratch.sh /mnt/secure-ksp-backups/ksp-gatepass-YYYYMMDDTHHMMSSZ.dump ksp_restore_rehearsal
```

The script refuses names outside the `ksp_restore_...` pattern, requires the destination database not to exist, and leaves the live database and scratch database untouched. Verify restored event, ticket, sale, payment and check-in counts with an authorised reviewer. Remove the scratch database only after the rehearsal is signed off, through a separate deliberate operator action.

Verify the matching branding archive separately without writing to the live named volume:

```sh
cd /mnt/secure-ksp-backups && sha256sum -c ksp-gatepass-YYYYMMDDTHHMMSSZ-branding.tar.gz.sha256
bash /opt/ksp-gatepass/scripts/restore-branding-to-scratch.sh /mnt/secure-ksp-backups/ksp-gatepass-YYYYMMDDTHHMMSSZ-branding.tar.gz /tmp/ksp_branding_restore_rehearsal
```

The helper only accepts the generated branding filename pattern and extracts to a new scratch directory outside the project. Compare its stored keys with the restored database's `EventBrandingAsset` rows. Live volume restoration is an explicit host-recovery action and is not performed by this rehearsal helper.

## CI and local checks

GitHub Actions runs frozen dependency installation, a production dependency advisory check, typecheck, lint and the complete integration suite. The check-in integration tests include ten concurrent confirmations and a ten-client verification latency p95 target below one second. CI evidence is still pending its first hosted run.

Local project commands: `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm prisma:generate`, `pnpm prisma:migrate`, `pnpm prisma:deploy`, `pnpm setup:admin`.

## Known incomplete items

- Physical Android camera/HTTPS/two-phone testing and a real-paper QR scan have not been performed.
- The HTTPS Compose overlay, scheduled host backup and restore rehearsal have not been run on the target VPS.
- Actual cash-count entry is not implemented; reconciliation marks it as not recorded.
- Mobile-money provider verification, offline admission, per-user permission grants and Playwright end-to-end tests remain out of scope or deferred.
- Event posters and optional logos are implemented; their image URLs are public, while upload, replacement and removal are admin-only.
