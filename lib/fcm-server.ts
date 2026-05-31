import { prisma } from './prisma'
import * as admin from 'firebase-admin'

// ── Init firebase-admin once per process ─────────────────────────────────────
let adminInited = false
function ensureAdmin(): admin.app.App | null {
  if (adminInited) return admin.apps.length ? admin.apps[0] : null
  adminInited = true

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY

  let credential: admin.credential.Credential | null = null
  try {
    if (json) {
      credential = admin.credential.cert(JSON.parse(json))
    } else if (projectId && clientEmail && privateKey) {
      credential = admin.credential.cert({
        projectId,
        clientEmail,
        // Private keys often have \n escaped in env files
        privateKey: privateKey.replace(/\\n/g, '\n'),
      })
    }
  } catch (err) {
    console.error('[FCM] failed to parse service account:', err)
  }

  if (!credential) {
    console.warn('[FCM] service account not configured — push notifications will only log to console')
    return null
  }

  try {
    return admin.initializeApp({ credential })
  } catch (err) {
    console.error('[FCM] initializeApp failed:', err)
    return null
  }
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  data?: Record<string, string>
}

// ── Low-level send to multiple tokens ────────────────────────────────────────
async function sendToTokens(tokens: string[], payload: PushPayload): Promise<{ success: number; failure: number; staleTokens: string[] }> {
  if (tokens.length === 0) return { success: 0, failure: 0, staleTokens: [] }

  const app = ensureAdmin()
  if (!app) {
    console.log(`[FCM-DEV] would push to ${tokens.length} tokens — "${payload.title}: ${payload.body}"`)
    return { success: tokens.length, failure: 0, staleTokens: [] }
  }

  const messaging = admin.messaging(app)
  const isUrgent  = payload.data?.type === 'URGENT_JOB'

  // For URGENT_JOB we ship a data-ONLY message on Android. If we left
  // `notification` (top-level or under `android`) set, FCM auto-posts a
  // heads-up and never invokes our native UrgentRingService — meaning no
  // ring, no lock-screen wake, no full-screen intent. Title + body are
  // moved into the data payload so the service can read them and post
  // its own setFullScreenIntent notification. Web (service worker) and
  // iOS (APNs) still get notification info via the per-platform blocks
  // below, so non-Android clients are unchanged.
  const baseMessage: admin.messaging.MulticastMessage = {
    tokens,
    data: {
      url:   payload.url || '/',
      ...(isUrgent ? { title: payload.title, body: payload.body } : {}),
      ...(payload.data || {}),
    },
    webpush: {
      fcmOptions: { link: payload.url || '/' },
      notification: { title: payload.title, body: payload.body, icon: '/icons/icon-192.png' },
    },
    android: isUrgent
      ? { priority: 'high' /* no `notification` → native service runs */ }
      : {
          priority: 'high',
          notification: {
            channelId:   'switch-default',
            clickAction: payload.url,
            sound:       'default',
          },
        },
    apns: isUrgent ? {
      payload: { aps: { sound: 'urgent_ring.caf', interruptionLevel: 'time-sensitive' } },
    } : undefined,
  }

  // Non-urgent messages keep their normal top-level notification block so
  // browsers (web service worker) auto-render them. For urgent we leave
  // top-level `notification` unset so Android SDK delivers as data-only.
  const message: admin.messaging.MulticastMessage = isUrgent
    ? baseMessage
    : { ...baseMessage, notification: { title: payload.title, body: payload.body } }

  try {
    const res = await messaging.sendEachForMulticast(message)
    const stale: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          stale.push(tokens[i])
        }
      }
    })
    return { success: res.successCount, failure: res.failureCount, staleTokens: stale }
  } catch (err) {
    console.error('[FCM] sendEachForMulticast failed:', err)
    return { success: 0, failure: tokens.length, staleTokens: [] }
  }
}

