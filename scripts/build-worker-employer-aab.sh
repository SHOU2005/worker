#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  build-worker-employer-aab.sh
#  Build signed AABs for ONLY the worker (player) + employer apps.
#
#  Worker:   com.switchlocally.worker  →  app.switchlocally.com/players
#  Employer: com.switchlocally.employer →  app.switchlocally.com/employer
#
#  The install-app screen (PWAGate) is auto-skipped inside the Capacitor
#  WebView — see components/shared/PWAGate.tsx.
#
#  Prerequisites:
#    - Java 17 JDK installed and on PATH
#    - Android Studio installed (SDK + build-tools)
#    - ANDROID_HOME set (export ANDROID_HOME=$HOME/Library/Android/sdk)
#    - Keystore at keystore/release.keystore (created on first run)
#
#  Usage:
#    chmod +x scripts/build-worker-employer-aab.sh
#    ./scripts/build-worker-employer-aab.sh
# ─────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/aab"
KEYSTORE="$ROOT/keystore/release.keystore"

# Production URLs — Capacitor's server.url already encodes the path in
# each per-app config file. Don't edit unless the deploy URL changes.
KEY_ALIAS="${KEY_ALIAS:-release}"
KEY_STORE_PASSWORD="${KEY_STORE_PASSWORD:-switchnow2024}"
KEY_PASSWORD="${KEY_PASSWORD:-switchnow2024}"

# ── Environment checks ──────────────────────────────────────
echo "🔍 Checking environment…"
java -version 2>/dev/null || { echo "❌ Java not found. Install JDK 17 from https://www.azul.com/downloads"; exit 1; }
[ -n "$ANDROID_HOME" ] || { echo "❌ ANDROID_HOME not set. Add to ~/.zshrc and re-open terminal"; exit 1; }
[ -d "$ANDROID_HOME/platform-tools" ] || { echo "❌ Android SDK platform-tools not found at $ANDROID_HOME"; exit 1; }

# ── Keystore (created on first run, reused thereafter) ──────
mkdir -p "$ROOT/keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "🔑 Creating release keystore (one-time)…"
  keytool -genkey -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEY_STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=Switch, OU=Mobile, O=SwitchNow, L=Bangalore, ST=Karnataka, C=IN"
  echo "✅ Keystore created at $KEYSTORE — BACK THIS UP. Every Play Store update needs it."
fi

write_signing() {
  local dir="$1"
  cat > "$dir/signing.properties" << PROPS
storeFile=$KEYSTORE
storePassword=$KEY_STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
PROPS
}

patch_build_gradle() {
  local gradle="$1/app/build.gradle"
  if ! grep -q "signingConfigs" "$gradle"; then
    sed -i '' '/^android {/a\
\
    signingConfigs {\
        release {\
            def props = new Properties()\
            def propsFile = rootProject.file("signing.properties")\
            if (propsFile.exists()) { props.load(new FileInputStream(propsFile)) }\
            storeFile file(props["storeFile"] ?: "")\
            storePassword props["storePassword"] ?: ""\
            keyAlias props["keyAlias"] ?: ""\
            keyPassword props["keyPassword"] ?: ""\
        }\
    }\
' "$gradle"
    sed -i '' 's/buildType release {/buildType release {\n            signingConfig signingConfigs.release/' "$gradle" 2>/dev/null || true
  fi
}

mkdir -p "$OUT"

build_app() {
  local APP_NAME="$1"
  local CAP_CONFIG="$2"
  local ANDROID_DIR="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Building: $APP_NAME"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cd "$ROOT"

  # Capacitor reads the active capacitor.config.ts — swap in per-app file
  cp "$CAP_CONFIG" capacitor.config.ts
  echo "  → Using config: $CAP_CONFIG"

  echo "  → Syncing Capacitor → $ANDROID_DIR…"
  npx cap sync android --inline 2>&1 | tail -3

  write_signing "$ANDROID_DIR"
  patch_build_gradle "$ANDROID_DIR"

  # Bump versionCode so Play accepts the upload as a new build
  local GRADLE="$ANDROID_DIR/app/build.gradle"
  local CURRENT_CODE
  CURRENT_CODE=$(grep "versionCode" "$GRADLE" | head -1 | tr -d ' ' | cut -d' ' -f2 | tr -d '\n')
  local NEW_CODE=$((CURRENT_CODE + 1))
  sed -i '' "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"
  echo "  → versionCode bumped: $CURRENT_CODE → $NEW_CODE"

  echo "  → Building AAB (2–5 min)…"
  cd "$ANDROID_DIR"
  ./gradlew bundleRelease --no-daemon -q

  local AAB_SRC
  AAB_SRC=$(find . -name "*.aab" -path "*/release/*" | head -1)
  if [ -n "$AAB_SRC" ]; then
    cp "$AAB_SRC" "$OUT/${APP_NAME}-release.aab"
    echo "  ✅ $APP_NAME → build/aab/${APP_NAME}-release.aab"
  else
    echo "  ❌ AAB not found for $APP_NAME"
  fi

  cd "$ROOT"
}

# Worker / player app — com.switchlocally.worker, loads /players
build_app "worker"   "capacitor.worker.config.ts"   "android"

# Employer app — com.switchlocally.employer, loads /employer
build_app "employer" "capacitor.employer.config.ts" "android-employer"

# Restore the worker config as default so subsequent `cap sync` commands
# don't accidentally use the employer config.
cp capacitor.worker.config.ts capacitor.config.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Done. AABs in build/aab/"
ls -lh "$OUT/" 2>/dev/null
echo ""
echo "  Upload to Google Play Console:"
echo "    worker-release.aab   → 'Switch Partner' (com.switchlocally.worker)"
echo "    employer-release.aab → 'Switch'         (com.switchlocally.employer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
