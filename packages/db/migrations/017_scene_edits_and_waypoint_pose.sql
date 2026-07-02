-- 017: scene_edits (non-destructive AVP editor edit-list) + waypoint arrival pose
--
-- scene_edits is a JSONB blob produced by the visionOS editor:
--   {
--     "version":      <integer, monotonic, optimistic concurrency>,
--     "transform":    { "scale": <number>, "rotation": {x,y,z,w}, "translation": {x,y,z} },
--     "deletions":    { "indices": <base64 bitset>, "spheres": [...], "boxes": [...], "lassos": [...] }
--   }
--
-- NULL means: identity transform, no deletions (back-compat for scenes uploaded before
-- the editor existed). RLS is inherited from the existing scenes UPDATE policy.
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS scene_edits jsonb;

-- Waypoint arrival pose. NULL ⇒ spawn at target scene origin keeping current head yaw.
ALTER TABLE waypoints
  ADD COLUMN IF NOT EXISTS target_position_3d jsonb,
  ADD COLUMN IF NOT EXISTS target_yaw real;
