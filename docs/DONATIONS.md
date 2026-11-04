# Online donations (about 10 minutes, no code)

The Donate page already shows the Interac e-Transfer address (donate@livinglearningacademy.com) and the note that donations are not tax-deductible. To add the **Donate Online** button:

1. Create a Stripe account at https://stripe.com using LLA’s business details and bank account.
2. In Stripe: **Payment Links → New** → product “Donation to Living Learning Academy” → pricing **“Customers choose what to pay”**, in CAD.
3. In the link’s settings, add the description: *“Donations to Living Learning Academy are not tax-deductible.”*
4. Copy the link (it starts with `https://buy.stripe.com/`).
5. In the hosting dashboard, set the environment variable `DONATE_URL` to that link and redeploy. The button appears automatically.

Stripe hosts the payment page and sends the donor a receipt by email, so card details never touch our website. Later, the same Stripe account is used for course registration payments.
