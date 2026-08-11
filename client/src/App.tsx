import { useState } from 'react'
import './App.css'

type SystemStatus = 'idle' | 'loading' | 'online' | 'offline'

function App() {
  const [status, setStatus] = useState<SystemStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const checkSystem = async () => {
    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })

      if (!response.ok) {
        throw new Error('Backend returned an error')
      }

      const data = await response.json()
      setStatus(data.status === 'ok' ? 'online' : 'offline')
    } catch (error) {
      setStatus('offline')
      setErrorMessage('Unable to connect to TokTickIT API')
    }
  }

  return (
    <div className="app d-flex flex-column align-items-center">
      <h1>TokTickIT IT Service Desk</h1>
      <button type="button" className="btn btn-primary mb-3" onClick={checkSystem}>
        Check System
      </button>

      {status === 'loading' && <p>Loading...</p>}
      {status === 'online' && (
        <div className="alert alert-success d-inline-block" role="alert">
          System Status: Online
        </div>
      )}
      {status === 'offline' && (
        <div className="alert alert-danger d-inline-block" role="alert">
          <p className="mb-0"><strong>System Status: Offline</strong></p>
          <p className="mb-0">{errorMessage}</p>
        </div>
      )}
    </div>
  )
}

export default App