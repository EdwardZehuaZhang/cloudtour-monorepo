import { serve } from "@hono/node-server";
import { app } from "./app";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`cloudtour-be listening on http://localhost:${info.port}`);
});
