# cloudtour-be

Hono API server for CloudTour. Runs on port 3001 by default.

## Development

```bash
pnpm dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | Stripe price ID for Enterprise plan |
| `FRONTEND_URL` | Frontend origin for CORS (default: http://localhost:3000) |
| `PORT` | Port to listen on (default: 3001) |

## Routes

### Public (no auth)
- `GET /api/tours` - List published tours
- `GET /api/tours/:slug` - Get tour by slug
- `POST /api/tours/:slug/view` - Increment view count

### Authenticated
- `GET/PATCH /api/me` - User profile
- `GET/POST /api/invite/:token` - Invite management
- `GET/POST /api/orgs/:orgId/members` - Org members
- `DELETE /api/orgs/:orgId/members/:memberId` - Remove member
- `GET/POST/PATCH/DELETE /api/orgs/:orgId/tours` - Tours
- `GET/POST/PATCH/DELETE /api/orgs/:orgId/tours/:tourId/scenes` - Scenes
- `GET/POST/PATCH/DELETE /api/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints` - Waypoints
- `GET/POST/PATCH/DELETE /api/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots` - Hotspots
- `POST /api/orgs/:orgId/tours/:tourId/scenes/:sceneId/upload` - Presigned upload URL
- `POST/GET /api/orgs/:orgId/billing` - Billing / Stripe checkout
- `POST /api/webhooks/stripe` - Stripe webhook handler
