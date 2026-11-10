# Demo script (target 2:30, hard limit 3:00)

Before recording: open Supabase to wake the project, check /api/health, and use fresh payments.

1. 0:00 Problem (15s). Small merchants get payment complaints and have to guess. ResolvePay AI helps them decide with evidence.
2. 0:15 Payment (25s). Transactions, create a $25 sandbox payment, approve with the buyer account, the return page shows the PayPal capture ID.
3. 0:40 Damaged product (50s). Report issue with "mug arrived cracked" and no photo. Run the review: completeness is low and the recommendation is request more info. Add a photo and re-run: completeness rises, the AI summary is labelled as interpretation, the recommendation becomes full refund.
4. 1:30 Approve (30s). Approve the refund and show the real PayPal refund ID and HTTP status.
5. 2:00 Duplicate charge (25s). Two payments, same buyer and amount. Report the second as charged twice. The duplicate is found in the verified records.
6. 2:25 Audit and close (25s). Show the audit timeline. AI investigates, evidence supports, the merchant decides, PayPal executes.

Say clearly that everything is the PayPal Sandbox.