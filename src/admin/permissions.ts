import type { User } from '@supabase/supabase-js'

export type AdminRole = 'owner' | 'tournament_manager' | 'match_referee' | 'finance_officer'

export type AdminPermission =
  | 'dashboard.view'
  | 'tournaments.read' | 'tournaments.manage'
  | 'players.read' | 'players.manage'
  | 'matches.read' | 'matches.review'
  | 'finance.read' | 'finance.review'
  | 'content.manage'
  | 'staff.manage' | 'settings.manage' | 'audit.read'

export const roleLabels: Record<AdminRole, string> = {
  owner: 'Owner',
  tournament_manager: 'Tournament manager',
  match_referee: 'Match referee',
  finance_officer: 'Finance officer',
}

export const rolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ['dashboard.view', 'tournaments.read', 'tournaments.manage', 'players.read', 'players.manage', 'matches.read', 'matches.review', 'finance.read', 'finance.review', 'content.manage', 'staff.manage', 'settings.manage', 'audit.read'],
  tournament_manager: ['dashboard.view', 'tournaments.read', 'tournaments.manage', 'players.read', 'content.manage'],
  match_referee: ['dashboard.view', 'matches.read', 'matches.review'],
  finance_officer: ['dashboard.view', 'finance.read', 'finance.review'],
}

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return rolePermissions[role].includes(permission)
}

/** Reads only server-issued app_metadata. Client-editable user_metadata is never used for authorization. */
export function adminRoleFromUser(user: User | null): AdminRole | null {
  const role = user?.app_metadata?.tretmax_role
  return typeof role === 'string' && role in rolePermissions ? role as AdminRole : null
}

export type AdminNavItem = { to: string; label: string; icon: string; permission: AdminPermission }

export const adminNavigation: readonly AdminNavItem[] = [
  { to: '/admin', label: 'Overview', icon: '◫', permission: 'dashboard.view' },
  { to: '/admin/tournaments', label: 'Tournaments', icon: '⌑', permission: 'tournaments.read' },
  { to: '/admin/players', label: 'Players', icon: '♙', permission: 'players.read' },
  { to: '/admin/matches', label: 'Matches', icon: '⌁', permission: 'matches.read' },
  { to: '/admin/finance', label: 'Finance', icon: '◈', permission: 'finance.read' },
  { to: '/admin/content', label: 'Content', icon: '▧', permission: 'content.manage' },
  { to: '/admin/staff', label: 'Staff', icon: '♧', permission: 'staff.manage' },
  { to: '/admin/settings', label: 'Settings & audit', icon: '⚙', permission: 'settings.manage' },
]
