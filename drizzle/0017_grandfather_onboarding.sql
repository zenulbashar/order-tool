-- Custom SQL migration file, put your code below! --

-- Grandfather pre-onboarding venues (Phase 3c). DATA ONLY — no schema change.
--
-- The order gate (placeOrder) blocks any venue with onboarding_completed_at IS
-- NULL. Venues created before the onboarding wizard shipped never ran it and are
-- already operating, so we mark them live to avoid locking them out when the gate
-- goes live on this same deploy.
--
-- Discriminator: the wizard's Step 1 creates every new venue at onboarding_step
-- = 2, so a venue still at the column DEFAULT of 1 was never created through the
-- wizard -> it is a pre-onboarding venue. This is deploy-date independent and
-- never touches a genuine in-progress wizard venue (which is always step >= 2).
--
-- Idempotent: the IS NULL guard makes a re-run a no-op. Set to created_at so the
-- venue reads as "live since it was created".
UPDATE "venues"
SET "onboarding_completed_at" = "created_at"
WHERE "onboarding_completed_at" IS NULL
  AND "onboarding_step" = 1;
