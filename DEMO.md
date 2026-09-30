# FieldProof AI demo script (90–120 seconds)

Prepare two clearly labeled field images or short videos for one project. Use genuine project media when available; if using synthetic material, label it as demo evidence.

## Pre-demo checklist

- PostgreSQL is reachable and all Prisma migrations are applied.
- `GET http://localhost:4000/api/health` returns `status: ok`, with Cloudinary and AI configured.
- Backend and frontend environment files are present locally and remain git-ignored.
- The frontend is available at `http://localhost:5173`.
- Two small, clearly dated sample images are ready for the same project.

1. **Dashboard — 10 seconds**  
   Open the dashboard and point out live project, evidence, AI-coverage, comparison, and report counts.

2. **Project and upload — 20 seconds**  
   Open the project, choose **Add evidence**, drag in the media, leave automatic analysis enabled, and upload. Explain that originals are stored in Cloudinary while PostgreSQL keeps canonical project and processing state.

3. **Evidence intelligence — 15 seconds**  
   Open an analyzed asset. Show the detailed observation, activity, environmental/infrastructure signals, uncertainty, evidence strength, confidence, and Source / Traceability tab.

4. **Natural-language search — 10 seconds**  
   In Evidence Library, ask a query such as “Find tree planting evidence in Jaipur after January 2026.” Show the interpreted filters and deterministic results.

5. **Timeline — 10 seconds**  
   Return to the project Timeline and switch between Month, Activity, and Location groupings.

6. **Before and after — 20 seconds**  
   Open Comparisons, select the earlier and later evidence, and generate analysis. Highlight visible changes, confidence, uncertainty, limitations, and links back to both originals.

7. **Report and traceability — 20 seconds**  
   Open Reports, generate an Impact Summary, then show its evidence gaps and methodology disclaimer. Finish by clicking a Source evidence record to return to the Cloudinary-backed original.

## Provider fallback

If Groq is temporarily slow or unavailable, open a previously persisted analyzed asset, comparison, and report. Clearly state that the view is a saved prior result; do not present it as a newly generated response. Upload remains usable when analysis fails, and failed analysis can be retried later.

## Exact restart commands

From the repository root:

```bash
npm run dev
```

Or restart the processes separately:

```bash
npm run dev -w backend
npm run dev -w frontend
```

For a production verification run:

```bash
npm run build
NODE_ENV=production npm run start -w backend
npm run preview -w frontend -- --host 127.0.0.1
```

## Known fragile actions

- Keep individual uploads at or below 25 MB and batches at or below ten files.
- Allow an active AI request to finish before retrying the same asset.
- Do not delete source evidence or comparisons until reports that reference them are deleted or regenerated.
- The preview server uses port 4173 by default; set `FRONTEND_URL` to its exact origin when testing that mode. The standard demo uses port 5173.
