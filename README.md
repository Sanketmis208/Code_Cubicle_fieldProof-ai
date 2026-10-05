<div align="center">

# FieldProof AI

**Field evidence you can stand behind.**

FieldProof turns photos and videos from the field into evidence that is organised, explained and traceable to the pixel, and it says plainly when a photo needs a second look.

Code Cubicle 6.0 · Problem Statement 02 · AI-Powered Impact & Sustainability Media Platform (Cloudinary)

</div>

---

## Why

Geotagged photos did not stop fake attendance in MGNREGS. The National Mobile Monitoring System received photos of photos, unrelated images, and the same bush photographed for several muster rolls. NGOs, CSR teams and government programmes face the same problem with every donor report.

Collecting more photos does not help. What helps is a layer that checks each photo, explains what it found, lets a different person decide, and keeps that decision traceable all the way into the campaign image. FieldProof is that layer.

## What it does

| Area | What you get |
| --- | --- |
| **Trust Score** | Every upload gets a 0–100 score with each point explained. The checks cover byte-identical reuse, near-duplicate reuse across events or days, a photo of a screen or print, AI-generated images, editing software, capture time against the project period, GPS against project sites, mock GPS and device signature. Wording is "needs a second look", never "fraud". |
| **Honest counting** | Shots within 15 minutes and 150 m form one **event** ("40 files, 1 event, 3 best shots"). Only best shots go to the AI, which keeps within the provider's quota. |
| **Organizations & roles** | Multi-tenant organizations with six roles (Owner, Admin, Program manager, Verifier, Field worker, Viewer), invite codes, project assignment and a hash-chained audit log. Nothing crosses organizations. |
| **Review** | A risk-sorted queue grouped by event, with "approve whole event". A reason is required to reject or request a re-shoot. Nobody approves their own upload. |
| **Evidence Passport** | One page per item: fingerprint, capture facts and where each came from, every check, the reviewer, the originals behind any reuse flag, and every derived file with its exact Cloudinary transformation. A **public passport** shares the same with faces blurred, location rounded to about 1 km, and no names. |
| **Story Studio** | Instagram card, 9:16 story and before/after poster, built only from Cloudinary transformations of **approved** evidence. Faces are blurred by default, and each file carries a QR code to its public passport. |
| **Reports that cite** | Each report sentence carries the evidence it rests on. Invented citations are dropped and an "unsupported claims" counter is shown. Rejected and unreviewed flagged evidence is left out. |
| **Claim checker** | Paste "we planted 500 saplings in Bassi in August". It returns the evidence behind the claim, how trustworthy it is, and what is missing (for example, a count needs a tally, not a photo). |
| **Search** | Plain-language search that understands synonyms ("sapling planting" finds "tree planting"), plus filters by trust, review status and capture source. |
| **Before/after** | AI-described visible change, a slider, and a **Comparability Score** (same spot? same viewpoint?). Pairs that can't be compared fairly are marked "indicative only". |
| **Live capture (web)** | A phone-browser camera page opened by QR code, with no install. It takes no file picker, records GPS and an inside-site badge, and uses server time. |
| **Live capture (app)** | A Flutter app ([`mobile/`](mobile/README.md)) that is camera-only. Each capture is signed with an Ed25519 key on the phone, uses trusted time from server sync plus a monotonic clock, records Android's mock-location flag, and goes through an offline queue. |

## Cloudinary is the evidence engine

Remove Cloudinary and the trust layer stops working: it is part of the pipeline, not just storage.

| PS02 goal | Cloudinary feature | Where |
| --- | --- | --- |
| Analyze and organize large collections | Upload with `phash`, `quality_analysis`, `faces` (with automatic fallback when a plan refuses one) | `services/cloudinary.service.ts`, `services/evidence.service.ts` |
| Identify activities, locations, signals | Tags and context synced back to the asset in one `explicit` call; vision model fed a `c_limit,w_1280,f_jpg` rendition (works for iPhone HEIC) | `cloudinary.service.ts`, `asset.controller.ts` |
| Compare before and after | `c_fill,g_auto` crops for the slider; overlay transformation for the side-by-side poster | `before-after-slider.tsx`, `story.controller.ts` |
| Campaign-ready content | Text and image overlays, `g_auto`, `e_blur_faces`, a QR image layer, `e_brightness` | `story.controller.ts` |
| Traceability to sources and transformations | Deterministic transformation URLs stored per derived file (`DerivedAsset`) and shown in the passport's transformation ledger | `passport.controller.ts` |
| Fast, data-saving delivery | `f_auto,q_auto` display renditions, `q_auto:low` data-saver for field phones | `lib/cloudinary.ts`, passport delivery list |