// Drop stale tokens from any User row that has them. Earlier version
// nuked the entire fcmTokens array when ANY one token was stale, which
// silently killed notifications for multi-device users (laptop token
// expires → phone token also wiped). Now we surgically remove just the
// stale tokens and leave the rest in place.
async function pruneStaleTokens(stale: string[]) {
  if (stale.length === 0) return
  for (const t of stale) {
    const users = await prisma.user.findMany({
      where:  { fcmTokens: { has: t } },
      select: { id: true, fcmToken: true, fcmTokens: true },
    })
    for (const u of users) {
      const remaining = (u.fcmTokens || []).filter(x => x !== t)
      await prisma.user.update({
        where: { id: u.id },
        data:  {
          fcmTokens: { set: remaining },
          // legacy single-token field — also clear it if it matched
          ...(u.fcmToken === t ? { fcmToken: null } : {}),
        },
      }).catch(() => {})
    }
  }
}

// ── Send to a user ───────────────────────────────────────────────────────────
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  // Persist regardless of delivery
  await prisma.notification.create({
    data: {
      userId,
      title: payload.title,
      body:  payload.body,
      data:  payload.data ? JSON.stringify(payload.data) : undefined,
    },
  }).catch(err => console.error('[FCM] persist notification failed:', err))

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { fcmTokens: true, fcmToken: true },
  })
  if (!user) return

  const tokens = Array.from(new Set([
    ...(user.fcmTokens || []),
    ...(user.fcmToken ? [user.fcmToken] : []),
  ])).filter(Boolean)
  if (tokens.length === 0) return

  const res = await sendToTokens(tokens, payload)
  if (res.staleTokens.length > 0) await pruneStaleTokens(res.staleTokens)
}

// ── Bulk send to users ───────────────────────────────────────────────────────
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<{ success: number; failure: number }> {
  if (userIds.length === 0) return { success: 0, failure: 0 }

  // Persist notifications
  await prisma.notification.createMany({
    data: userIds.map(userId => ({
      userId,
      title: payload.title,
      body:  payload.body,
      data:  payload.data ? JSON.stringify(payload.data) : undefined,
    })),
  }).catch(err => console.error('[FCM] persist bulk notifications failed:', err))

  const users = await prisma.user.findMany({
    where:  { id: { in: userIds } },
    select: { fcmTokens: true, fcmToken: true },
  })
  const tokens = Array.from(new Set(users.flatMap(u => [
    ...(u.fcmTokens || []),
    ...(u.fcmToken ? [u.fcmToken] : []),
  ]))).filter(Boolean)

  if (tokens.length === 0) return { success: 0, failure: 0 }

  // FCM accepts up to 500 tokens per multicast call
  let success = 0, failure = 0
  const stale: string[] = []
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500)
    const res = await sendToTokens(batch, payload)
    success += res.success
    failure += res.failure
    stale.push(...res.staleTokens)
  }
  if (stale.length) await pruneStaleTokens(stale)

  return { success, failure }
}

// ── Pre-built helpers ────────────────────────────────────────────────────────
export async function notifyWorkerAssigned(employerId: string, workerName: string, jobTitle: string, jobId: string) {
  await pushToUser(employerId, {
    title: `Worker assigned — ${jobTitle}`,
    body:  `${workerName} is on the way to your location`,
    url:   `/employer/job/${jobId}`,
    data:  { type: 'WORKER_ASSIGNED', jobId },
  })
}

export async function notifyNewJob(workerId: string, jobTitle: string, location: string, shiftId: string) {
  await pushToUser(workerId, {
    title: `New job near you — ${jobTitle}`,
    body:  `${location} · Tap to view details`,
    url:   `/worker/jobs`,
    data:  { type: 'NEW_JOB', shiftId },
  })
}

export async function notifyJobStarted(workerId: string, jobTitle: string, jobId: string) {
  await pushToUser(workerId, {
    title: 'Job started ✅',
    body:  `Your shift for "${jobTitle}" has begun. Good luck!`,
    url:   `/worker/shifts`,
    data:  { type: 'JOB_STARTED', jobId },
  })
}

export async function notifyJobCompleted(workerId: string, amount: number, jobTitle: string) {
  await pushToUser(workerId, {
    title: `Shift complete — ₹${amount} earned`,
    body:  `Great work on "${jobTitle}"! Payment will be processed shortly.`,
    url:   `/worker/earnings`,
    data:  { type: 'JOB_COMPLETED' },
  })
}

