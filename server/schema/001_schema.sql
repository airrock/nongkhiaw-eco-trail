-- Nong Khiaw Eco-Trail booking database (MySQL / MariaDB, as on Hostinger).
-- Replaces the Google Sheet "Report". Each fact is stored once; rules are in server/lib/rules.php.
SET NAMES utf8mb4;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') NOT NULL DEFAULT 'staff',      -- staff = office staff
  active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  `key` VARCHAR(40) PRIMARY KEY,
  value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO settings (`key`, value) VALUES
  ('transfer_one_kip', '250000'), ('transfer_round_kip', '500000'), ('train_extra_kip', '70000'),
  ('kip_per_usd', '22500'), ('nk_office', 'Office (The Trio Bar & Cafe)'),
  ('business_name', 'Nong Khiaw Eco-Trail'), ('business_address', ''), ('business_contact', ''),
  ('logo_url', ''), ('transport_manager', ''), ('agreement_version', 'v1 2026-10-11'), ('receipt_next', '1');

CREATE TABLE tours (
  code VARCHAR(5) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,               -- per person
  sort INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO tours VALUES ('101', 'Overnight camping above the clouds', 30, 1), ('102', '2 days 1 night', 60, 2),
  ('103', '3 days 2 nights', 90, 3), ('001', '1-day boat trip', 30, 4);

CREATE TABLE tour_days (tour VARCHAR(5) NOT NULL, day INT NOT NULL, plan TEXT NOT NULL, PRIMARY KEY (tour, day))
  ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE tour_addons (tour VARCHAR(5) PRIMARY KEY, addon VARCHAR(200) NOT NULL, starts_day INT NULL)
  ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE tour_costs (
  id INT AUTO_INCREMENT PRIMARY KEY, tour VARCHAR(5) NOT NULL, item VARCHAR(200) NOT NULL,
  unit_kip DECIMAL(14,0) NOT NULL DEFAULT 0, counted_per VARCHAR(20) NOT NULL DEFAULT 'group', qty DECIMAL(10,2) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE lunch_menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `show` TINYINT(1) NOT NULL DEFAULT 1,
  grp VARCHAR(80) NOT NULL DEFAULT '',
  dish VARCHAR(80) NOT NULL UNIQUE,
  choices VARCHAR(300) NOT NULL DEFAULT '',                 -- comma separated
  price_kip DECIMAL(14,0) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE country_aliases (alias VARCHAR(60) PRIMARY KEY, name VARCHAR(60) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bookings (
  id VARCHAR(20) PRIMARY KEY,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- UTC
  tour_date DATE NULL,
  tour VARCHAR(5) NOT NULL DEFAULT '',                       -- 'T00' = transport only
  tour_name VARCHAR(120) NOT NULL DEFAULT '',
  transfer VARCHAR(40) NOT NULL DEFAULT 'No',
  pickup_date DATE NULL,                                     -- from Luang Prabang
  return_date DATE NULL,
  train_dropoff TINYINT(1) NOT NULL DEFAULT 0,
  accommodation VARCHAR(120) NOT NULL DEFAULT '',
  maps_link VARCHAR(300) NOT NULL DEFAULT '',
  nk_pickup VARCHAR(120) NOT NULL DEFAULT '',                -- pickup place in Nong Khiaw for the way back
  payment_method VARCHAR(40) NOT NULL DEFAULT '',
  source VARCHAR(40) NOT NULL DEFAULT '',
  referrer VARCHAR(120) NOT NULL DEFAULT '',
  site_language VARCHAR(5) NOT NULL DEFAULT '',
  note TEXT NOT NULL,
  est_tour_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
  est_transfer_kip DECIMAL(14,0) NOT NULL DEFAULT 0,
  status ENUM('Requested','Confirmed','Paid','Cancelled','No-show') NOT NULL DEFAULT 'Requested',
  staff_notes TEXT NOT NULL,
  whatsapp VARCHAR(40) NOT NULL DEFAULT '',
  vehicle_to_nk VARCHAR(120) NOT NULL DEFAULT '',
  vehicle_to_lpb VARCHAR(120) NOT NULL DEFAULT '',
  transport_remark VARCHAR(300) NOT NULL DEFAULT '',
  pickup_time VARCHAR(20) NOT NULL DEFAULT '',
  return_time VARCHAR(20) NOT NULL DEFAULT '',
  viewpoint VARCHAR(120) NOT NULL DEFAULT '',
  addon_package VARCHAR(200) NOT NULL DEFAULT '',
  private_tour TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,                                  -- set by an admin: hidden, not erased
  deleted_by INT NULL,
  KEY (tour_date), KEY (pickup_date), KEY (return_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE travellers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(20) NOT NULL,
  n INT NOT NULL,
  first_name VARCHAR(60) NOT NULL DEFAULT '',
  last_name VARCHAR(60) NOT NULL DEFAULT '',
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  country VARCHAR(60) NOT NULL DEFAULT '',
  gender VARCHAR(10) NOT NULL DEFAULT '',
  passport_no VARCHAR(40) NOT NULL DEFAULT '',
  passport_issued VARCHAR(20) NOT NULL DEFAULT '',
  passport_expires VARCHAR(20) NOT NULL DEFAULT '',
  food VARCHAR(40) NOT NULL DEFAULT '',
  pickup_place VARCHAR(120) NOT NULL DEFAULT '',             -- 'No transfer' = does not ride
  pickup_map VARCHAR(300) NOT NULL DEFAULT '',
  lunch_dish VARCHAR(80) NOT NULL DEFAULT '',
  lunch_choice VARCHAR(40) NOT NULL DEFAULT '',
  lunch_kip DECIMAL(14,0) NOT NULL DEFAULT 0,
  status ENUM('','Cancelled','No-show') NOT NULL DEFAULT '',
  whatsapp VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY (booking_id, n),
  CONSTRAINT fk_trav_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Money received. Replaces the single "Amount paid USD" cell.
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(20) NOT NULL,
  paid_on DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency ENUM('USD','LAK') NOT NULL DEFAULT 'USD',
  kip_per_usd DECIMAL(12,2) NOT NULL,                        -- rate on the day, so amount_usd never changes later
  amount_usd DECIMAL(12,2) NOT NULL,
  method VARCHAR(40) NOT NULL DEFAULT '',
  note VARCHAR(300) NOT NULL DEFAULT '',
  taken_by INT NULL,
  taken_by_name VARCHAR(80) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (booking_id),
  CONSTRAINT fk_pay_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipts (
  no VARCHAR(10) PRIMARY KEY,                                -- '000086'
  issued_on DATE NOT NULL,
  booking_id VARCHAR(20) NULL UNIQUE,
  legacy_booking_id VARCHAR(40) NOT NULL DEFAULT '',         -- the ID in the Sheet's log when it is in no booking
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  total_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_kip DECIMAL(14,0) NOT NULL DEFAULT 0,
  deposit_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
  issued_by VARCHAR(120) NOT NULL DEFAULT '',
  earlier TINYINT(1) NOT NULL DEFAULT 0,                     -- a number the booking already had: outside the sequence
  form_key CHAR(16) NOT NULL UNIQUE,                         -- private code in the agreement and lunch links
  overrides TEXT NOT NULL,                                   -- JSON: wording typed for this receipt only
  CONSTRAINT fk_rec_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE agreements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booking_id VARCHAR(20) NOT NULL,
  n INT NOT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',                -- as signed for: a copy on purpose
  gender VARCHAR(10) NOT NULL DEFAULT '',
  nationality VARCHAR(60) NOT NULL DEFAULT '',
  passport_no VARCHAR(40) NOT NULL DEFAULT '',
  photo_permission TINYINT(1) NOT NULL,
  medical VARCHAR(500) NOT NULL DEFAULT '',
  ec_name VARCHAR(80) NOT NULL DEFAULT '',
  ec_phone VARCHAR(40) NOT NULL DEFAULT '',
  insurance VARCHAR(60) NOT NULL DEFAULT '',
  signed_name VARCHAR(80) NOT NULL DEFAULT '',
  language VARCHAR(5) NOT NULL DEFAULT '',
  form_version VARCHAR(40) NOT NULL DEFAULT '',
  staff_checked TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY (booking_id, n),
  CONSTRAINT fk_agr_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(80) NOT NULL DEFAULT '', contact VARCHAR(120) NOT NULL DEFAULT '', tour VARCHAR(20) NOT NULL DEFAULT '',
  question TEXT NOT NULL, source VARCHAR(40) NOT NULL DEFAULT '', referrer VARCHAR(120) NOT NULL DEFAULT '',
  site_language VARCHAR(5) NOT NULL DEFAULT '',
  status ENUM('New','Replied','Booked','Closed') NOT NULL DEFAULT 'New',
  staff_notes TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY, `show` TINYINT(1) NOT NULL DEFAULT 0, review_date DATE NULL,
  name VARCHAR(120) NOT NULL DEFAULT '', review TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Website text staff changed: only the overrides, per language.
CREATE TABLE content (`key` VARCHAR(80) NOT NULL, lang VARCHAR(5) NOT NULL, value TEXT NOT NULL, PRIMARY KEY (`key`, lang))
  ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tour_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY, tour_date DATE NOT NULL, tour VARCHAR(5) NOT NULL, guests INT NOT NULL DEFAULT 0,
  receipt_nos TEXT NOT NULL, booking_ids TEXT NOT NULL,
  expense_kip DECIMAL(14,0) NOT NULL DEFAULT 0, income_kip DECIMAL(14,0) NOT NULL DEFAULT 0, profit_kip DECIMAL(14,0) NOT NULL DEFAULT 0,
  costs TEXT NOT NULL, saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY (tour_date, tour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE agency_share (
  id INT AUTO_INCREMENT PRIMARY KEY, tour_date DATE NULL, booking_id VARCHAR(40) NOT NULL DEFAULT '', data TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE change_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INT NULL,
  user_name VARCHAR(80) NOT NULL DEFAULT '',                 -- staff name, or 'website'
  table_name VARCHAR(40) NOT NULL,
  row_id VARCHAR(60) NOT NULL,
  action VARCHAR(10) NOT NULL,                               -- insert / update / delete
  old_values TEXT NULL,                                      -- JSON, only what changed
  new_values TEXT NULL,
  KEY (table_name, row_id), KEY (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
