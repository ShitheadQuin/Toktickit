import { useState } from 'react'
import './App.css'

type SystemStatus = 'idle' | 'loading' | 'online' | 'offline'

interface Category {
  id: number
  name: string
}

function App() {
  const [status, setStatus] = useState<SystemStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [categories, setCategories] = useState<Category[]>([])

  const checkSystem = async () => {
    setStatus('loading')
    setErrorMessage('')

    try {
      const healthResponse = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })

      if (!healthResponse.ok) {
        throw new Error('Backend returned an error')
      }

      const healthData = await healthResponse.json()

      if (healthData.status !== 'ok') {
        throw new Error('Backend reported an unhealthy status')
      }

      const categoriesResponse = await fetch('/api/categories', { signal: AbortSignal.timeout(5000) })

      if (!categoriesResponse.ok) {
        throw new Error('Backend returned an error')
      }

      const categoriesData: Category[] = await categoriesResponse.json()

      setCategories(categoriesData)
      setStatus('online')
    } catch (error) {
      setStatus('offline')
      setCategories([])
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
          <p className="mb-2">System Status: Online</p>
          <strong>Supported Request Categories</strong>
          <ul className="mb-0">
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
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
