import { useState } from 'react'
import UrlInput from './components/UrlInput'
import SummaryCard from './components/SummaryCard'
import axios from './services/api'

function App() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSummarize = async (url) => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.post('/api/summaries', { url })
      setSummary(response.data)
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-600 text-white p-4">
        <div className="container mx-auto">
          <h1 className="text-xl font-bold">Web Content Summarizer</h1>
        </div>
      </nav>

      <main className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Intelligent Web Content Summarization</h2>
            <p className="text-gray-600">Paste a webpage URL to generate an AI-powered summary</p>
          </div>

          <UrlInput onSummarize={handleSummarize} />

          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
              Generating summary...
            </div>
          )}

          {summary && <SummaryCard summary={summary} />}
        </div>
      </main>
    </div>
  )
}

export default App
