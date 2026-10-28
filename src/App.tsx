import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout, AdminPermissionGate, AdminProductionGate } from './admin/AdminLayout'
import { AdminOverview, AdminTournaments, AdminPlayers, AdminMatches, AdminFinance, AdminContent, AdminStaff, AdminSettings } from './admin/AdminPages'
import { PageShell } from './components/PageShell'
import { SupabaseConfigurationNotice } from './components/SupabaseConfigurationNotice'
import { AuthPage } from './pages/AuthPage'
import { GamesPage } from './pages/GamesPage'
import { HomePage } from './pages/HomePage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { TournamentDetailPage } from './pages/TournamentDetailPage'
import { TournamentsPage } from './pages/TournamentsPage'
import { AuthProvider } from './lib/AuthContext'

function RoutedPage({ children }: { children: ReactNode }) { return <PageShell>{children}</PageShell> }

export default function App() {
  return <BrowserRouter><AuthProvider><SupabaseConfigurationNotice /><Routes>
    <Route path="/" element={<RoutedPage><HomePage /></RoutedPage>} />
    <Route path="/tournaments" element={<RoutedPage><TournamentsPage /></RoutedPage>} />
    <Route path="/tournaments/:id" element={<RoutedPage><TournamentDetailPage /></RoutedPage>} />
    <Route path="/games" element={<RoutedPage><GamesPage /></RoutedPage>} />
    <Route path="/leaderboard" element={<RoutedPage><LeaderboardPage /></RoutedPage>} />
    <Route path="/how-it-works" element={<RoutedPage><HowItWorksPage /></RoutedPage>} />
    <Route path="/login" element={<RoutedPage><AuthPage /></RoutedPage>} />
    <Route path="/register" element={<RoutedPage><AuthPage /></RoutedPage>} />
    <Route path="/profile" element={<RoutedPage><ProfilePage /></RoutedPage>} />
    <Route path="/admin" element={import.meta.env.DEV ? <AdminLayout /> : <AdminProductionGate />}>
      <Route index element={<AdminPermissionGate permission="dashboard.view"><AdminOverview /></AdminPermissionGate>} />
      <Route path="tournaments" element={<AdminPermissionGate permission="tournaments.read"><AdminTournaments /></AdminPermissionGate>} />
      <Route path="players" element={<AdminPermissionGate permission="players.read"><AdminPlayers /></AdminPermissionGate>} />
      <Route path="matches" element={<AdminPermissionGate permission="matches.read"><AdminMatches /></AdminPermissionGate>} />
      <Route path="finance" element={<AdminPermissionGate permission="finance.read"><AdminFinance /></AdminPermissionGate>} />
      <Route path="content" element={<AdminPermissionGate permission="content.manage"><AdminContent /></AdminPermissionGate>} />
      <Route path="staff" element={<AdminPermissionGate permission="staff.manage"><AdminStaff /></AdminPermissionGate>} />
      <Route path="settings" element={<AdminPermissionGate permission="settings.manage"><AdminSettings /></AdminPermissionGate>} />
    </Route>
    <Route path="*" element={<RoutedPage><NotFoundPage /></RoutedPage>} />
  </Routes></AuthProvider></BrowserRouter>
}
