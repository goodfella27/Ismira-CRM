ALTER TABLE public.breezy_priority_types ADD COLUMN IF NOT EXISTS tooltip text CHECK (char_length(tooltip) <= 500);
COMMENT ON COLUMN public.breezy_priority_types.tooltip IS 'Public filter explanation. NULL uses the default; empty text hides the tooltip.';
NOTIFY pgrst, 'reload schema';