Each asset in the web app has a **Cloudinary** tab showing what the upload analysis returned and every delivery transformation in use.

## Architecture

```
 Phone browser (/capture) ─┐        ┌─► PostgreSQL (Prisma)  orgs, roles, evidence, trust checks,
 Flutter app (signed)  ────┼─► API ─┤                         events, reviews, reports, audit log
 Web app (React)  ─────────┘ Express├─► Cloudinary           storage, phash/quality/faces, every rendition
                                    └─► Groq vision model    description + recapture/synthetic/stamp signals,
                                                             search intent, comparisons, cited reports
```

```
backend/    Express 5 + TypeScript API, Prisma schema and migrations, 83 automated tests
frontend/   React 19 + Vite web app
mobile/     Flutter field-capture app (camera only, signed captures, offline queue)
scripts/    demo seed and release smoke test
```

## Getting started

Requirements: Node.js 20+, PostgreSQL 14+, a Cloudinary account and a Groq API key.

```bash
git clone https://github.com/Sanketmis208/Code_Cubicle_fieldProof-ai.git
cd Code_Cubicle_fieldProof-ai
npm install

cp backend/.env.example backend/.env      # fill in database, JWT secret, Cloudinary, Groq
cp frontend/.env.example frontend/.env    # VITE_API_URL=http://localhost:4000/api

createdb fieldproof_dev                   # or use a hosted database
npm run prisma:generate
cd backend && npx prisma migrate deploy && cd ..

npm run dev                               # API on :4000, web app on :5173
```

Every existing user is moved into a personal organization by the migration, so older databases keep working.

### Demo data

Shoot a few real photos on a phone with location on: a burst at one spot, the same spot on another day, and a photo of a laptop screen. Add one WhatsApp-forwarded copy and one old photo named `old_*.jpg`. Then:

```bash
npm run demo:seed -- --photos ./demo-photos --lat <site latitude> --lng <site longitude>
```

The script creates the organization, an owner, a field worker and a verifier (joined by invite code), two projects and a site. It uploads the photos, analyzes each event's best shots within the AI quota, and approves the cleanest event. Account emails and the demo password are documented at the top of `scripts/demo-seed.mjs`.

## Testing

```bash
npm test             # backend: 83 tests against an isolated <db>_test database
npm run typecheck
npm run lint
npm run build
cd mobile && flutter test   # Flutter unit tests (signing, tamper detection, geo, time)
```

The backend tests run against a real PostgreSQL database whose name must contain `test`. Anything else is refused, because the tests truncate every table. Cloudinary and the AI provider are replaced by fakes. The suite covers:

- Every pre-existing feature.
- A cross-organization isolation matrix: 26 attack requests, after which a snapshot proves no data in either organization changed.
- Every role's permissions, invite codes (single use, expiry, revocation, email binding, a four-way race for one code) and the last-owner race.
- Audit-log tamper detection.
- EXIF parsing from generated JPEG bytes, reuse and burst detection, event clustering and site re-checks.
- The review rules (no self-review, approve whole event).
- Public passport privacy, citation validation, the claim checker, Story Studio escaping and gating.
- Signed app captures, including tampered files, mock GPS, foreign devices and retries.

## How the Trust Score works

| Starting cap | |
| --- | --- |
| Signed capture in the FieldProof app | 100 |
| Live capture in the browser | 90 |
| Uploaded file with camera metadata | 85 |
| Uploaded file without metadata (forwards, screenshots) | 70 |

Penalties are applied from there. Each check is stored as a row with its reason, and the score, badge and passport all read the same rows.

