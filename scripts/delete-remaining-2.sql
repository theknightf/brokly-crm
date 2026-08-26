-- Delete only the 2 non-owner auth users that GoTrue's admin API refused to delete
-- (HTTP 500). auth.users.id -> user_profiles.id ON DELETE CASCADE, so their
-- profiles are removed too. The owner (role='owner') is NOT in this list.
BEGIN;

DELETE FROM auth.users
WHERE id IN (
  '2a7fb56e-5668-4469-aff7-e9050549a5b5',  -- farismostafa999@gmail.com
  'c3cfdc39-978e-47aa-953b-30b8243dc01e'  -- admin@brokly.io
);

-- Sanity check: should now be exactly 1 user (the owner).
SELECT id, email FROM auth.users;

COMMIT;
