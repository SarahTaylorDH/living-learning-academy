# Support needs and funding (Phase 1)

On the **Payment** step of `/register/`, families can tick **"My child has a disability or additional support needs."** They then answer:

1. What type of support need (required, choose all that apply): Autism (ASD); ADHD or attention; Learning disability; Developmental or intellectual disability; Physical disability or mobility; Hearing, vision or communication; Behavioural, social or emotional; Other. Families with allergies or medical needs only are told not to tick the box; those go on the child information form.
2. What helps their child do well in a group (optional, no medical details)
3. How they plan to pay: *I'll pay myself*, *OL school learning funds*, *Autism Funding* or *Other funding*. If they pick OL school and a course is CW, they see a note that OL schools usually can't fund CW courses.
4. OL school name (only if they chose OL school; optional)
5. Best way and time to reach them (required)

## What happens next

| They chose | Payment today | Spot | Emails |
| --- | --- | --- | --- |
| I'll pay myself | Card or e-Transfer, as usual | Normal hold (12 h e-Transfer, 24 h card) | Usual family emails, plus a **"Support intake needed"** alert to support@ |
| Any funding option | **None** | **Held** (see below) | Family: "We've received …'s registration". support@: "Support intake needed". payments@ and Ariyah: the usual new-registration alert |

support@livinglearningacademy.com goes to Drea, Ariyah and Diane.

## Running a funding hold (Supabase → Table Editor)

Open the **`support_intake`** view to see every support-needs family, newest first, with their answers and when their hold ends. Make changes in the **`orders`** table (find the row by `id`):

1. **Family submits:** the spot is held for up to **7 days** while you reach out.
2. **You call, text or email them:** set **`contact_attempted_at`** to now. The hold now ends **48 hours** after that first try.
3. **They reply:** set **`family_replied_at`** to now. The hold is extended **30 days** while funding is arranged.
4. **Funding approved, or they pay the bridge:** set **`status`** to **`paid`**. The family gets the "You're all set" email with the address, and staff get a "Confirmed (funding)" note.
5. **Hold runs out:** the spot is released automatically. The family gets one email saying so, with support@ to contact if they still want to join. support@ gets a copy.

To bring back a released family: set `status` back to `pending`, clear `released_at` on their registrations, and set `family_replied_at`.

## Deploying this change

1. Supabase → SQL Editor: run `supabase/migrations/20261128000000_support_funding.sql`.
2. Redeploy the **`checkout`** Edge Function (it now accepts the funding option).
3. Merge to `main` so the website updates.

The migration also fixes the 10-minute checkout reminder job, which was stopping with an error ("column reference o.status is ambiguous"). Before the fix, card reminder emails weren't sent and fully released orders weren't marked released.
