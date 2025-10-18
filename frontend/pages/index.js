import {useEffect, useState} from 'react'

export default function Home() {
  const [buckets, setBuckets] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBuckets = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/aws/buckets')
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
    <main style={{fontFamily: 'Arial, sans-serif', padding: 20}}>
      <h1>Aristotle — Next.js frontend</h1>
      <p>Calls the Flask backend at <code>/api/aws/buckets</code> and shows result.</p>

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
    </main>
  )
}
