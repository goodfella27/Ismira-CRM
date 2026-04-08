CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name text,
  is_group boolean NOT NULL DEFAULT false,
  type text NOT NULL DEFAULT 'direct',
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'direct';

ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS last_message_preview text;

ALTER TABLE public.chat_threads
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.chat_threads
SET type = CASE
  WHEN COALESCE(is_group, false) THEN 'group'
  ELSE 'direct'
END
WHERE type IS NULL OR BTRIM(type) = '';

CREATE TABLE IF NOT EXISTS public.chat_thread_members (
  thread_id uuid NOT NULL REFERENCES public.chat_threads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_thread_members_user_idx
  ON public.chat_thread_members (user_id);

CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON public.chat_messages (thread_id, created_at);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_thread_member(thread_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_thread_members
    WHERE thread_id = thread_uuid
      AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "chat_threads_select" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_insert" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_update" ON public.chat_threads;
DROP POLICY IF EXISTS "chat_threads_delete" ON public.chat_threads;
CREATE POLICY "chat_threads_select" ON public.chat_threads
  FOR SELECT TO authenticated
  USING (public.is_chat_thread_member(id));
CREATE POLICY "chat_threads_insert" ON public.chat_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = chat_threads.company_id
    )
  );
CREATE POLICY "chat_threads_update" ON public.chat_threads
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "chat_threads_delete" ON public.chat_threads
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "chat_thread_members_select" ON public.chat_thread_members;
DROP POLICY IF EXISTS "chat_thread_members_insert" ON public.chat_thread_members;
DROP POLICY IF EXISTS "chat_thread_members_delete" ON public.chat_thread_members;
CREATE POLICY "chat_thread_members_select" ON public.chat_thread_members
  FOR SELECT TO authenticated
  USING (public.is_chat_thread_member(thread_id));
CREATE POLICY "chat_thread_members_insert" ON public.chat_thread_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_threads t
      WHERE t.id = chat_thread_members.thread_id
        AND t.created_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.chat_threads t
      JOIN public.company_members cm
        ON cm.company_id = t.company_id
       AND cm.user_id = chat_thread_members.user_id
      WHERE t.id = chat_thread_members.thread_id
    )
  );
CREATE POLICY "chat_thread_members_delete" ON public.chat_thread_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_threads t
      WHERE t.id = chat_thread_members.thread_id
        AND t.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_chat_thread_member(thread_id));
CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_thread_member(thread_id)
  );
CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_chat_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_threads
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.body, 120)
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_chat_thread();

CREATE OR REPLACE FUNCTION public.list_company_members()
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  avatar_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_company_member() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT
    cm.user_id,
    u.email,
    COALESCE(
      NULLIF(BTRIM((u.raw_user_meta_data->>'first_name') || ' ' || (u.raw_user_meta_data->>'last_name')), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'display_name'), ''),
      split_part(COALESCE(u.email, ''), '@', 1),
      'User'
    ) AS name,
    NULLIF(BTRIM(u.raw_user_meta_data->>'avatar_path'), '') AS avatar_path
  FROM public.company_members cm
  JOIN auth.users u ON u.id = cm.user_id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
