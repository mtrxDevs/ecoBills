import { create } from 'zustand'

type Me = { user: { id: string; name: string; email: string; role: string; businessId: string; authLinked?: boolean } | null; business: any }

export const useMe = create<{ me: Me | null; setMe: (m: Me | null) => void }>((set) => ({
  me: null,
  setMe: (me) => set({ me }),
}))
