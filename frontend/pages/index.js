import {useEffect, useState} from 'react'
import Chatbot from '../components/chatbot'
import Link from 'next/link';

export default function Home() {
  const [buckets, setBuckets] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showChatbot, setShowChatbot] = useState(false)
  const [quizId, setQuizId] = useState('') 
  
  useEffect(() => {
    const fetchBuckets = async () => {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:6767'
      try {
        const res = await fetch(`${backendUrl}/api/aws/buckets`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setBuckets(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchBuckets()
  }, [])


  return (
    <main className="main-container">
      <h1>Aristotle — Next.js frontend</h1>
      <p>Calls the Flask backend at <code>/api/aws/buckets</code> and shows result.</p>

      {/* AWS Buckets Section */}
      {loading && <p>Loading...</p>}
      {error && (
        <div style={{color: 'crimson'}}>
          <h3>Error</h3>
          <pre>{error}</pre>
        </div>
      )}

      {buckets && (
        <div>
          <h3>S3 Buckets</h3>
          {buckets.buckets && buckets.buckets.length > 0 ? (
            <ul>
              {buckets.buckets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p>No buckets found or access denied.</p>
          )}
        </div>
      )}
      <p>Quiz</p>
      <Link href="/quiz">Quiz test</Link>
      <Link href="/multiplayer">Multiplayer test</Link>
      <div style={{margin: '20px 0'}}>
        <input 
          type="text" 
          placeholder="Enter quiz ID"
          onChange={(e) => setQuizId(e.target.value)}
          style={{padding: '8px', marginRight: '10px'}}
        />
        <Link href={`/quiz?id=${quizId}`}>
          <button style={{padding: '8px 16px'}}>Go to Quiz</button>
        </Link>
      </div>
      <div style={{marginTop: '40px', borderTop: '2px solid #eee', paddingTop: '20px'}}>
        <h2>Learning Assistant</h2>
        <p>Chat with Aristotle to discuss topics and upload study materials.</p>
        
        <div style={{marginBottom: '20px'}}>
          <button 
            onClick={() => setShowChatbot(!showChatbot)}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            {showChatbot ? 'Hide' : 'Start'} Learning Chatbot
          </button>
        </div>

        {showChatbot && (
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '10px',
            padding: '20px',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <Chatbot />
          </div>
        )}
      </div>
    </main>
  )
}
