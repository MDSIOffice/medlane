-- Production's app_role enum predates the Product Specialist / Engineering roles,
-- so inviting or saving a user with either role fails with:
--   invalid input value for enum app_role: "Product Specialist"
-- Safe to re-run. Run in the Supabase SQL editor (each statement on its own is fine).
alter type app_role add value if not exists 'Product Specialist';
alter type app_role add value if not exists 'Engineering';
