# FieldProof AI demo script (5 minutes)

One story, told live: **the AI doubting the media, a person deciding, and a claim proved down to the pixel.** A shorter Cloudinary cut is at the end.

## Before you go on stage

- [ ] `npm run dev`; `GET /api/health` returns `status: ok` with Cloudinary and AI configured.
- [ ] `FRONTEND_URL` is the address judges' phones can open (deployed URL or a LAN address). QR codes point there.
- [ ] `npm run demo:seed -- --photos ./demo-photos --lat <lat> --lng <lng>` has run, so analyses are cached and no live AI call is needed. The folder holds: a 10–12 shot burst at the site, the same spot on another day, `old_*.jpg` from last year, a WhatsApp-forwarded copy of that old photo, and a photo of a laptop screen.
- [ ] Three browser profiles are signed in: **owner**, **field worker**, **verifier** (`*@greenroots.demo`).
- [ ] Twelve burst photos are kept aside for the live upload. A backup screen recording is on the laptop, and a phone hotspot is ready.

## The script

| # | Time | Who | What to do | What to say |
| --- | --- | --- | --- | --- |
| 1 | 0:20 | — | Title slide | "Geotagged photos did not stop fake attendance in MGNREGS. FieldProof is the layer that would have." |
| 2 | 0:30 | Owner | Organization page: roles, an invite code, the audit log with "History verified" | "Every NGO gets its own organization. The person who uploads is never the person who approves, and every action is in a tamper-evident log." |
| 3 | 0:45 | Field worker | Upload the 12 burst photos to *Bassi Plantation 2026* | "Twelve files, one event, three best shots. Only those three go to the AI, so we never hit the quota and reports never count the same moment twelve times." |
| 4 | 0:45 | Field worker | Upload the WhatsApp copy of last year's photo and the laptop-screen photo | "This one is last year's photo, forwarded, with metadata stripped. FieldProof still finds it and shows the original next to it. This one is a photo of a screen. Neither is called fraud; both need a second look, and every point of the score is explained." Open the **Trust** tab. |
| 5 | 0:30 | Judge | Hand a judge the dashboard QR code; they take a photo in their phone browser | "No install. The camera is the only way in. Place and server time are recorded at the shutter." It appears with a **Live · browser** badge. |
| 6 | 0:30 | Verifier | **Review**: riskiest first. Approve the burst event with one click. Try to approve their own upload and show it is refused. Reject the reused photo with a reason. | "Separation of duties in one click, and a reason the field worker can act on." |
| 7 | 0:30 | Owner | **Story Studio**: an Instagram card from approved evidence; scan its QR with a phone | "Faces blurred by default. The QR opens the public passport: the hash, the checks, the reviewer, and the exact Cloudinary transformation that made this card." |
| 8 | 0:30 | Owner | **Claim checker**: "We planted 500 saplings at Plot B in February" | "It finds the evidence, says how much is approved, and tells us what a photo can't prove: the count. That is what a CSR head needs before sending a report." |
| 9 | 0:20 | — | Roadmap slide | Signed app capture (built), device attestation, cross-NGO hash registry, satellite and weather cross-checks, C2PA on published images. |

## Cloudinary cut (for the sponsor judges)

Open any asset's **Cloudinary** tab and read one URL aloud. The upload analysis (`phash`, `quality_analysis`, `faces`) feeds the Trust Score and the best-shot choice. Every rendition, from the vision-model JPEG to the face-blurred public copy, the data-saver version and the campaign card, is a deterministic transformation that the passport records.

> "Remove Cloudinary and the trust layer stops working: duplicate detection, best shots, face blur, campaign assets and traceability all run on it."

## If something goes wrong

- **AI is slow or rate-limited:** use the seeded analyses and say they were saved from an earlier run. Upload still works; analysis can be retried.
- **No network on stage:** play the backup recording. Phones keep queued captures until the connection returns.
- **Phone camera blocked in the browser:** the page needs HTTPS (or localhost). Use the Flutter app or the backup recording.

## Hard questions

| Question | Answer |
| --- | --- |
| Your AI quota is tiny. How does this scale? | One analysis per event's best shots, paced under the per-minute budget. Hashes, EXIF, quality and faces come from our server and Cloudinary at upload, with no language model involved. |
| A browser capture can be spoofed. | Yes, so it is labelled "Live · browser" and capped below a signed app capture. Device attestation is on the roadmap. |
| What if the GPS stamp on a photo is fake? | A stamp is a declared signal, never proof. It must agree with the site and the period, or the score drops. |
| Won't you flag honest NGOs? | Nothing is rejected automatically. Checks explain; reviewers decide. WhatsApp forwards are labelled, not punished. |
| What does Cloudinary do that S3 could not? | Perceptual hash, quality and faces at upload, smart crops, face blur, overlays for campaign assets, and reproducible transformation URLs for traceability. |
| Who pays? | NGOs per active project. CSR teams and funders for portfolio views and auditor access; under the CSR Rules, larger CSR programmes need independent impact assessment, and this is the trail an assessor reads. |
