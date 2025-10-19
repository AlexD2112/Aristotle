import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to app.js which contains all the functionality
    router.push('/app');
  }, [router]);

  return (
    <div className="redirect-container">
      <div className="redirect-content">
        <h2>Redirecting to Aristotle...</h2>
        <p>If you're not redirected automatically, <a href="/app" className="redirect-link">click here</a></p>
      </div>
    </div>
  );
}