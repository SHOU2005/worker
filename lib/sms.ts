export async function sendSMS(to: string, otp: string): Promise<void> {
  const apiKey = process.env.FAST2SMS_API_KEY

  if (!apiKey) {
    // No SMS provider configured — print OTP to server console for dev/testing
    console.log(`\n📱 OTP for +91${to} → ${otp}\n`)
    return
  }

  try {
    const res = await fetch(
      `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}` +
      `&route=otp&variables_values=${otp}&flash=0&numbers=${to}`,
      { method: 'GET' }
    )
    const data = await res.json()
    if (!data.return) console.error('[Fast2SMS]', data.message)
  } catch (err) {
    console.error('[SMS] Delivery failed, OTP was:', otp, err)
  }
}

export function buildOTPMessage(otp: string): string {
  return `${otp} is your Switch OTP. Valid for 10 minutes. Do not share with anyone.`
}

// Generic transactional SMS (non-OTP) via Fast2SMS quick route. Used for
// admin alerts on employer bookings, etc. Falls back to console.log when no
// provider is configured so dev/test flows still surface the message.
export async function sendTextSMS(to: string, message: string): Promise<void> {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) {
    console.log(`\n📱 SMS to +91${to} → ${message}\n`)
    return
  }
  try {
    const res = await fetch(
      `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}` +
      `&route=q&message=${encodeURIComponent(message)}&flash=0&numbers=${to}`,
      { method: 'GET' }
    )
    const data = await res.json()
    if (!data.return) console.error('[Fast2SMS]', data.message)
  } catch (err) {
    console.error('[SMS] Delivery failed:', err)
  }
}

export async function sendTextSMSToMany(numbers: string[], message: string): Promise<void> {
  await Promise.all(numbers.map(n => sendTextSMS(n, message)))
}
