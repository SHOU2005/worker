// Client-side tool registry for the Jyoti voice assistant.
//
// ElevenLabs Conversational AI calls these from the browser side when the
// agent decides to invoke a client tool. The contract:
//   - Each tool receives a JSON `parameters` object that matches the schema
//     declared on the ElevenLabs agent (kept in sync via
//     scripts/update_jyoti_worker_arrival_agent.py in Vance-prod).
//   - Each tool returns a plain string that becomes the tool result for
//     Jyoti's next reasoning step. Keep results SHORT (~60 chars) because
//     the agent has to read them out loud or fold them into a reply.
//   - Errors should be returned as the result string starting with "error:"
//     so the agent can apologise instead of crashing the conversation.
//
// Side effects (opening maps, opening camera, filling OTP boxes) happen via
// callbacks the host passes in `ClientToolDeps` — keeping the tools pure of
// React makes them easier to unit-test and to swap when the UI changes.

import { openMaps, type MapsTarget } from './open-maps'

/** Host-provided dependencies. JyotiArrivalFlow wires these up. */
export interface ClientToolDeps {
  /** The shift Jyoti is currently helping with. Null when worker summons
   *  her without an active shift. */
  shift: {
    id:         string
    title?:     string
    address?:   string
    city?:      string
    lat?:       number
    lng?:       number
    mapsUrl?:   string
  } | null

  /** Open the worker's camera in the existing ArrivalSelfieCapture flow.
   *  Resolves when the worker either uploads or cancels. */
  openArrivalCamera: () => Promise<{ uploaded: boolean }>

  /** Programmatically fill the 4-digit OTP boxes (visual feedback only —
   *  Jyoti also reads them back for confirmation before submitting). */
  fillOtpDigits: (digits: string) => void

  /** Submit the currently-entered OTP via the existing arrival endpoint.
   *  Returns true if the shift transitions to IN_PROGRESS. */
  submitOtp: (digits: string) => Promise<{ ok: boolean; message?: string }>

  /** Current geo distance to employer in metres, or null if unknown. */
  readDistanceToEmployer: () => Promise<number | null>

  /** Launch the phone dialer with the employer's number pre-filled. Returns
   *  true if a number was available, false if the shift has no employer phone. */
  callEmployer: () => boolean

  /** End the conversation (stop the ElevenLabs WS, hide the orb). */
  endConversation: () => void
}

/** Tool implementations indexed by the tool name configured on the agent. */
export function buildClientToolHandlers(deps: ClientToolDeps): Record<string, (params: Record<string, unknown>) => Promise<string> | string> {
  return {
    /** Open Google Maps for the active shift's employer. */
    open_employer_maps: () => {
      if (!deps.shift) return 'error: koi active shift nahi hai abhi'
      const target: MapsTarget = {
        address: deps.shift.address,
        city:    deps.shift.city,
        lat:     deps.shift.lat,
        lng:     deps.shift.lng,
        mapsUrl: deps.shift.mapsUrl,
        label:   deps.shift.title,
      } as MapsTarget
      const opened = openMaps(target)
      return opened
        ? 'maps khol diya, raasta dikha raha hai'
        : 'error: is shift ka address nahi mil raha'
    },

    /** Open the arrival selfie camera. */
    open_arrival_camera: async () => {
      try {
        const r = await deps.openArrivalCamera()
        return r.uploaded
          ? 'selfie upload ho gayi'
          : 'worker ne selfie cancel kar di'
      } catch (e) {
        return `error: camera nahi khul raha (${(e as Error).message})`
      }
    },

    /** Visually fill the 4 OTP boxes. Used to give the worker a chance to
     *  confirm before Jyoti actually submits. */
    fill_otp_digits: (params) => {
      const digits = String(params.digits ?? '').replace(/\D/g, '').slice(0, 4)
      if (digits.length !== 4) return 'error: 4 digits chahiye, mila ' + digits.length
      deps.fillOtpDigits(digits)
      return `OTP boxes mein ${digits.split('').join('-')} bhar diya. confirm kar lo`
    },

    /** Submit the OTP. Returns whether the shift started. */
    verify_otp_and_start: async (params) => {
      const digits = String(params.digits ?? '').replace(/\D/g, '').slice(0, 4)
      if (digits.length !== 4) return 'error: OTP 4 digits ka hona chahiye'
      try {
        const r = await deps.submitOtp(digits)
        return r.ok
          ? 'kaam start ho gaya'
          : `error: ${r.message || 'OTP galat hai'}`
      } catch (e) {
        return `error: ${(e as Error).message}`
      }
    },

    /** Distance check so Jyoti can decide whether to prompt for arrival. */
    read_distance_to_employer: async () => {
      const d = await deps.readDistanceToEmployer()
      if (d === null) return 'distance pata nahi chal raha'
      if (d < 150)  return `bahut paas hain — ${Math.round(d)} metre`
      if (d < 1000) return `${Math.round(d)} metre door`
      return `${(d / 1000).toFixed(1)} km door`
    },

    /** Open the phone dialer pre-filled with the employer's number. */
    call_employer: () => {
      const ok = deps.callEmployer()
      return ok
        ? 'employer ko phone dial kar rahi hu'
        : 'error: employer ka phone number nahi mila'
    },

    /** Worker said bye — close the session. */
    end_conversation: () => {
      deps.endConversation()
      return 'goodbye'
    },
  }
}

/** Geodesic distance in metres between two points. Haversine formula —
 *  accurate enough for arrival-flow distances (<5km typical), avoids the
 *  need to pull in a maps SDK on the client. */
export function haversineMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000 // metres
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
