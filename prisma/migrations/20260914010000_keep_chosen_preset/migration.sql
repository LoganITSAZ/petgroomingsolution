-- themeUseShopColors landed as DEFAULT true, and resolveTheme() paints the
-- `default` (amber) preset whenever it is on. Backfilling every row to true
-- therefore reverted any shop already sitting on a named preset — winter,
-- halloween — to amber on deploy, which nobody asked for.
--
-- A shop that picked a preset keeps it; only shops still on `default` opt in
-- to their own colours, where the flag changes nothing.
UPDATE "system_config"
SET "themeUseShopColors" = false
WHERE "themePreset" <> 'default';
