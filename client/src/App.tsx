import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { RequesterProvider, useRequester } from './context/RequesterContext';
import { RequesterSelector } from './pages/RequesterSelector';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { CreateTicket } from './pages/CreateTicket';
import { AppShell } from './components/AppShell';
import { RequireRequester } from './components/RequireRequester';
import './App.css';
import './theme.css';

function Home() {
  const { requester } = useRequester();

  if (!requester) {
    return <RequesterSelector />;
  }

  return (
    <AppShell>
      <p className="mb-3">Signed in as {requester.name}. My Tickets is coming in a later Issue.</p>
      <Link to="/create-ticket" className="btn btn-tt-primary">
        Create Ticket
      </Link>
    </AppShell>
  );
}

function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
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
