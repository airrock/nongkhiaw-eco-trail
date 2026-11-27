-- Website photos the team changes in the dashboard (Website > Website photos). One row per place on the site that has a
-- photo: a slot with no row shows the built-in photo. file = an uploaded JPEG in public/uploads (empty = built-in photo);
-- hidden = 1 takes a gallery photo off the site. Gallery photos the team adds are slots named gallery_x<12 hex>.
CREATE TABLE IF NOT EXISTS site_photos (
  slot VARCHAR(40) NOT NULL PRIMARY KEY,
  file VARCHAR(120) NOT NULL DEFAULT '',
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
