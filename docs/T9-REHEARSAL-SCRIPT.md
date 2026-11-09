# Day-before event rehearsal

**People:** event administrator, stock keeper, three sellers, verifier and supervisor. **Equipment:** two Android phones, production-like printer and paper, test tickets, venue Wi-Fi/mobile data, and signed stock/remittance sheets. Use a development event only until the production checklist explicitly calls for production sample printing. Do not use real guest details or treat rehearsal payments as real money.

For the software rehearsal, configure a local `ksp_gatepass` or `ksp_gatepass_dev` database, set `KSP_REHEARSAL_SEED_CONFIRM=YES_I_WILL_USE_A_DEVELOPMENT_DATABASE`, provide a unique `KSP_REHEARSAL_RUN_ID`, three active development seller usernames in `KSP_REHEARSAL_SELLERS`, and a synthetic Ugandan mobile number in `KSP_REHEARSAL_TEST_PHONE`, then run `pnpm seed:rehearsal`. The script refuses production mode, non-local databases, unsupported database names, duplicate run IDs and incomplete seller configuration. It creates marked synthetic records, retains them for review and never prints QR tokens. The rehearsal event has stock issue optional solely to let both sellers race on one dedicated unissued ticket; all normal practice sales should use stock issued to the seller.

## 1. Check setup

- Confirm the rehearsal event, ticket types/prices, sales policy, accounts and roles. Confirm all phones reach the same HTTPS server.
- Check that template zone measurements are real and documented before production activation. If values remain PLACEHOLDER, do not activate the template for production.
- Print the calibration sheet at 100% / actual size. Scan its test QR with both Android phones; verify artwork alignment and readable stub text. Record printer settings and results.

## 2. Rehearse seller stock and sales

- Review the seeded history: 100 tickets issued to the three sellers, with 60 sold, 31 returned, 9 marked lost, and synthetic remittances recorded. The seed leaves seller close-out open and 16 unissued practice tickets available.
- The stock keeper issues five practice tickets to each seller; print/save each slip and compare the paper serials with the slip. Keep the final unissued ticket for the race.
- Each seller scans and sells one practice ticket, records the synthetic buyer data and full payment, returns three unsold tickets, and marks one ticket lost with a reason. Reconcile the 15 practice serials against the statements.
- To test the race, give two sellers the same final unissued rehearsal ticket and scan it on separate phones. Have them confirm at nearly the same time. Verify exactly one sale succeeds and the other seller gets a conflict; check the ticket and sale records on the server.

## 3. Rehearse the gate and privacy

- On verifier access, scan a valid sold/paid ticket, a duplicate, an invalid QR and a revoked/lost ticket. Confirm only a server-accepted admission is green.
- Confirm the verifier cannot see buyer name or phone through the gate screen, recent check-ins, APIs or exports. If authorised supervisor/admin duplicate or lookup reveal is exercised, confirm it is audited.
- Disable connectivity briefly. Confirm the phone says **OFFLINE — CHECK-IN UNAVAILABLE**, does not show admission success, and staff pause admission. Restore connectivity and retry.

## 4. Reconcile and close

- The stock keeper receives returns and records the rehearsed remittances with the proper receiving staff member. Compare seller statements with signed slips and the agreed counts.
- Close each seller only after every issued serial is sold, returned or lost; verify the system blocks any seller with outstanding stock.
- Check the audit log for issue, sale, return, loss, lookup/reveal and remittance records. Verify it contains no QR token or full phone number.
- If the printed production sample is available, print it at the chosen layout and scan its QR from paper on both Android phones. Verify measured zones and stub text again.
- Record each result, device, printer setting, network condition, discrepancy and owner. Leave all release-gate checkboxes unchecked until the event administrator reviews the evidence and confirms each real-world check.