export async function notifyPaymentReceived(workerId: string, amount: number) {
  await pushToUser(workerId, {
    title: `₹${amount} credited to your account`,
    body:  'Payment received. Check your earnings.',
    url:   `/worker/earnings`,
    data:  { type: 'PAYMENT_RECEIVED' },
  })
}

// ── Broadcast a job ping to every worker ────────────────────────────────────
export async function broadcastUrgentJob(
  shiftId:  string,
  title:    string,
  location: string,
  pay?:     string,
  filters?: { city?: string; role?: string },
): Promise<void> {
  // EVERY worker receives every job ping — no filter on KYC, isAvailable,
  // or lastSeenAt. Per ops policy: any new job should ring on every
  // worker's device and open the app to /worker/jobs?urgent=… on tap.
  //
  // Earlier, role / city / isAvailable / lastSeenAt filters all narrowed
  // the recipient list aggressively, which is why employers reported
  // "no notification when I post a job":
  //   - role filter compared "Cleaner" (capitalized cart label) against
  //     worker.skills which stores "cleaning" (lowercase id from
  //     /app/register JOB_TYPES) — always zero matches
  //   - lastSeenAt cutoff hid every worker who hadn't opened the app
  //     in the last 24h
  //   - isAvailable hid every worker currently toggled offline
  // Now the only gate is "not soft-deleted", same as `/api/shifts`
  // (visibility) and `/api/shifts/[id]/accept` (action).
  //
  // Underused arg `filters` kept in the signature so callers don't
  // break — currently ignored.
  void filters
  const workers = await prisma.workerProfile.findMany({
    where:  { deletedAt: null },
    select: { user: { select: { id: true } } },
  })

  const userIds = workers.map(w => w.user.id)
  await pushToUsers(userIds, {
    title: `⚡ New Job — ${title}`,
    body:  `${location}${pay ? ` · ${pay}` : ''} · First to accept wins`,
    // Land workers on /worker/dashboard — that page already flashes the
    // active urgent job card front-and-center, so we don't need to deep
    // link into a per-job screen. The shiftId is in data.shiftId for the
    // dashboard to highlight the right row.
    url:   `/worker/dashboard?urgent=${shiftId}`,
    // type stays URGENT_JOB so sendToTokens routes it as a data-only
    // payload on Android (which fires UrgentRingService → call-style
    // full-screen ring) and as time-sensitive on iOS.
    //
    // expiresAt tells the Android foreground service when to stop
    // ringing — 45 s is the same ceiling baked into
    // UrgentRingForegroundService.MAX_RING_MS.
    data:  {
      type:      'URGENT_JOB',
      shiftId,
      title,
      location,
      expiresAt: String(Math.floor(Date.now() / 1000) + 45),
      ...(pay ? { pay } : {}),
    },
  })
}

export async function notifyWorkerAccepted(employerId: string, workerName: string, jobTitle: string, jobId: string) {
  await pushToUser(employerId, {
    title: `${workerName} accepted your job`,
    body:  `${jobTitle} · Tap to confirm and pay`,
    url:   `/employer/job/${jobId}`,
    data:  { type: 'WORKER_ACCEPTED', jobId },
  })
}

// ── Role-targeted broadcast (used by Ops broadcast) ──────────────────────────
export async function broadcastToRole(
  role: 'WORKER' | 'CAPTAIN' | 'EMPLOYER' | 'ALL',
  payload: PushPayload,
): Promise<{ targeted: number; success: number; failure: number }> {
  const where = role === 'ALL'
    ? { role: { in: ['WORKER', 'CAPTAIN', 'EMPLOYER'] as ('WORKER' | 'CAPTAIN' | 'EMPLOYER')[] } }
    : { role }

  const users = await prisma.user.findMany({ where, select: { id: true } })
  const ids = users.map(u => u.id)
  const res = await pushToUsers(ids, payload)
  return { targeted: ids.length, success: res.success, failure: res.failure }
}
