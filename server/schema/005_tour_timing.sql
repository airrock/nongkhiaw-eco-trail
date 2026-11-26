-- When each tour's guests can take the minivan (2026-11-26, after bug 005). Replaces tours.back_afternoon from 004.
-- back_slot: the minivan back on the tour's last day.
--   morning   = 10:00 - 10:30 AM (101/201 camping: back in Nong Khiaw by boat about 9:00 - 9:30 AM)
--   afternoon = 3:30 - 4:30 PM   (103: kayak back to Nong Khiaw after lunch on day 3)
--   next      = no minivan that day, the tour ends about 4:30 - 5:30 PM (102, 001): the next morning, 10:00 - 10:30 AM
-- up_day_before: the tour starts before the minivan from Luang Prabang arrives (about 11 AM - 12 PM): 001 starts 8:30 AM.
ALTER TABLE tours ADD COLUMN back_slot VARCHAR(10) NOT NULL DEFAULT 'morning', ADD COLUMN up_day_before TINYINT(1) NOT NULL DEFAULT 0;
UPDATE tours SET back_slot = 'afternoon' WHERE back_afternoon = 1;
UPDATE tours SET back_slot = 'next' WHERE code IN ('102', '001');
UPDATE tours SET up_day_before = 1 WHERE code = '001';
ALTER TABLE tours DROP COLUMN back_afternoon;
