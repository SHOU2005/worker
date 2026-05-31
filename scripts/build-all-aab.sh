#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  build-all-aab.sh  —  Build signed AABs for all 4 Switch apps
#
#  Usage:
#    chmod +x scripts/build-all-aab.sh
#    ./scripts/build-all-aab.sh
#
#  Prerequisites:
#    • Java 17 JDK installed  (https://www.azul.com/downloads)
#    • Android Studio installed (https://developer.android.com/studio)
#    • ANDROID_HOME set (~/.zshrc: export ANDROID_HOME=$HOME/Library/Android/sdk)
#    • A keystore file at keystore/release.keystore (see below)
#    • VERCEL_URL set to your actual production URL
# ─────────────────────────────────────────────────────────────
set -e

# ── 0. Config ────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/aab"
KEYSTORE="$ROOT/keystore/release.keystore"

# !! UPDATE this to your Vercel production URL !!
VERCEL_URL="https://app.switchlocally.com"

# Keystore credentials — set as env vars or edit here
KEY_ALIAS="${KEY_ALIAS:-release}"
KEY_STORE_PASSWORD="${KEY_STORE_PASSWORD:-switchnow2024}"
KEY_PASSWORD="${KEY_PASSWORD:-switchnow2024}"

# ── 1. Checks ────────────────────────────────────────────────
echo "🔍 Checking environment…"
java -version 2>/dev/null || { echo "❌ Java not found. Install JDK 17 from https://www.azul.com/downloads"; exit 1; }
[ -n "$ANDROID_HOME" ] || { echo "❌ ANDROID_HOME not set. Add to ~/.zshrc and re-open terminal"; exit 1; }
[ -d "$ANDROID_HOME/platform-tools" ] || { echo "❌ Android SDK platform-tools not found at $ANDROID_HOME"; exit 1; }

# ── 2. Create keystore if missing ────────────────────────────
mkdir -p "$ROOT/keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "🔑 Creating release keystore (first-time setup)…"
  keytool -genkey -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEY_STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=Switch, OU=Mobile, O=SwitchNow, L=Bangalore, ST=Karnataka, C=IN"
  echo "✅ Keystore created at $KEYSTORE"
  echo "⚠️  BACK UP keystore/release.keystore — you need it for every future update!"
fi

# ── 3. Create signing.properties in each android dir ─────────
write_signing() {
  local dir="$1"
  cat > "$dir/signing.properties" << PROPS
storeFile=$KEYSTORE
storePassword=$KEY_STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
PROPS
}

# ── 4. Add signing to build.gradle if not already present ────
patch_build_gradle() {
  local gradle="$1/app/build.gradle"
  if ! grep -q "signingConfigs" "$gradle"; then
    # Insert signingConfigs block and reference it in release buildType
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

# ── 5. Build each app ────────────────────────────────────────
build_app() {
  local APP_NAME="$1"
  local CAP_CONFIG="$2"
  local ANDROID_DIR="$3"
  local START_PATH="$4"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Building: $APP_NAME"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cd "$ROOT"

  # Update server.url with production URL + path
  local FULL_URL="${VERCEL_URL}${START_PATH}"
  echo "  → Server URL: $FULL_URL"

  # Temporarily set the config
  cp "$CAP_CONFIG" capacitor.config.ts

  # Sync web assets to Android
  echo "  → Syncing Capacitor…"
  npx cap sync android --inline 2>&1 | tail -3

  # Write signing properties
  write_signing "$ANDROID_DIR"

  # Patch build.gradle for signing
  patch_build_gradle "$ANDROID_DIR"

  # Increment version code
  local GRADLE="$ANDROID_DIR/app/build.gradle"
  local CURRENT_CODE
  CURRENT_CODE=$(grep "versionCode" "$GRADLE" | head -1 | tr -d ' ' | cut -d' ' -f2 | tr -d '\n')
  local NEW_CODE=$((CURRENT_CODE + 1))
  sed -i '' "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"

  # Build AAB
  echo "  → Building AAB (this takes 2-5 min)…"
  cd "$ANDROID_DIR"
  ./gradlew bundleRelease --no-daemon -q

  # Copy output
  local AAB_SRC
  AAB_SRC=$(find . -name "*.aab" -path "*/release/*" | head -1)
  if [ -n "$AAB_SRC" ]; then
    local AAB_DEST="$OUT/${APP_NAME}-release.aab"
    cp "$AAB_SRC" "$AAB_DEST"
    echo "  ✅ $APP_NAME → build/aab/${APP_NAME}-release.aab"
  else
    echo "  ❌ AAB not found for $APP_NAME"
  fi

  cd "$ROOT"
}

# ── 6. Run all builds ────────────────────────────────────────
build_app "worker"   "capacitor.worker.config.ts"   "android"          ""
build_app "employer" "capacitor.employer.config.ts" "android-employer" "/employer"
build_app "captain"  "capacitor.captain.config.ts"  "android-captain"  "/captain/splash"
build_app "ops"      "capacitor.ops.config.ts"       "android-ops"      "/ops/login"

# ── 7. Restore original config ───────────────────────────────
cp capacitor.worker.config.ts capacitor.config.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All AABs built → build/aab/"
ls -lh "$OUT/"
echo ""
echo "  Upload each .aab to Google Play Console:"
echo "    worker-release.aab   → Worker app"
echo "    employer-release.aab → Employer app"
echo "    captain-release.aab  → Captain app"
echo "    ops-release.aab      → Ops app"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
