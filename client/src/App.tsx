import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { CreateTicket } from './pages/CreateTicket';
import { MyTickets } from './pages/MyTickets';
import { RequesterTicketDetail } from './pages/RequesterTicketDetail';
import { StaffTicketQueue } from './pages/StaffTicketQueue';
import { StaffTicketDetail } from './pages/StaffTicketDetail';
import { UserManagement } from './pages/UserManagement';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import './App.css';
import './theme.css';

function Home() {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  // Lab 4 ui-spec.md 2: every role lands on its dashboard. Redirecting rather than rendering it here
  // keeps one route per screen, so the shell's active-page indication has a path to match.
  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route
            path="/dashboard"
            element={
              <RequireRole roles={['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']}>
                <AppShell>
                  <Dashboard />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/my-tickets"
            element={
              <RequireRole roles={['REQUESTER']}>
                <AppShell>
                  <MyTickets />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/create-ticket"
            element={
              <RequireRole roles={['REQUESTER']}>
                <AppShell>
                  <CreateTicket />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <RequireRole roles={['REQUESTER']}>
                <AppShell>
                  <RequesterTicketDetail />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/staff/queue"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <AppShell>
                  <StaffTicketQueue />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/staff/tickets/:id"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <AppShell>
                  <StaffTicketDetail />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole roles={['ADMINISTRATOR']}>
                <AppShell>
                  <UserManagement />
                </AppShell>
              </RequireRole>
            }
          />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route
            path="*"
            element={
              <RequireRole roles={['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']}>
                <AppShell>
                  <NotFound />
                </AppShell>
              </RequireRole>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
