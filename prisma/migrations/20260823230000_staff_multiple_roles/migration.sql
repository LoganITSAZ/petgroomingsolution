-- Staff can hold several roles at once (groomer who also baths, admin who
-- still works the floor). The single `role` column becomes a `roles` array,
-- carrying every existing value over unchanged.
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'BATHER';
