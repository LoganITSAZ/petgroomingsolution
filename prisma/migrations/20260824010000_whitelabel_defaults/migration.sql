-- New installations should not inherit a shop-specific name from the original seed.
ALTER TABLE "system_config"
ALTER COLUMN "shopName" SET DEFAULT 'Your Grooming Shop';
