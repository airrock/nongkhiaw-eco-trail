-- Feedback round of 2026-11-25: tours that staff add to the website themselves, and the guide of the day per package.
ALTER TABLE tours
  ADD web_show TINYINT NOT NULL DEFAULT 0,                 -- 1 = show this tour on the website (tours the site does not have built in)
  ADD web_title VARCHAR(160) NOT NULL DEFAULT '',
  ADD web_summary VARCHAR(1000) NOT NULL DEFAULT '',
  ADD web_duration VARCHAR(60) NOT NULL DEFAULT '',        -- e.g. "2 days · 1 night"
  ADD web_level VARCHAR(20) NOT NULL DEFAULT '',           -- Easy | Moderate | Hard
  ADD web_included VARCHAR(1000) NOT NULL DEFAULT '',
  ADD web_photo VARCHAR(200) NOT NULL DEFAULT '';          -- file name in the uploads folder
CREATE TABLE day_guides (day DATE NOT NULL, tour VARCHAR(5) NOT NULL, guide VARCHAR(120) NOT NULL, PRIMARY KEY (day, tour))
  ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
