# First-event launch checklist

Complete this checklist with the event administrator before production tickets are printed. Record the reviewer and date for the release-gate checks. Do not treat automated tests as a substitute for physical device, print, network or restore checks.

## Event configuration

- [ ] Confirm event name, date, venue and admission times.
- [ ] Confirm ticket categories, prices, quantities and total capacity.
- [ ] Confirm whether every ticket must be fully paid before admission.
- [ ] Configure staff accounts and verify least-privilege permissions.
- [ ] Generate test tickets and verify both QR and serial lookup.

## Print, admission and connectivity

- [ ] Record measured template zones, print a calibration sheet, scan it on two Android phones, and confirm zone alignment and readable stub text.
- [ ] Activate the production template only after calibration, using the measured zone values.
- [ ] Print a production sample at the chosen layout and scan its QR from paper on two Android phones.
- [ ] Test one valid, one unpaid, one revoked and one duplicate ticket.
- [ ] Have two sellers race to sell the same ticket on real phones; confirm exactly one sale succeeds.
- [ ] Walk through seller stock issue, sale, return and close-out.
- [ ] Check buyer detail privacy at the gate: verifier sees no buyer details; any authorised supervisor/admin reveal is audited.
- [ ] Confirm production HTTPS, the venue internet connection and backup connectivity.
- [ ] Confirm staff know to pause admission during network loss; there is no offline admission.

## Recovery and staff readiness

- [ ] Verify the scheduled database backup and off-host copy.
- [ ] Restore a backup to a separate scratch database and verify event, ticket, sale, payment and check-in records.
- [ ] Train sellers, stock keepers, verifiers and supervisors using the [seller guide](SELLER-GUIDE.md), [stock keeper guide](STOCK-KEEPER-GUIDE.md) and [staff guide](STAFF-GUIDE.md).
- [ ] Generate the production ticket batch, reconcile printed quantities and secure the stock.
- [ ] Keep an authorised supervisor available for exceptions and disputes.

## Sign-off

| Check | Reviewer | Date | Evidence / notes |
| --- | --- | --- | --- |
| Duplicate admission blocked under concurrency | | | |
| Payment eligibility and permissions | | | |
| Measured template activation after calibration | | | |
| Calibration print alignment and QR scan on two Android phones | | | |
| Production sample paper QR scan on two Android phones | | | |
| Seller ticket race on real phones: one sale succeeds | | | |
| Seller issue, sale, return and close-out walk-through | | | |
| Buyer details hidden from verifier; authorised reveal audited | | | |
| HTTPS and venue connectivity | | | |
| Backup and scratch restore | | | |
| Staff training and ticket stock reconciliation | | | |
