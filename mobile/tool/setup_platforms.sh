#!/usr/bin/env bash
# Generates the native Android and iOS projects for this app and adds the
# permissions FieldProof needs. Run once after cloning (needs the Flutter SDK):
#   cd mobile && ./tool/setup_platforms.sh
set -euo pipefail
cd "$(dirname "$0")/.."

flutter create . --project-name fieldproof_capture --org com.fieldproof --platforms=android,ios

# flutter create adds a counter-app widget test that does not apply here.
if [ -f test/widget_test.dart ] && grep -q "MyApp" test/widget_test.dart; then rm test/widget_test.dart; fi

MANIFEST=android/app/src/main/AndroidManifest.xml
add_permission() {
  grep -q "$1" "$MANIFEST" || perl -0pi -e "s|<application|<uses-permission android:name=\"$1\" />\n    <application|" "$MANIFEST"
}
add_permission android.permission.INTERNET
add_permission android.permission.CAMERA
add_permission android.permission.ACCESS_FINE_LOCATION
add_permission android.permission.ACCESS_COARSE_LOCATION
# Development only: lets the app reach a backend on http:// over the LAN.
# Remove for production builds, which must use https://.
grep -q usesCleartextTraffic "$MANIFEST" || perl -0pi -e 's|<application(\s)|<application android:usesCleartextTraffic="true"$1|' "$MANIFEST"
# Keep protected storage (session, signing key) out of Android auto-backup;
# restoring it onto a new install breaks its encryption.
grep -q allowBackup "$MANIFEST" || perl -0pi -e 's|<application(\s)|<application android:allowBackup="false"$1|' "$MANIFEST"

PLIST=ios/Runner/Info.plist
if [ -f "$PLIST" ] && command -v /usr/libexec/PlistBuddy >/dev/null; then
  set_plist() {
    /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"
  }
  set_plist NSCameraUsageDescription "FieldProof takes live photos of project work as evidence."
  set_plist NSLocationWhenInUseUsageDescription "FieldProof records where each photo was taken, only while the camera is open."
  # Development only, same reason as Android above.
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity dict" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$PLIST" 2>/dev/null || true
fi

flutter pub get
echo "Platforms ready. Run: flutter run --dart-define=API_URL=http://<your-computer-LAN-IP>:4000/api"
