import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RequesterProvider, useRequester } from './context/RequesterContext';
import { RequesterSelector } from './pages/RequesterSelector';
import { AppShell } from './components/AppShell';
import './App.css';

function Home() {
  const { requester } = useRequester();

  if (!requester) {
    return <RequesterSelector />;
  }

  return (
    <AppShell>
      <p>Signed in as {requester.name}. My Tickets and Create Ticket are coming in later Issues.</p>
    </AppShell>
  );
}

function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </RequesterProvider>
  );
}

export default App;
