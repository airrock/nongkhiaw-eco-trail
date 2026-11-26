-- Which minivan the guests take back on the last day of a tour (bug 005, 2026-11-26).
-- 1 = the afternoon minivan (3:30 - 4:30 PM): the tour ends early enough that day (103: kayak back to Nong Khiaw after lunch).
-- 0 = the morning minivan (10:00 - 10:30 AM): 101 and the other camping tours are back in Nong Khiaw about 9:00 - 9:30 AM.
ALTER TABLE tours ADD COLUMN back_afternoon TINYINT(1) NOT NULL DEFAULT 0;
UPDATE tours SET back_afternoon = 1 WHERE code = '103';
