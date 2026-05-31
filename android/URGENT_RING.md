# Switch Partner — urgent-job ring (Rapido / Swiggy style)

A `data`-only FCM push with `type=URGENT_JOB` will, on an installed native
APK build of `com.switchlocally.worker`:

1. Wake the device (even if the app is force-closed).
2. Surface a full-screen call-style activity over the lock screen.
3. Loop `res/raw/urgent_ring.wav` on the notification-ringtone audio
   stream so it overrides media-volume silencing.
4. Stop ringing the moment the worker taps **Accept** or **Decline**, or
   after 45 s (whichever comes first).

## Wiring (already in this branch)

| File | What it does |
|---|---|
| `app/src/main/AndroidManifest.xml` | Permissions (`USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `FOREGROUND_SERVICE_PHONE_CALL`), declares `UrgentRingService` (FCM), `UrgentRingForegroundService`, `IncomingJobActivity` |
| `app/src/main/java/.../UrgentRingService.kt` | Receives every FCM message, routes urgent jobs to the foreground service |
| `app/src/main/java/.../UrgentRingForegroundService.kt` | Wake-lock + MediaPlayer loop + the `setFullScreenIntent` notification |
| `app/src/main/java/.../IncomingJobActivity.kt` | Call-card UI, kills the ring on Accept / Decline, opens MainActivity at the job URL |
| `app/src/main/res/layout/activity_incoming_job.xml` | Dark full-bleed call card layout |
| `app/build.gradle` | Adds Kotlin + `firebase-messaging-ktx` deps |
| `build.gradle` (root) | Adds the Kotlin Gradle plugin classpath |

## One-time setup you (the human) must do

### 1. Firebase project
- Open the existing `hearus-4f2fe` project at https://console.firebase.google.com/.
- Add an Android app with package name **`com.switchlocally.worker`**.
- Download the generated **`google-services.json`** into
  `android/app/google-services.json` (the gradle file already detects it
  and applies the plugin automatically).
- In the same Firebase project's **SHA-1 / SHA-256** section paste your
  release keystore fingerprints — required for `firebase-messaging` to
  validate the token on a signed APK.

### 2. Signing keystore
- Create a keystore once: `keytool -genkey -v -keystore switch-worker.keystore -alias switch-worker -keyalg RSA -keysize 2048 -validity 10000`
- Put the props in `android/signing.properties` (already wired in
  `app/build.gradle`):
  ```
  storeFile=../switch-worker.keystore
  storePassword=••••
  keyAlias=switch-worker
  keyPassword=••••
  ```
- Add `android/signing.properties` and the keystore to `.gitignore`.

### 3. Server-side payload change
The existing `lib/fcm-server.ts` already calls `broadcastUrgentJob`, but
right now it sends `notification: { title, body }` which Android shows
as a normal heads-up and **never reaches our service**. Move the title
+ body into `data` and set `priority: 'high'`:

```ts
admin.messaging().sendEachForMulticast({
  tokens,
  data: {
    type:      'URGENT_JOB',
    title:     'Cleaner · Sector 14',
    body:      '₹400 · 4 hrs · 1.2 km',
    shiftId:   shift.id,
    url:       `/worker/jobs/${shift.id}`,
    expiresAt: String(Math.floor(Date.now() / 1000) + 45),
  },
  android: { priority: 'high' },
  apns: { headers: { 'apns-priority': '10' } },
})
```

No `notification:` block — that's what guarantees `UrgentRingService`
gets called instead of FCM auto-posting its own notification.

### 4. Build the APK
```bash
# from the project root
npm run build              # builds /out
npx cap sync android       # copies /out into the Android assets
cd android
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

### 5. Distribute
Either side-load (`adb install app-release.apk`) for testing, or upload
to the Play Console (`./gradlew bundleRelease` produces an AAB). For
internal distribution you can also host the APK behind a download link
on `app.switchlocally.com/players` and tell workers to install it.

## What this does NOT do

- **iOS**: Apple's APNs has no equivalent to `setFullScreenIntent`. iOS
  workers will still get push notifications, but no auto-launch.
- **Android 14+ `USE_FULL_SCREEN_INTENT` gate**: the OS now requires the
  user to grant the permission from app settings on first urgent push.
  We surface a chip in `/worker/dashboard` that deep-links them there;
  otherwise the notification falls back to a heads-up.
- **Do Not Disturb**: `setBypassDnd(true)` only takes effect if the
  worker grants DnD access from system settings.

## Testing without a real backend push

```bash
adb shell am start \
  -n com.switchlocally.worker/.IncomingJobActivity \
  --es title "Cleaner · Sector 14" \
  --es body  "₹400 · 4 hrs · 1.2 km" \
  --es url   "/worker/jobs/test"
```

That will open the activity directly so you can verify the layout, the
Accept/Decline handlers, and the lockscreen behaviour without sending a
real FCM.
