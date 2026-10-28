import { createContext, useContext } from 'react'
import type { AdminRole } from './permissions'

export type AdminContextValue = { role: AdminRole | null }
export const AdminContext = createContext<AdminContextValue>({ role: null })
export function useAdminContext() { return useContext(AdminContext) }
