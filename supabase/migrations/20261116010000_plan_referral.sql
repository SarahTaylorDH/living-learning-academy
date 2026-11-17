-- Registrations: which payment plan the family chose (monthly = 2 payments, or full = all at once)
-- and who referred them (optional; the referring family gets $20 off). Applied in production Nov 16, 2026.
alter table public.registrations
  add column if not exists payment_plan text check (payment_plan in ('monthly', 'full')),
  add column if not exists referred_by text check (char_length(referred_by) <= 120);
