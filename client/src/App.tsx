import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { CreateTicket } from './pages/CreateTicket';
import { MyTickets } from './pages/MyTickets';
import { RequesterTicketDetail } from './pages/RequesterTicketDetail';
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
  if (user.role === 'REQUESTER') {
    // My Tickets is the Requester landing screen. Redirecting rather than rendering it here
    // keeps one route per screen, so the shell's active-page indication has a path to match.
    return <Navigate to="/my-tickets" replace />;
  }

  // Same one-route-per-screen reasoning for the other two roles' landing screens.
  return <Navigate to={user.role === 'IT_STAFF' ? '/staff/queue' : '/users'} replace />;
}

// PR #44 review: the shell's My Queue and Users links pointed at routes that didn't exist, so
// clicking them rendered a blank page. The routes exist now, role-guarded and inside the shell
// (so nav/identity/logout all work), holding a placeholder until #37 (Ticket Queue) and #39 (User
// Management) replace it with the real screen.
function ScreenInLaterIssue({ screen }: { screen: string }) {
  return <p>The {screen} screen arrives in a later Issue.</p>;
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
              <RequireRole roles={['IT_STAFF']}>
                <AppShell>
                  <ScreenInLaterIssue screen="Ticket Queue" />
                </AppShell>
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole roles={['ADMINISTRATOR']}>
                <AppShell>
                  <ScreenInLaterIssue screen="User Management" />
                </AppShell>
              </RequireRole>
            }
          />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
