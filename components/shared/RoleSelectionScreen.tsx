'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RoleSelectionScreen() {
  const router = useRouter()
  useEffect(() => {
    if (typeof window !== 'undefined' &&
        localStorage.getItem('sw_onboarded') &&
        !localStorage.getItem('sw_role')) {
      localStorage.setItem('sw_role', 'worker')
      router.push('/login')
    }
  }, [router])
  return null
}
