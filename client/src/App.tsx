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

  // IT Staff's Queue (#37) and Administrator's Users screen (#39) don't exist yet - #36 only
  // covers authentication/authorization and the Requester regression. Landing here (inside the
  // shell, so nav/identity/logout all work) rather than redirecting to a route that doesn't
  // exist yet.
  return (
    <AppShell>
      <p>Signed in as {user.name}. The screen for this role arrives in a later Issue.</p>
    </AppShell>
  );
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
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
