DO $$
DECLARE
  super_admin_count integer;
  qaphael_role "Role";
  qaphael_active boolean;
BEGIN
  SELECT count(*) INTO super_admin_count FROM "User" WHERE "role" = 'SUPER_ADMIN';
  IF super_admin_count > 1 THEN
    RAISE EXCEPTION 'Cannot establish sole Super Admin: multiple SUPER_ADMIN accounts already exist';
  END IF;

  SELECT "role", "active" INTO qaphael_role, qaphael_active FROM "User" WHERE "username" = 'qaphael';
  IF qaphael_role IS NULL THEN
    RAISE EXCEPTION 'Cannot establish sole Super Admin: active ADMIN account @qaphael was not found';
  END IF;
  IF qaphael_role = 'SUPER_ADMIN' AND qaphael_active THEN
    RETURN;
  END IF;
  IF qaphael_role = 'SUPER_ADMIN' AND qaphael_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cannot establish sole Super Admin: @qaphael must be active';
  END IF;
  IF super_admin_count = 1 THEN
    RAISE EXCEPTION 'Cannot establish sole Super Admin: a conflicting SUPER_ADMIN account already exists';
  END IF;
  IF qaphael_role <> 'ADMIN' OR qaphael_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cannot establish sole Super Admin: @qaphael must be an active ADMIN (or already an active SUPER_ADMIN)';
  END IF;

  UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "username" = 'qaphael';
END $$;

CREATE UNIQUE INDEX "User_only_one_super_admin" ON "User" ("role") WHERE "role" = 'SUPER_ADMIN';

CREATE FUNCTION "protect_sole_super_admin"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."role" = 'SUPER_ADMIN' THEN
    IF NEW."username" <> 'qaphael' OR NEW."active" IS DISTINCT FROM true OR EXISTS (SELECT 1 FROM "User" WHERE "role" = 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'Only the initial active @qaphael account may become Super Admin';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."role" = 'SUPER_ADMIN' THEN
    IF NEW."role" <> 'SUPER_ADMIN' OR NEW."username" <> 'qaphael' OR NEW."active" IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'The Super Admin account cannot be demoted, renamed, or deactivated';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."role" <> 'SUPER_ADMIN' AND NEW."role" = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'A second Super Admin cannot be created';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_protect_sole_super_admin"
BEFORE INSERT OR UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION "protect_sole_super_admin"();

CREATE FUNCTION "protect_sole_super_admin_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."role" = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'The Super Admin account cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_protect_sole_super_admin_delete"
BEFORE DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION "protect_sole_super_admin_delete"();
