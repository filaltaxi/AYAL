-- Ayal — starting data: 10 Kochi localities and the category list.
-- Centres are approximate. Until you draw real boundaries (see README),
-- a point belongs to the nearest centre within radius_m (+300 m border slack).
-- Only Kaloor is open for the pilot; the rest show as "coming soon".

insert into public.localities (slug, name, city, district, state, center, radius_m, is_active, sort) values
  ('kaloor',          'Kaloor',                          'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.2990 9.9975)'::extensions.geography, 1300, true,  1),
  ('kadavanthra',     'Kadavanthra – Panampilly Nagar',  'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.2960 9.9650)'::extensions.geography, 1300, false, 2),
  ('vyttila',         'Vyttila',                         'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.3180 9.9680)'::extensions.geography, 1500, false, 3),
  ('palarivattom',    'Palarivattom',                    'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.3070 10.0070)'::extensions.geography, 1200, false, 4),
  ('edappally',       'Edappally',                       'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.3080 10.0260)'::extensions.geography, 1500, false, 5),
  ('ernakulam-central','Ernakulam Central',              'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.2820 9.9760)'::extensions.geography, 1400, false, 6),
  ('elamakkara',      'Elamakkara – Pachalam',           'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.2930 10.0170)'::extensions.geography, 1200, false, 7),
  ('vaduthala',       'Vaduthala',                       'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.2730 10.0120)'::extensions.geography, 1200, false, 8),
  ('kakkanad',        'Kakkanad',                        'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.3460 10.0160)'::extensions.geography, 2500, false, 9),
  ('thrippunithura',  'Thrippunithura',                  'Kochi', 'Ernakulam', 'Kerala', 'SRID=4326;POINT(76.3480 9.9450)'::extensions.geography, 2500, false, 10)
on conflict (slug) do nothing;

insert into public.categories (slug, name, icon, sort) values
  ('tutoring',  'Tutoring',                 '📚', 1),
  ('errands',   'Errands & pickups',        '🚲', 2),
  ('cooking',   'Home cooking',             '🍲', 3),
  ('repairs',   'Repairs & fixes',          '🔧', 4),
  ('cleaning',  'Cleaning',                 '🧹', 5),
  ('tech',      'Tech help',                '💻', 6),
  ('gardening', 'Gardening',                '🌱', 7),
  ('care',      'Elder care & company',     '🤝', 8),
  ('creative',  'Art, music & photos',      '🎨', 9),
  ('fitness',   'Fitness & yoga',           '🧘', 10),
  ('pets',      'Pet care',                 '🐾', 11),
  ('other',     'Other',                    '✨', 99)
on conflict (slug) do nothing;
