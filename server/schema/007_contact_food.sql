-- Sheet round of 27/11/2026.
-- 0021: a special food request typed next to the food type ("no egg"), shown with it on the reports and the receipt.
ALTER TABLE travellers ADD COLUMN IF NOT EXISTS food_note VARCHAR(120) NOT NULL DEFAULT '' AFTER food;
-- 0020: the website's Contact section, edited in the dashboard (Website > Website contact). Starts with what the site
-- shows today. An empty value takes that line off the website (WhatsApp cannot be empty).
INSERT IGNORE INTO settings (`key`, value) VALUES
  ('contact_whatsapp', '+856 20 5897 5057'),
  ('contact_instagram', '@noynongkhiaw'), ('contact_instagram_link', 'https://www.instagram.com/noynongkhiaw/'),
  ('contact_email', 'nongkhiawlaos@gmail.com'),
  ('contact_facebook', 'Nong Khiaw Laos Eco Trail'), ('contact_facebook_link', 'https://www.facebook.com/profile.php?id=61571539602130'),
  ('contact_youtube', '@NoyNongKhiaw'), ('contact_youtube_link', 'https://www.youtube.com/@NoyNongKhiaw'),
  ('contact_website', 'nongkhiawlaos.com'), ('contact_website_link', 'https://nongkhiawlaos.com'),
  ('contact_map_link', 'https://www.google.com/maps/search/?api=1&query=Nong+Khiaw+Laos');
