/**
 * Storage bucket configuration and path utilities.
 *
 * Three buckets:
 * - splat-files: private, RLS mirrors tour visibility (published = public)
 * - thumbnails: public CDN, anyone can read
 * - assets: private, org-scoped RLS
 */

/** Storage bucket names */
export const STORAGE_BUCKETS = {
  SPLAT_FILES: "splat-files",
  THUMBNAILS: "thumbnails",
  ASSETS: "assets",
} as const;

/**
 * Generate the storage path for a splat file.
 * Convention: {org_id}/{tour_id}/{scene_id}/scene.{ext}
 */
export function splatFilePath(
  orgId: string,
  tourId: string,
  sceneId: string,
  format: string
): string {
  return `${orgId}/${tourId}/${sceneId}/scene.${format}`;
}

/**
 * Generate the storage path for a scene thumbnail.
 * Convention: {org_id}/{tour_id}/{scene_id}/thumbnail.webp
 */
export function thumbnailPath(
  orgId: string,
  tourId: string,
  sceneId: string
): string {
  return `${orgId}/${tourId}/${sceneId}/thumbnail.webp`;
}

/**
 * Generate the storage path for an org asset.
 * Convention: {org_id}/{type}/{filename}
 */
export function assetPath(
  orgId: string,
  type: string,
  filename: string
): string {
  return `${orgId}/${type}/${filename}`;
}
