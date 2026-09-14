-- Station names are derived, not typed: role plus the next free number.
-- Rows created before that rule carry hand-typed names ("Station 1", "Bath
-- Area", "Kennel Bank A"), so renumber every station per role by age.
WITH ordered AS (
  SELECT id,
         role,
         row_number() OVER (PARTITION BY role ORDER BY "createdAt", id) AS n
  FROM stations
)
UPDATE stations AS s
SET name = CASE ordered.role
             WHEN 'GROOMER' THEN 'Grooming Table '
             WHEN 'BATHING' THEN 'Bath '
             WHEN 'DRYING' THEN 'Dryer '
             WHEN 'KENNEL' THEN 'Kennel Bank '
           END || ordered.n
FROM ordered
WHERE ordered.id = s.id;
