-- Emails are sent as the shop's name. The separate sender-name column was a
-- second place to set the same thing, editable from two admin screens, and
-- could drift out of step with SystemConfig.shopName.
ALTER TABLE "system_config" DROP COLUMN "emailFromName";
