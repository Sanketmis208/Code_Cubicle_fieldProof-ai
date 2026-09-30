<div align="center">

# FieldProof AI

**Impact & Sustainability Media-Intelligence Platform**

*Turn raw field photos and videos into organized, traceable evidence and stakeholder-ready reports — powered by AI.*

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
- [Running the App](#-running-the-app)
- [API Reference](#-api-reference)
- [Intelligence Workflows](#-intelligence-workflows)
- [Security](#-security)
- [Quality & Testing](#-quality--testing)
- [Known Limitations](#-known-limitations)
- [Demo Guide](#-demo-guide)

---

## 🌍 Overview

**FieldProof AI** is a full-stack web platform built for impact-driven organisations, field researchers, and sustainability teams. It ingests project media — photographs and videos captured in the field — and transforms them into:

- **Searchable, structured evidence** with AI-extracted metadata (activity, location, environmental signals, confidence scores)
- **Before/After visual comparisons** with conservative, uncertainty-aware analysis
- **Traceable stakeholder reports** that link every claim back to its source media

Every AI output is schema-validated, source-cited, and explicitly constrained to observable visual evidence — no invented measurements, no unsupported causal claims.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔐 **Secure Auth** | 7-day signed JWT in HttpOnly, SameSite cookie; bcrypt password hashing |
| 📁 **Project Workspaces** | Create and manage field projects; deletion cascades cleanly to all owned assets |
| 📸 **Media Upload** | Batch upload up to 10 images/videos; MIME + file-signature validation; Cloudinary CDN storage |
| 🤖 **AI Analysis** | Groq-powered structured multimodal analysis; results persisted and reused on repeat loads |
| 🎥 **Video Intelligence** | Auto-extracts 3 keyframes (10%, 50%, 90%) and submits as a unified multimodal request |
| 🔍 **Natural Language Search** | Type a plain-English query; the AI interprets intent and runs deterministic filter matching |
| 📊 **Before/After Comparison** | Select two assets chronologically; AI generates visible-change analysis with confidence + uncertainty |
| 📄 **Report Generation** | AI reports built exclusively from persisted evidence; every claim links to a source record |
| 📅 **Project Timeline** | Browse field progression by date, activity type, or geographic location |
| ⭐ **Favorites & Filters** | Mark key assets; filter by project, media type, date range, and more |

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite | Build tooling & dev server |
| Tailwind CSS | Utility-first styling |
| React Router v6 | Client-side routing |
| TanStack Query | Server-state management & caching |
| React Hook Form + Zod | Form handling & validation |
| Axios | HTTP client with auth interceptor |

### Backend
| Technology | Purpose |
|---|---|
| Express 5 + TypeScript | REST API server |
| Prisma ORM | Type-safe database access |
| PostgreSQL | Primary relational data store |
| Cloudinary | Media storage & CDN |
| Groq SDK | LLM inference (multimodal) |
| JWT + bcrypt | Authentication & password security |
| Helmet + CORS + Rate Limiting | Security hardening |
| Zod | Request validation & AI schema enforcement |

---

## 🏗 Architecture

```
fieldproof-ai/
├── frontend/               # React 19 SPA (Vite)
│   └── src/
│       ├── api/            # Axios request functions per domain
│       ├── components/     # Reusable UI components
│       ├── contexts/       # React Context (Auth)
│       ├── layouts/        # App shell & Auth shell
│       ├── pages/          # Route-level page components
│       ├── types/          # Shared TypeScript interfaces
│       └── lib/            # Utility helpers (cn, cloudinary)
│
└── backend/                # Express 5 REST API
    └── src/
        ├── ai/             # Groq prompts & response schemas
        ├── config/         # Env loader (Zod-validated)
        ├── controllers/    # Route handler logic
        ├── middleware/     # Auth, error, upload, rate-limit, validate
        ├── routes/         # Express router definitions
        ├── services/       # AI, Auth, Cloudinary service abstractions
        ├── types/          # Express augmentation (req.user)
        ├── utils/          # AppError, asyncHandler, report-references
        └── validators/     # Zod schemas for request bodies
```

**Data flow:**
```
Browser → Vite Dev Server (5173)
       → Express API (4000) → Prisma → PostgreSQL
                           → Cloudinary (media storage)
                           → Groq API  (AI inference)
```

> Cloudinary and Groq credentials are **server-only**. No secrets are ever sent to the browser.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20 or higher
- **PostgreSQL** v14 or higher (local or hosted, e.g. Supabase / Neon)
- A **Cloudinary** account (free tier works)
- A **Groq** API key

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Sanketmis208/Code_Cubicle_fieldProof-ai.git
cd Code_Cubicle_fieldProof-ai

# 2. Copy environment templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Fill in your credentials (see Environment Variables below)

# 4. Install all workspace dependencies
npm install

# 5. Generate the Prisma client
npm run prisma:generate

# 6. Run database migrations
npm run prisma:migrate -w backend
```

### Environment Variables

#### `backend/.env`

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fieldproof"
DIRECT_URL="postgresql://user:password@localhost:5432/fieldproof"

# Authentication
JWT_SECRET="your-strong-random-secret"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# AI Provider
GROQ_API_KEY="your-groq-api-key"
AI_MODEL="meta-llama/llama-4-scout-17b-16e-instruct"

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
CORS_ORIGINS=""    # Optional: comma-separated additional trusted origins
```

#### `frontend/.env`

```env
VITE_API_URL="http://localhost:4000"
```

> ⚠️ **Never commit `.env` files.** Both are listed in `.gitignore`.

---

## ▶️ Running the App

### Development

```bash
npm run dev
```

This starts both the backend (`http://localhost:4000`) and frontend (`http://localhost:5173`) concurrently.

To start them separately:

```bash
npm run dev -w backend    # API server with ts-node watch
npm run dev -w frontend   # Vite dev server with HMR
```

### Health Check

```bash
curl http://localhost:4000/api/health
# → { "status": "ok", "db": true, "cloudinary": true, "ai": true }
```

### Production Build

```bash
npm ci
npm run prisma:generate
npm run build

# Start production API
NODE_ENV=production npm run start -w backend

# Serve frontend/dist/ via your static host (Vercel, Nginx, etc.)
# Ensure client-side routing paths fall back to index.html
```

For hosted databases, apply migrations non-interactively:

```bash
cd backend && npx prisma migrate deploy
```

---

## 📡 API Reference

All routes are prefixed with `/api`. Protected routes require a valid JWT cookie.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | ❌ | Create a new account |
| `POST` | `/auth/login` | ❌ | Authenticate and receive session cookie |
| `POST` | `/auth/logout` | ✅ | Clear session cookie |
| `GET` | `/auth/me` | ✅ | Get current authenticated user |
| `GET` | `/projects` | ✅ | List owned projects |
| `POST` | `/projects` | ✅ | Create a new project |
| `GET` | `/projects/:id` | ✅ | Get project details |
| `PATCH` | `/projects/:id` | ✅ | Update project |
| `DELETE` | `/projects/:id` | ✅ | Delete project + cascade |
| `GET` | `/assets` | ✅ | List assets with filters |
| `POST` | `/assets/upload` | ✅ | Upload up to 10 media files |
| `GET` | `/assets/:id` | ✅ | Get asset details + AI analysis |
| `DELETE` | `/assets/:id` | ✅ | Delete asset + Cloudinary original |
| `PATCH` | `/assets/:id/favorite` | ✅ | Toggle favorite |
| `POST` | `/assets/:id/analyze` | ✅ | Trigger AI analysis |
| `POST` | `/assets/:id/retry` | ✅ | Retry failed analysis |
| `POST` | `/assets/search/interpret` | ✅ | Natural-language evidence search |
| `GET` | `/comparisons` | ✅ | List comparisons |
| `POST` | `/comparisons` | ✅ | Create before/after comparison |
| `DELETE` | `/comparisons/:id` | ✅ | Delete comparison |
| `GET` | `/reports` | ✅ | List generated reports |
| `POST` | `/reports` | ✅ | Generate AI report |
| `GET` | `/reports/:id` | ✅ | Get report with source evidence links |
| `DELETE` | `/reports/:id` | ✅ | Delete report |
| `POST` | `/projects/:id/summary` | ✅ | Generate project AI summary |
| `GET` | `/dashboard/summary` | ✅ | Aggregated dashboard stats |
| `GET` | `/health` | ❌ | Service + integration health check |

---

## 🧠 Intelligence Workflows

All prompts and response schemas are defined in `backend/src/ai/`. The AI is explicitly instructed to:
- ✅ Describe only what is **visually observable**
- ✅ Report **uncertainty and limitations** honestly
- ❌ Never invent measurements, coordinates, or numeric improvements
- ❌ Never make causal impact claims from visual evidence alone

| Workflow | How it works |
|---|---|
| **Image Analysis** | 1 structured multimodal Groq request; 1 automatic retry if schema validation fails |
| **Video Analysis** | 3 Cloudinary keyframes extracted (10%/50%/90%), submitted in a single request |
| **NL Search** | AI interprets query into a Zod-validated filter intent; matching runs deterministically over stored metadata |
| **Project Summary** | 1 user-triggered request over stored project metadata and persisted analyses; result is saved |
| **Before/After Comparison** | Two assets sent chronologically; AI returns visible changes, confidence, uncertainty, and limitations |
| **Report Generation** | Built exclusively from stored metadata, persisted analyses, and saved comparisons; each claim links to source evidence |

Completed analysis is returned from storage on repeat loads. Failed analysis records a safe error message and retry count; it can be retried independently of upload.

---

## 🔒 Security

| Control | Implementation |
|---|---|
| **Authentication** | 7-day signed JWT in HttpOnly + SameSite=Lax cookie; HTTPS enforced in production |
| **Authorisation** | Every DB query scoped to `req.user.id`; no cross-user data leakage possible |
| **CORS** | Exact-origin allowlist; configurable via `CORS_ORIGINS` |
| **Headers** | Helmet sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.) |
| **Rate Limiting** | Separate limits for auth routes, upload routes, and AI inference routes |
| **Input Validation** | All request bodies validated with Zod before reaching controllers |
| **Secret isolation** | Provider credentials (Cloudinary, Groq) are server-only; never exposed to the browser |
| **Passwords** | Stored as bcrypt hashes; never returned in any response |
| **Cascade integrity** | Report-referenced assets/comparisons are deletion-protected to preserve evidence provenance |

---

## 🧪 Quality & Testing

```bash
# Type checking
npm run typecheck

# Linting (ESLint)
npm run lint

# Full build verification
npm run build

# Prisma schema validation
npm run prisma:validate

# Unit / integration tests
npm test

# End-to-end smoke test (requires running API with configured integrations)
npm run release:smoke
```

---

## ⚠️ Known Limitations

- **Synchronous AI jobs** — Analysis runs in-process. A durable job queue (e.g. BullMQ) is recommended for high-volume production workloads.
- **Search scope** — Natural-language search evaluates at most 500 owned assets per request; project timelines/summaries are capped at 250 assets.
- **Comparisons** — Describe *visible change* only; not a scientific impact assessment.
- **PDF export** — Reports are rendered in-app; PDF export is not yet implemented.
- **Cloudinary deletion** — Multi-resource deletion cannot be transactional with PostgreSQL. A Cloudinary provider failure halts project deletion so database traceability is preserved.

**Next recommended production step:** Move analysis into a durable background queue so large batches survive process restarts and can enforce provider-aware concurrency limits.

---

## 🎬 Demo Guide

> Full script in [`DEMO.md`](./DEMO.md) — designed for a **90–120 second** walkthrough.

**Pre-demo checklist:**
- [ ] PostgreSQL is reachable and all migrations are applied
- [ ] `GET /api/health` returns `status: ok` with Cloudinary and AI configured
- [ ] Frontend running at `http://localhost:5173`
- [ ] Two small, clearly dated sample images prepared for the same project

**Walkthrough (7 steps):**

1. **Dashboard** — Live project, evidence, AI-coverage, comparison and report counts
2. **Upload** — Drag media into a project; AI analysis runs automatically
3. **Evidence Intelligence** — AI tags: activity, signals, uncertainty, confidence, traceability
4. **Natural Language Search** — `"Find tree planting evidence in Jaipur after January 2026"`
5. **Timeline** — Browse by Month / Activity / Location
6. **Before & After** — Select two assets; generate visible-change comparison
7. **Report & Traceability** — Generate an Impact Summary; click any claim to see its source media

---

<div align="center">

Built for **Code Cubicle** · Made with ❤️ by the FieldProof team

</div>
