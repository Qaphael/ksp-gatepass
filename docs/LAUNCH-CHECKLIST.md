# First-event launch checklist

Complete this checklist with the event administrator before production tickets are printed. Record the reviewer and date for the release-gate checks. Do not treat automated tests as a substitute for physical device, print, network or restore checks.

## Event configuration

- [ ] Confirm event name, date, venue and admission times.
- [ ] Confirm ticket categories, prices, quantities and total capacity.
- [ ] Confirm whether every ticket must be fully paid before admission.
- [ ] Configure staff accounts and verify least-privilege permissions.
- [ ] Generate test tickets and verify both QR and serial lookup.

## Print, admission and connectivity

- [ ] Print a sample at the correct physical size and scan its QR from paper.
- [ ] Test one valid, one unpaid, one revoked and one duplicate ticket.
- [ ] Test simultaneous scans from at least two Android phones.
- [ ] Confirm production HTTPS, the venue internet connection and backup connectivity.
- [ ] Confirm staff know to pause admission during network loss; there is no offline admission.

## Recovery and staff readiness

- [ ] Verify the scheduled database backup and off-host copy.
- [ ] Restore a backup to a separate scratch database and verify event, ticket, sale, payment and check-in records.
- [ ] Train sellers, verifiers and supervisors using the [staff guide](STAFF-GUIDE.md).
- [ ] Generate the production ticket batch, reconcile printed quantities and secure the stock.
- [ ] Keep an authorised supervisor available for exceptions and disputes.

## Sign-off

| Check | Reviewer | Date | Evidence / notes |
| --- | --- | --- | --- |
| Duplicate admission blocked under concurrency | | | |
| Payment eligibility and permissions | | | |
| Printed QR and Android scanning | | | |
| HTTPS and venue connectivity | | | |
| Backup and scratch restore | | | |
| Staff training and ticket stock reconciliation | | | |
