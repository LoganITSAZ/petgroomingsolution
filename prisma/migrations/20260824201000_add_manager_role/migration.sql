-- A shop manager runs the shop without the technical screens an admin owns.
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'MANAGER';
