-- ---------------------------------------------------------------------------
-- 001_users.sql — demo accounts
--
-- Every account below signs in with the password:  Password123!
-- These are local/demo credentials. Change them before any real deployment.
--
-- Re-running is safe: ON CONFLICT DO NOTHING leaves existing accounts (and
-- their current passwords) untouched.
--
-- `id` and `updated_at` are set explicitly because Prisma generates those in
-- the client, not in the database.
-- ---------------------------------------------------------------------------

INSERT INTO users (id, email, name, password_hash, role, is_active, updated_at)
VALUES
  (gen_random_uuid(), 'admin@example.com', 'Admin', '$argon2id$v=19$m=65536,p=4,t=3$ZQf3BhV7Jvu39BDJsj4BrQ$r75ZmJwJjYvD48usax9bbchOcgaEQzzqnQd0sxcl3EM', 'ADMIN'::"Role", true, NOW()),
  (gen_random_uuid(), 'ava.mitchell@example.com', 'Ava Mitchell', '$argon2id$v=19$m=65536,p=4,t=3$kNjhOARI/pUXQd9zO6Q7uQ$dk0/YTp8fWwxVwsakcT24I5WcPhbt03EkosCgX8vFqA', 'ADMIN'::"Role", true, NOW()),
  (gen_random_uuid(), 'noah.bennett@example.com', 'Noah Bennett', '$argon2id$v=19$m=65536,p=4,t=3$c1k9VEqJkYcbzQlA8mYSUw$6lyQjH6bd+a2/5GTkPdHUoAKLrRng0xJTheQCSTRwg0', 'ADMIN'::"Role", true, NOW()),
  (gen_random_uuid(), 'liam.carter@example.com', 'Liam Carter', '$argon2id$v=19$m=65536,p=4,t=3$ABLgPCk2Ps1nczd1DazXhg$Bv/oXBx4lW4wgYNzDL60MLheizqwH0pHa9BH5HqoIUs', 'USER'::"Role", true, NOW()),
  (gen_random_uuid(), 'sofia.reyes@example.com', 'Sofia Reyes', '$argon2id$v=19$m=65536,p=4,t=3$g1bXC/EMTBYBGkfPoRgZMg$DkB4oWZd77Lhfz0h7+pZtbhs1k07JO7+JS4s48okPCk', 'USER'::"Role", true, NOW())

ON CONFLICT (email) DO NOTHING;
