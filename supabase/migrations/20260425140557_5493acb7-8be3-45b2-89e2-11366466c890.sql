-- USERS
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  display_name TEXT,
  country TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  bluetooth_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GROUPS
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX groups_country_unique ON public.groups(country) WHERE country IS NOT NULL AND is_custom = false;

-- GROUP MEMBERS
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- MESSAGES
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 100),
  original_language TEXT NOT NULL DEFAULT 'en',
  translated_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((recipient_id IS NOT NULL AND group_id IS NULL) OR (recipient_id IS NULL AND group_id IS NOT NULL))
);
CREATE INDEX messages_recipient_idx ON public.messages(recipient_id, created_at DESC);
CREATE INDEX messages_sender_idx ON public.messages(sender_id, created_at DESC);
CREATE INDEX messages_group_idx ON public.messages(group_id, created_at DESC);

-- DANGER REPORTS
CREATE TABLE public.danger_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);
CREATE INDEX danger_reports_expires_idx ON public.danger_reports(expires_at);

-- ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.danger_reports ENABLE ROW LEVEL SECURITY;

-- POLICIES (open for prototype, no auth)
CREATE POLICY "users_read_all" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert_all" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_all" ON public.users FOR UPDATE USING (true);
CREATE POLICY "users_delete_all" ON public.users FOR DELETE USING (true);

CREATE POLICY "groups_read_all" ON public.groups FOR SELECT USING (true);
CREATE POLICY "groups_insert_all" ON public.groups FOR INSERT WITH CHECK (true);

CREATE POLICY "group_members_read_all" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "group_members_insert_all" ON public.group_members FOR INSERT WITH CHECK (true);
CREATE POLICY "group_members_delete_all" ON public.group_members FOR DELETE USING (true);

CREATE POLICY "messages_read_all" ON public.messages FOR SELECT USING (true);
CREATE POLICY "messages_insert_all" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "messages_update_all" ON public.messages FOR UPDATE USING (true);

CREATE POLICY "danger_read_all" ON public.danger_reports FOR SELECT USING (true);
CREATE POLICY "danger_insert_all" ON public.danger_reports FOR INSERT WITH CHECK (true);

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.danger_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.danger_reports REPLICA IDENTITY FULL;

-- SEED COUNTRY GROUPS
INSERT INTO public.groups (name, country, is_custom) VALUES
  ('Iran', 'Iran', false),
  ('China', 'China', false),
  ('Myanmar', 'Myanmar', false),
  ('Germany', 'Germany', false),
  ('France', 'France', false),
  ('United States', 'United States', false),
  ('Russia', 'Russia', false),
  ('Belarus', 'Belarus', false),
  ('Hong Kong', 'Hong Kong', false),
  ('Venezuela', 'Venezuela', false);