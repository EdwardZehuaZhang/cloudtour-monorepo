#!/usr/bin/env node
// One-off seed: creates 5 new published demo tours, each with one scene backed
// by an open-source Gaussian splat file from huggingface.co/cakewalk/splat-data.
//
// Mirrors the canonical upload flow in cloudtour-be/src/app.ts:583-592 exactly:
//   1. upload to splat-files/{org_id}/{tour_id}/{scene_id}/scene.splat
//   2. createSignedUrl(path, 31536000)  // 1 year
//   3. scenes.splat_url = signed URL, splat_file_format = 'splat'
//   4. organizations.storage_used_bytes += file size
//
// Run with: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-splats.mjs

import { Buffer } from "node:buffer";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://siwkrxtdijvutuerunzv.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY env var is required");
  process.exit(1);
}

const ORG_ID = "90249562-01d4-4169-810e-952e1cf330bb";
const CREATED_BY = "e7294714-5e28-41a7-b224-4a89d79f65dc";
const BUCKET = "splat-files";
const SIGNED_URL_TTL = 31536000;

const jsonHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const SEEDS = [
  {
    slug: "nike-air-showcase",
    title: "Nike Air Product Showcase",
    description:
      "A 360\u00b0 Gaussian splat capture of a Nike Air sneaker \u2014 perfect for interactive product visualization.",
    category: "other",
    location: "Product Studio",
    tags: ["product", "showcase", "footwear"],
    splatUrl:
      "https://huggingface.co/cakewalk/splat-data/resolve/main/nike.splat",
  },
  {
    slug: "plush-companion",
    title: "Plush Companion",
    description:
      "A detailed plush toy captured as a Gaussian splat \u2014 ideal for product and collectible showcases.",
    category: "other",
    location: "Product Studio",
    tags: ["product", "toy", "showcase"],
    splatUrl:
      "https://huggingface.co/cakewalk/splat-data/resolve/main/plush.splat",
  },
  {
    slug: "sunlit-reading-room",
    title: "Sunlit Reading Room",
    description:
      "A cozy indoor reading room captured in full spatial detail \u2014 every book and every beam of sunlight.",
    category: "real_estate",
    location: "Indoor",
    tags: ["interior", "cozy", "residential"],
    splatUrl:
      "https://huggingface.co/cakewalk/splat-data/resolve/main/room.splat",
  },
  {
    slug: "miniature-bonsai-display",
    title: "Miniature Bonsai Display",
    description:
      "A bonsai tree from the Mip\u2011NeRF 360 dataset, reconstructed as progressive Gaussian splats.",
    category: "museum",
    location: "Indoor Display",
    tags: ["nature", "bonsai", "mip-nerf-360"],
    splatUrl:
      "https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bonsai/bonsai-7k.splat",
  },
  {
    slug: "vintage-train-locomotive",
    title: "Vintage Train Locomotive",
    description:
      "A preserved steam locomotive captured from the Tanks & Temples dataset, rendered as interactive Gaussian splats.",
    category: "tourism",
    location: "Outdoor Museum",
    tags: ["vintage", "machinery", "transport"],
    splatUrl:
      "https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat",
  },
];

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...jsonHeaders, Prefer: "return=representation" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} \u2192 ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function findTourBySlug(slug) {
  const rows = await rest("GET", `tours?slug=eq.${slug}&select=id`);
  return rows[0] ?? null;
}

async function insertTour(seed) {
  const [row] = await rest("POST", "tours", {
    org_id: ORG_ID,
    created_by: CREATED_BY,
    title: seed.title,
    slug: seed.slug,
    description: seed.description,
    category: seed.category,
    location: seed.location,
    tags: seed.tags,
    status: "published",
  });
  return row;
}

async function insertScene(tourId, title) {
  const [row] = await rest("POST", "scenes", {
    tour_id: tourId,
    title,
    sort_order: 0,
    splat_file_format: "splat",
  });
  return row;
}

async function downloadSplat(url) {
  const label = url.split("/").pop();
  console.log(`    \u2193 downloading ${label}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${label} \u2192 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`    \u2713 ${(buf.length / 1e6).toFixed(1)} MB received`);
  return buf;
}

async function uploadToStorage(path, buf) {
  console.log(`    \u2191 uploading ${(buf.length / 1e6).toFixed(1)} MB to ${BUCKET}/${path}`);
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
      },
      body: buf,
    },
  );
  if (!res.ok) {
    throw new Error(`upload \u2192 ${res.status} ${await res.text()}`);
  }
}

async function createSignedUrl(path) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign \u2192 ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const relative = data.signedURL ?? data.signedUrl;
  if (!relative) throw new Error(`sign \u2192 no signedURL in response: ${JSON.stringify(data)}`);
  return `${SUPABASE_URL}/storage/v1${relative.startsWith("/") ? relative : `/${relative}`}`;
}

async function updateSceneSplatUrl(sceneId, splatUrl) {
  await rest("PATCH", `scenes?id=eq.${sceneId}`, { splat_url: splatUrl });
}

async function bumpOrgStorage(delta) {
  const [{ storage_used_bytes }] = await rest(
    "GET",
    `organizations?id=eq.${ORG_ID}&select=storage_used_bytes`,
  );
  await rest("PATCH", `organizations?id=eq.${ORG_ID}`, {
    storage_used_bytes: Math.max(0, Number(storage_used_bytes) + delta),
  });
}

async function seedOne(seed) {
  console.log(`\n\u25b6 ${seed.title} (${seed.slug})`);

  const existing = await findTourBySlug(seed.slug);
  if (existing) {
    console.log(`    - tour already exists (${existing.id}), skipping`);
    return;
  }

  const tour = await insertTour(seed);
  console.log(`    + tour  ${tour.id}`);

  const scene = await insertScene(tour.id, seed.title);
  console.log(`    + scene ${scene.id}`);

  const buf = await downloadSplat(seed.splatUrl);
  const storagePath = `${ORG_ID}/${tour.id}/${scene.id}/scene.splat`;
  await uploadToStorage(storagePath, buf);

  const signedUrl = await createSignedUrl(storagePath);
  await updateSceneSplatUrl(scene.id, signedUrl);
  console.log(`    \u2713 splat_url set (1y signed)`);

  await bumpOrgStorage(buf.length);
  console.log(`    \u2713 org storage +${(buf.length / 1e6).toFixed(1)} MB`);
}

for (const seed of SEEDS) {
  try {
    await seedOne(seed);
  } catch (e) {
    console.error(`    \u2717 ${seed.slug}: ${e.message}`);
  }
}

console.log("\nDone.");
