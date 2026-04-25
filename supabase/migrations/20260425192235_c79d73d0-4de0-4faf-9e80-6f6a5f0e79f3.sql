-- Add missing country groups for demo
INSERT INTO public.groups (name, country, is_custom) VALUES
  ('Cuba', 'Cuba', false),
  ('Afghanistan', 'Afghanistan', false),
  ('Spain', 'Spain', false)
ON CONFLICT DO NOTHING;