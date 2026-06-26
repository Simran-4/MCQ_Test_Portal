# CloudJiffy deployment

This repository is configured as one Node.js application: Express serves the API and, after it is built, the React client. PostgreSQL is the only supported production database.

1. Create a PostgreSQL database in CloudJiffy and copy its connection URI.
2. Create a Node.js environment from this repository. Use Node.js 20 LTS or newer.
3. Add these CloudJiffy environment variables:
   - `DATABASE_URL`: the PostgreSQL URI from CloudJiffy (include `sslmode=require` if supplied).
   - `JWT_SECRET`: a long random secret.
   - `NODE_ENV=production`.
   - `CORS_ORIGINS`: only needed if the client is deployed on a different origin; comma-separate allowed origins.
4. Set the build command to `npm --prefix client ci && npm --prefix client run build`.
5. Set the start command to `npm start` (the included `Procfile` uses this command). CloudJiffy supplies `PORT`; do not set a fixed port.
6. Use `/health` as the platform health check URL.

The API and client use the same origin by default, so the built client needs no `VITE_API_URL` value. If you host the client separately, set `VITE_API_URL` at build time to the API's public HTTPS URL and add the client URL to `CORS_ORIGINS`.

## Existing MongoDB data

The application now stores records in PostgreSQL. Existing MongoDB data is not copied automatically. Export/import it before cutover if those records must be retained; do not point a live production instance at both databases.
