import type { PlanLimitsMap } from "@cloudtour/types";

/**
 * Plan limit constants for billing enforcement.
 * null = unlimited.
 */
export const PLAN_LIMITS: PlanLimitsMap = {
  free: {
    tours: 2,
    scenes_per_tour: 3,
    storage_bytes: 1 * 1024 * 1024 * 1024, // 1 GB
    members: 1,
  },
  pro: {
    tours: null,
    scenes_per_tour: 20,
    storage_bytes: 50 * 1024 * 1024 * 1024, // 50 GB
    members: 10,
  },
  enterprise: {
    tours: null,
    scenes_per_tour: null,
    storage_bytes: 500 * 1024 * 1024 * 1024, // 500 GB
    members: null,
  },
};
