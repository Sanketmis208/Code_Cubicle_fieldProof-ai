# FieldProof AI

FieldProof AI is an impact and sustainability media-intelligence platform. It turns project photos and videos into organized, searchable, source-traceable evidence, conservative before/after observations, and stakeholder-ready reports.

## Architecture

- `frontend/` — React 19, TypeScript, Vite, Tailwind CSS, shadcn-style primitives, React Router, TanStack Query, React Hook Form, and Zod.
- `backend/` — Express 5, TypeScript, Prisma, PostgreSQL, Zod, JWT HttpOnly-cookie authentication, bcrypt, Helmet, CORS, and rate limiting.
- Cloudinary and Groq integrations are server-only service abstractions. Secrets are never sent to the browser.

Authentication uses a seven-day signed JWT in an HttpOnly, SameSite cookie. Every project query includes the authenticated owner's ID. Project deletion cascades to owned assets and reports. Individual assets and comparisons cannot be deleted while a persisted report references them, preserving evidence provenance.

## Environment variables

Backend (`backend/.env`):

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `GROQ_API_KEY`
- `AI_MODEL`
- `FRONTEND_URL`
- `CORS_ORIGINS` (optional comma-separated additional trusted frontend origins)
- `PORT`
- `NODE_ENV`

Frontend (`frontend/.env`):

- `VITE_API_URL`

The current AI provider is Groq. Never place provider secrets in a `VITE_` variable. Production startup requires complete Cloudinary and Groq configuration and fails fast when either integration is missing.

## Frontend and backend setup

Requirements: Node.js 20+ and PostgreSQL.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Configure the variable names listed above. Never commit either .env file.
npm install
npm run prisma:generate
npm run prisma:migrate -w backend
npm run dev
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:4000`. `GET /api/health` reports database connectivity and whether optional integrations are configured without exposing credentials.

For a deployed database, apply checked-in migrations non-interactively:

```bash
cd backend
npx prisma migrate deploy
```

For production builds:

```bash
npm ci
npm run prisma:generate
npm run build
NODE_ENV=production npm run start -w backend
```

Serve `frontend/dist/` through the chosen static host and configure it to route client-side paths to `index.html`.

## Quality commands

```bash
npm run typecheck
npm run lint
npm run build
npm run prisma:validate
npm test
npm run release:smoke # requires the API and configured integrations to be running
```

## API surface

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/:id`
- `GET /api/assets`, `POST /api/assets/upload`, `GET|DELETE /api/assets/:id`
- `PATCH /api/assets/:id/favorite`
- `POST /api/assets/:id/analyze`
- `POST /api/assets/:id/retry`, `POST /api/assets/search/interpret`
- `POST /api/projects/:id/summary`
- `GET /api/dashboard/summary`
- `GET|POST /api/comparisons`, `DELETE /api/comparisons/:id`
- `GET|POST /api/reports`, `GET|DELETE /api/reports/:id`
- `GET /api/health`

## Media intelligence

Authenticated users can upload up to ten validated images or videos per request through the API. The backend checks MIME type and file signature, streams each file to Cloudinary, persists source identity and metadata in PostgreSQL, and rolls back the batch if an upload fails. Searchable evidence supports project, media-type, date, favorite, and sort filters. Project deletion also removes its Cloudinary originals before cascading database records.

The frontend includes a real-data dashboard, project workspaces, a responsive evidence library with grid/list and batch analysis controls, staged multi-file uploads, Cloudinary-derived thumbnails, and source-traceable evidence detail views.

## Intelligence workflows

- Image analysis uses one structured multimodal Groq request, with one correction retry only when schema validation fails.
- Video analysis derives three Cloudinary frames (10%, 50%, and 90%) and submits them together in one structured multimodal request. It never performs frame-by-frame processing.
- Natural-language search uses one model request to create a Zod-validated intent. Matching then runs deterministically over persisted project, date, media, location, activity, tag, signal, and analysis metadata.
- Project summaries use one explicit, user-triggered structured request over stored project metadata and persisted analyses. Results are saved and are not regenerated when the page opens.
- Before/after analysis sends two user-selected visuals in chronological order and persists visible changes, stable observations, uncertainty, limitations, and confidence.
- Reports are generated only from stored project metadata, persisted analyses, and saved comparisons. Each report stores the source evidence IDs and exposes direct traceability links.
- Completed asset analysis is returned from storage unless the user explicitly requests re-analysis. Failures record a safe error and attempt count and can be retried independently of upload.

Prompts and response schemas live in `backend/src/ai/`. They explicitly prohibit scientific measurements, causal impact claims, invented locations, and unsupported numeric improvements from visual evidence. Every machine-consumed response is Zod validated before persistence.

## Major product workflow

1. Create an authenticated workspace and project.
2. Upload signature-validated field images or videos to Cloudinary.
3. Analyze media explicitly or during upload; persisted results are reused.
4. Search and filter evidence by metadata or natural language.
5. Review project progression by date, activity, or location.
6. Select before/after evidence and generate conservative visible-change analysis.
7. Generate a report and open its original evidence records.

The empty Projects page also offers an optional, clearly labeled demo-project creator. It creates project metadata only and never fabricates media or AI results.

## Security and reliability

- Seven-day JWT stored in an HTTP-only, SameSite cookie; production cookies require HTTPS.
- JWT issuer validation, exact-origin CORS, Helmet, authentication rate limiting, and dedicated upload/AI rate limits.
- Every project, asset, comparison, and report query is scoped to the authenticated owner.
- Provider credentials and password hashes never appear in frontend responses.
- Uploads survive analysis failures; analysis state, safe error text, and retry attempts are persisted.
- Cloudinary public/asset IDs preserve source traceability while PostgreSQL remains canonical application state.

## Known limitations

- AI work runs synchronously. A durable job queue is recommended for high-volume production workloads.
- Natural-language search evaluates at most 500 owned candidates per request; project timelines/summaries are capped at 250 assets.
- Comparisons describe visible change; they are not scientific impact assessments.
- Reports are rendered in the web application and do not yet export to PDF.
- Cloudinary multi-resource deletion cannot be transactional with PostgreSQL; a provider failure stops project deletion so database traceability is retained.

The next recommended production step is moving analysis into a durable background queue so large batches survive process restarts and can enforce provider-aware concurrency limits.
