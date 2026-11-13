# KSP GatePass administrator handoff

This checklist is for the event administrator who will configure and operate GatePass. The Super Admin account (`qaphael`) remains with the owner and is the only account that can generate ticket inventory. Do not share accounts.

## 1. Set up the event

1. Sign in with the administrator account and open **Events** → **Create event**.
2. Enter the approved event name, description, venue, address, date, start and end times. Use the `Africa/Kampala` timezone. If the event ends the next morning, enter the closing time earlier than the opening time (for example, 18:00 to 06:00).
3. Set the event capacity to the number of guests the venue can admit. Agree the ticket quantities with the owner before setting ticket category limits; the category limits together must fit the event capacity.
4. Set the sales and admission windows, and confirm the full-payment admission policy and buyer-detail requirements with the owner. Keep sales and admission closed until the owner confirms the printed inventory is ready.
5. Review every event detail before saving. Changes to date, time, capacity, prices or validity can affect printed tickets and sales.

## 2. Add staff accounts

Open **Team** → **Add team member** and create one account per person. Give each person their own username and password through a private channel.

- **Admin:** only trusted event managers who need to configure the event, ticket categories, staff and reports. Admins cannot generate ticket inventory.
- **Seller:** sales staff who will sell paper tickets assigned to them.
- **Verifier:** gate staff who only need to scan tickets and confirm admission.
- **Supervisor:** staff who monitor attendance, failed scans and exceptions.

Use the least powerful role that lets each person do their job. Never give a seller or gate verifier an Admin account. Do not share passwords or use another person's account. Deactivate access when someone no longer needs it.

## 3. Configure ticket categories, then stop for the owner

Create the agreed ticket categories under the event (for example, General Admission or VIP). Enter the approved UGX price, category quantity limit, sales window and admission eligibility for each category. Check the total category quantity against the event capacity.

**Do not generate, batch, export or print tickets.** Tell the owner when the event and categories are ready. The owner will generate and print the production inventory. Do not create substitute serials or QR codes.

After the owner hands over printed stock, use **Stock** to issue the correct tickets to each seller. Count the paper tickets together and keep the issue slip. Sellers must only sell tickets issued to them.

## 4. Open sales and prepare the gate

1. Wait for the owner to confirm the production batch is generated, printed and checked.
2. Confirm seller stock issues match the physical tickets. Then open sales when the owner approves.
3. Give sellers the [seller guide](SELLER-GUIDE.md). They scan each ticket they hand to a buyer, enter buyer/payment details, and confirm only after the sale is ready. GatePass records staff-entered payments; it does not independently verify mobile money or bank payments.
4. Give gate staff the [staff guide](STAFF-GUIDE.md). Verify every ticket with the server. If the app says **OFFLINE — CHECK-IN UNAVAILABLE**, pause admissions; never admit from a camera read or screenshot alone.
5. Test the scanner and network at the actual gate before doors open. Escalate unknown, duplicate, unpaid, cancelled or revoked tickets to the supervisor; do not override a result informally.

## 5. Reconcile and close

Use **Reports**, **Stock** and **Audit log** to review sales, staff-recorded payments, stock, remittances, attendance and exceptions. Count physical cash separately with the receiver. Resolve every issued ticket as sold, returned or lost before seller close-out. Keep exported reports and signed stock slips in the organiser's approved secure location.

For incorrect event settings, account access problems, disputed payments, suspected duplicate tickets or network failures, pause the affected work and contact the owner/Super Admin.
