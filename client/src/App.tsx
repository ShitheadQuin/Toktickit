import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequesterProvider, useRequester } from './context/RequesterContext';
import { RequesterSelector } from './pages/RequesterSelector';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { CreateTicket } from './pages/CreateTicket';
import { MyTickets } from './pages/MyTickets';
import { AppShell } from './components/AppShell';
import { RequireRequester } from './components/RequireRequester';
import './App.css';
import './theme.css';

function Home() {
  const { requester } = useRequester();

  if (!requester) {
    return <RequesterSelector />;
  }

  // Once a Requester is selected, My Tickets is the landing screen. Redirecting rather than
  // rendering it here keeps one route per screen, so the shell's active-page indication
  // (ui-spec.md 10) has a path to match against.
  return <Navigate to="/my-tickets" replace />;
}

function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/my-tickets"
            element={
              <RequireRequester>
                <AppShell>
                  <MyTickets />
                </AppShell>
              </RequireRequester>
            }
          />
          <Route
            path="/create-ticket"
            element={
              <RequireRequester>
                <AppShell>
                  <CreateTicket />
                </AppShell>
              </RequireRequester>
            }
          />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
        </Routes>
      </BrowserRouter>
    </RequesterProvider>
  );
}

export default App;
