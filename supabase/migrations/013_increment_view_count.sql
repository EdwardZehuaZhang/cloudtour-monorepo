-- Atomic view count increment function for tour views
CREATE OR REPLACE FUNCTION increment_view_count(tour_id_input UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE tours
  SET view_count = view_count + 1
  WHERE id = tour_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