| Check | Effect |
| --- | --- |
| Visually identical to a photo from another event or day | −40 |
| Looks like a photo of a screen or print (high / medium) | −45 / −20 |
| Outside every project site (GPS accuracy counted in the worker's favour) | −30 |
| Captured outside the project period | −30 |
| Device clock in the future | −15 |
| Saved by editing software | −15 |
| Possibly AI-generated (medium) | −25 |
| No GPS / no capture time | −10 / −5 |
| **Hard flags:** identical file already submitted elsewhere; likely AI-generated; mock GPS; broken device signature | score capped at 25, cannot be published until a reviewer approves |

Bands: 80+ Strong, 50–79 Moderate, below 50 Needs a second look. Nothing is ever rejected automatically: checks explain, and people decide.

Where a fact comes from is always shown:

- **Camera metadata:** parsed from the original bytes on the server.
- **GPS camera stamp:** printed on the photo and read by the vision model. It is labelled *declared*, not proven.
- **Capturing device**, or **server time**.

## Roles

| Role | Sees | Can |
| --- | --- | --- |
| Owner | All projects | Everything, including other owners |
| Admin | All projects | Members (below admin), invites, settings, audit log, all content actions |
| Program manager | Assigned projects | Create projects, assign the team, review, comparisons, reports, Story Studio |
| Verifier | Assigned projects | Review (never their own uploads), comparisons, favourites |
| Field worker | Assigned projects | Upload and capture |
| Viewer | All projects | Read only |

Out-of-scope resources answer **404**, so IDs from other organizations reveal nothing. Allowed scope with an insufficient role answers **403**. Role changes and removals apply on the very next request.

## API overview

All routes are under `/api`. Authentication uses an HttpOnly session cookie (web) or a bearer token from `POST /auth/token` (mobile). List routes are scoped by the `X-Organization-Id` header.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` (optional `inviteCode`), `/auth/login`, `/auth/token`, `/auth/logout`, `GET /auth/me` |
| Organizations | `GET/POST /orgs`, `POST /orgs/join`, `GET/PATCH /orgs/:id`, members, invites, `GET /orgs/:id/audit` |
| Projects | CRUD, `/projects/:id/summary`, `/projects/:id/members`, `/projects/:id/sites` |
| Evidence | `GET /assets` (filters incl. trust/review/source), `POST /assets/upload`, `/assets/:id` (+ `analyze`, `retry`, `favorite`, `passport`, `share`), `POST /assets/search/interpret` |
| Review | `GET /review/queue`, `POST /review/assets/:id`, `POST /review/events/:id` |
| Intelligence | `/comparisons`, `/reports`, `POST /claims/check`, `/story` |
| Live capture | `GET /capture/time`, `GET /capture/projects`, `POST /capture/devices`, `POST /capture/upload` |
| Public | `GET /public/passport/:token`, `GET /health` |

## Security and privacy

- **Tenant isolation:** every query is scoped by organization and project assignment through one policy module (`backend/src/authz`).
- **Separation of duties:** capture, review and publishing are different permissions. Self-review is blocked, except in a single-person workspace, where it is recorded as such.
- **Audit log:** append-only and hash-chained per organization. Tampering is detected and shown in the UI.
- **Invite codes:** stored hashed, shown once; they can expire, be revoked, be limited in uses or be tied to one email. Join attempts are rate-limited.
- **Live captures:** the server recomputes the SHA-256 and verifies the Ed25519 signature over the exact signed bytes. Browser captures ignore the browser clock.
- **Privacy:** faces are blurred by default for anything public. Public passports round coordinates and hide people. GPS is read only while the camera is open.
- **Hardening:** rate limits are per user (per IP for public routes), Zod validation runs on every request and AI response, and file signatures are checked on upload. Helmet and CORS use an exact allowlist.

## Deploying

- Serve the web app and the API under one domain (proxy `/api` to the backend) to keep `COOKIE_SAME_SITE=lax`. For separate domains, use `COOKIE_SAME_SITE=none` over HTTPS.
- Set `FRONTEND_URL` to the public URL **before** generating campaign assets, because QR codes point there.
- Run `npx prisma migrate deploy` on release.
- The mobile app must use `https://` in production; see [`mobile/README.md`](mobile/README.md).

## Honest limits and roadmap

- **Device integrity:** app captures are signed, but the phone itself is not yet attested (Play Integrity, App Attest), and the signing key is not hardware-bound yet. A browser capture cannot prove the device is untampered, and is labelled accordingly.
- **Background jobs:** AI analysis runs in the request, paced under the provider quota. The scale path is direct signed upload to Cloudinary plus a webhook into a job queue.
- **Next checks:** a cross-organization hash registry (the same photo sent to two funders), Sentinel-2 vegetation and historical-weather cross-checks, reverse image search on flagged items, C2PA Content Credentials on published images (`fl_c2pa`, enabled on request by Cloudinary), and Hindi voice captions.
- **Photos can't count things:** a picture shows that planting happened, not that 500 saplings were planted. The claim checker says so, every time.

---

<div align="center">Built for Code Cubicle 6.0 by the FieldProof team.</div>
