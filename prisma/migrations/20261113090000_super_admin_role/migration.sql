ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "username" = 'qaphael' AND "role" = 'ADMIN';