# Pipeline CRM

Next.js + Express + PostgreSQL (Prisma) kanban CRM with bulk CSV import, quick-add, JWT auth, and dashboard metrics.

## Quick start

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, `PORT=4000`.
2. Copy `web/.env.local.example` to `web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:4000/api`
3. `npm install`, then `npm run db:generate` (Prisma is **not** run automatically on install.)

**If `prisma generate` fails with ENOSPC on C:** keep the project on **D:** and run `.\scripts\install-on-d-drive.ps1` from PowerShell (uses `D:\temp`, `D:\PrismaCache`, `D:\npm-cache`).
4. `npm run db:migrate` or `npm run db:push`
5. `npm run db:seed` — demo `demo@pipeline.local` / `demo1234` + 50 leads (if workspace empty)
6. `npm run dev` — API :4000, web :3000

## Layout

- `prisma/` — schema, migrations, `seed.ts`
- `server/` — Express API (`src/index.ts`)
- `web/` — Next.js app

## API (prefix `/api`)

Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`  
Leads: `GET /leads/board`, CRUD `/leads/:id`, `PATCH /leads/bulk/update`, `POST /leads/quick-add`, `POST /leads/:id/notes`  
Import: `POST /import/csv` (field `file`), `GET /import/csv/:jobId/status`  
Dashboard: `GET /dashboard/stats`  
Users: `GET /users`
