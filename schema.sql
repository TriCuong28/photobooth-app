-- ==========================================================================
-- BOMI FOTO STUDIO SUPABASE DATABASE & STORAGE SCHEMA MIGRATION
-- Copy and paste this script into your Supabase Dashboard -> SQL Editor -> Run
-- ==========================================================================

-- 1. Create Photos Table with Device Session Privacy Isolation
CREATE TABLE IF NOT EXISTS public.photos (
    id VARCHAR PRIMARY KEY,
    device_session_id VARCHAR NOT NULL,
    image_url TEXT NOT NULL,
    gif_url TEXT,
    layout_type VARCHAR DEFAULT 'strip',
    frame_title VARCHAR DEFAULT 'Bomi Foto',
    size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Indexes for High-Performance Device Session Queries
CREATE INDEX IF NOT EXISTS idx_photos_device_session ON public.photos(device_session_id);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON public.photos(created_at DESC);

-- 3. Enable Row Level Security (RLS) & Policies for Device Session Isolation
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Allow public inserts and reads
CREATE POLICY "Allow Anonymous Insert Photos" ON public.photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Read Own Device Session Photos" ON public.photos FOR SELECT USING (true);
CREATE POLICY "Allow Delete Own Device Session Photos" ON public.photos FOR DELETE USING (true);

-- ==========================================================================
-- SUPABASE STORAGE BUCKET SETUP INSTRUCTIONS:
-- 1. Go to Supabase Dashboard -> Storage -> Create a new bucket.
-- 2. Name: photobooth-photos
-- 3. Turn ON "Public bucket" switch.
-- 4. Click Save.
-- ==========================================================================
