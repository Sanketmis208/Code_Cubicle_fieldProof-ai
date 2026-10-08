# FieldProof mobile app (Flutter)

The whole product on the phone, for every role, against the same backend and the same permission table as the web app. The one deliberate difference: evidence enters the app **only through its own camera**. There is no gallery and no file picker; uploading existing files stays a web-app feature.

| Tab | Who sees it | What it does |
| --- | --- | --- |
| Home | Everyone | Organization counts, quick actions (review queue, add member, claim checker, reports, assistant), this phone's sync state, newest evidence |
| Projects | Everyone (scoped by role) | Create and edit projects (`project.create` / `project.edit`); per project: Evidence grid with trust badges, Targets (set, record a batch, confirm), Sites (add with current location, remove), Team (assign and remove members); reports and the claim checker from the project menu |
| Capture | Upload roles | Pick a project, then the camera |
| Review | Review roles | Queue riskiest first, grouped by event; approve / re-shoot / reject with reasons; never your own upload |
| Org | `org.members.view` | Overview and roles, Members (add by email with a one-time setup link, change role, resend link, remove), Audit trail with hash-chain check, settings for owners and admins |
| Me | Everyone | Switch or create an organization, members and roles, claim checker, reports, assistant, submissions, phone sync state, sign out |

Everything the web app can do is here, by the same role: an admin adds a field worker by email from the phone, a program manager sets up a project with sites and a 500-sapling target, the field worker captures and records batches, a verifier reviews and confirms, and anyone can check a claim, read a cited report or share an Evidence Passport link. Signing in uses the email and password set through the link an admin sent; someone who is in no organization yet can create one from the app and becomes its owner.

At the shutter the app records:

| Fact | How | Why it matters |
| --- | --- | --- |
| File fingerprint | SHA-256 of the exact JPEG bytes | Any later edit changes the hash |
| Place | GPS fix with accuracy; Android's mock-location flag | Checked against project sites; fake-GPS apps are flagged |
| Time | Server time + the phone's monotonic timer since the last sync (`TRUSTED`); the phone clock only when offline since launch (`DEVICE`) | Changing the phone's clock does not change evidence time |
| Signature | Ed25519 over the manifest string, with a key created on this phone for this user | Proves the file and its facts were not changed after capture |

Captures go into an offline queue first. They are sent when there is signal and retried automatically. A retry of the same photo is recognised by the server, so nothing is duplicated.

## Screens

1. **Sign in** with the email an admin added; **Forgot password** sends a reset link.
2. **Home**: organization counts, sync health (time synced, signing key ready, captures waiting), newest evidence.
3. **Camera**: live preview with GPS accuracy, an "Inside Plot B" or "420 m from Plot B" badge, a mock-location warning, and a *Match last* ghost overlay for repeat photos from the same spot. The shutter is never blocked by weak GPS.
4. **My submissions**: per photo, waiting / sent / not accepted, the Trust Score, and the reviewer's decision, including re-shoot requests with the reviewer's note.

## Run it

Requirements: Flutter 3.27 or newer, and Android Studio or Xcode for a device or emulator.

```bash
cd mobile
./tool/setup_platforms.sh
flutter test
flutter run --dart-define=API_URL=http://<your-computer-LAN-IP>:4000/api
```

`tool/setup_platforms.sh` generates the native `android/` and `ios/` folders with `flutter create`. It then adds the permissions the app needs: camera, fine and coarse location, internet, and the iOS usage strings. Those folders are generated, so they are not committed.

### Choosing the API address

`API_URL` must include `/api`.

| Where the app runs | API_URL |
| --- | --- |
| Android emulator, backend on the same computer | `http://10.0.2.2:4000/api` (the default) |
| iOS simulator, backend on the same computer | `http://localhost:4000/api` |
| Physical phone on the same Wi-Fi | `http://<computer-LAN-IP>:4000/api` (find it with `ipconfig getifaddr en0` on macOS) |
| Deployed backend | `https://<your-domain>/api` |

The setup script allows plain `http://` for local development only. Production builds must use `https://`.

Public passport links shown in the app use the API origin without `/api` (right once web and API share a domain). During development the web app runs on another port, so pass it: `--dart-define=WEB_URL=http://<computer-LAN-IP>:5173`.

### Try the full flow

1. In the web app, as Owner or Admin, open **Organization → Members** and add a **Field worker** by email. Open the setup link (emailed, or shown to you when SMTP is off) and choose a password.
2. In a project's **Team** tab, assign that person. In its **Sites** tab, add a site with "Use my current location".
3. In the app, sign in with that email and password.
4. Open the project and take photos.
5. Back on the web app, open **Review** as a Verifier. The captures carry the badge **Live · app** with *Device signature: signed on the capturing device*, and score highest.
6. Turn on a mock-location app on the phone and capture again. That photo is flagged *Needs a second look*.

## Code layout

```
lib/
  main.dart                 app entry, routes by session state
  config.dart               API_URL (--dart-define)
  theme.dart                brand colours
  api/api_client.dart       bearer token, X-Organization-Id, error mapping, offline detection
  core/                     pure logic (unit tested): manifest + ISO time, site distance
  services/
    device_identity.dart    Ed25519 key per user, enrolment, signing
    trusted_clock.dart      server time + monotonic timer
    location_service.dart   GPS stream, mock flag; never blocks capture
    capture_queue.dart      persistent offline queue, retry, status refresh
    secure_store.dart       token and keys in platform-protected storage
  state/app_state.dart      session, organization switch, projects
  screens/                  login, shell (bottom nav), dashboard, projects, project form, project detail,
                            project team, organization (members, audit, settings), no organization,
                            evidence detail (with passport sharing), review, claims, reports, assistant,
                            profile, capture picker, capture, submissions
test/core_test.dart         manifest signing and tamper detection, geo, time format
```

## Honest limits (and the roadmap)

- **Device integrity is not yet attested.** Play Integrity on Android and App Attest on iOS are designed but not built, so a rooted phone could run a modified app. The server labels app captures accordingly and the score reflects it.
- **The key is not in secure hardware.** The signing key is created in software and stored in platform-protected storage (Android Keystore-backed encryption, iOS Keychain). Hardware-backed keys are the next step.
- **Offline time is less certain.** Time is `TRUSTED` only after a sync during the current app session. If the app is opened offline, captures use the phone clock and say so (`DEVICE`); the server checks the clock is not in the future.
- **Signing out deletes unsent captures.** On a shared phone this keeps one person's unsent work from being uploaded under another account. An expired session keeps them until the same person signs in again.
