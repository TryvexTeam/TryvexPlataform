-- Bucket público para fondos de pantalla (imágenes y videos)
-- La subida pasa por /api/wallpaper con service role; lectura pública.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wallpapers', 'wallpapers', true)
ON CONFLICT (id) DO NOTHING;
