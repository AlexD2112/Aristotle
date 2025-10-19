import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Profile() {
  const [profile, setProfile] = useState({ displayName: 'Learner', email: '', ownedDatasets: [], sharedDatasets: [], sharedWith: [] });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [idToken, setIdToken] = useState('');
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:6767';

  // Helper: parse URL hash (for Cognito implicit flow) and extract id_token/access_token
  function parseHashForToken() {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    return params.get('id_token') || params.get('access_token');
  }

  // Build Cognito Hosted UI sign-in URL using NEXT_PUBLIC_ env variables
  function getCognitoSignInUrl() {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '';
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';
    const redirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin + '/profile' : '');
    const scope = encodeURIComponent(process.env.NEXT_PUBLIC_COGNITO_SCOPES || 'openid email profile');
    if (!domain || !clientId || !redirectUri) return '#';
    // Use implicit flow response_type=token to receive id_token in the URL hash (legacy/working flow)
    return `https://${domain}/oauth2/authorize?response_type=token&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  }

  useEffect(() => {
    // Try to get token from URL hash (after redirect from Cognito) and store in localStorage
    try {
      const tokenFromHash = parseHashForToken();
      if (tokenFromHash) {
        // store token in the same key other pages expect
        localStorage.setItem('idToken', tokenFromHash);
        // Remove the hash from the URL for cleanliness
        if (window && window.history && window.location) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
      }
    } catch (e) {
      // ignore parsing errors
    }

    const stored = (typeof window !== 'undefined') ? localStorage.getItem('idToken') : null;
    if (stored) {
      setIdToken(stored);
      loadProfile(stored);
    } else {
      setLoading(false);
    }
  }, []);

  async function loadProfile(token) {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${backendUrl}/api/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        // If unauthorized, clear token and prompt sign-in
        if (resp.status === 401) {
          if (typeof window !== 'undefined') localStorage.removeItem('idToken');
          setIdToken('');
          setError('Not signed in. Please sign in to manage your profile.');
        } else {
          setError(data.error || 'Failed to load profile');
        }
        setLoading(false);
        return;
      }
      setProfile(prev => ({ ...prev, ...data.data }));
      setLoading(false);
    } catch (e) {
      setError('Network error while loading profile');
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaved(false);
    setError('');
    const token = idToken || (typeof window !== 'undefined' ? localStorage.getItem('idToken') : null);
    if (!token) {
      setError('You must sign in before saving your profile');
      return;
    }
    try {
      const resp = await fetch(`${backendUrl}/api/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        if (resp.status === 401) {
          if (typeof window !== 'undefined') localStorage.removeItem('idToken');
          setIdToken('');
          setError('Not signed in. Please sign in again.');
        } else {
          setError(data.error || 'Failed to save profile');
        }
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError('Network error while saving profile');
    }
  }

  function signOut() {
    if (typeof window !== 'undefined') localStorage.removeItem('idToken');
    setIdToken('');
    setProfile({ displayName: 'Learner', email: '', ownedDatasets: [], sharedDatasets: [], sharedWith: [] });
  }

  const avatarInitial = (profile.displayName && profile.displayName[0]) ? profile.displayName[0].toUpperCase() : 'A';

  const containerStyle = { padding: 28, fontFamily: 'Inter, Arial, sans-serif', background: '#f6f8fb', minHeight: '75vh' };
  const cardStyle = { maxWidth: 760, margin: '0 auto', background: '#fff', padding: 22, borderRadius: 12, boxShadow: '0 8px 30px rgba(15,23,42,0.06)' };
  const muted = { color: '#6b7280' };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Your profile</h1>
          <div style={{ ...muted, marginTop: 6 }}>Manage your account and connected datasets</div>
        </div>
        <div>
          <Link href="/app" style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 10, background: '#8B5CF6', color: 'white', textDecoration: 'none', fontWeight: 600 }}>Back to app</Link>
        </div>
      </div>

      {!idToken && (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Sign in</h2>
          <p style={muted}>You are not signed in. Use the Cognito hosted sign-in to authenticate.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <a href={getCognitoSignInUrl()} style={{ padding: '10px 14px', background: '#2563EB', color: 'white', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Sign in with Cognito</a>
            <button onClick={() => { if (typeof window !== 'undefined') localStorage.removeItem('idToken'); setIdToken(''); }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e6e9ef', background: '#fff' }}>Clear token</button>
          </div>
          <div style={{ marginTop: 12, ...muted, fontSize: 13 }}>After signing in you'll be returned here with a token stored locally. Make sure the environment variables NEXT_PUBLIC_COGNITO_DOMAIN, NEXT_PUBLIC_COGNITO_CLIENT_ID and NEXT_PUBLIC_COGNITO_REDIRECT_URI are set at build time.</div>
        </div>
      )}

      {idToken && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 88, height: 88, borderRadius: 999, background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 36, fontWeight: 800 }}>{avatarInitial}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.displayName}</div>
              <div style={{ ...muted }}>{profile.email || 'No email set'}</div>
            </div>
            <div>
              <button onClick={signOut} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e6e9ef', background: '#fff' }}>Sign out</button>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: 13, color: '#111827', marginBottom: 6 }}>Display name</div>
              <input
                value={profile.displayName}
                onChange={(e) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e6e9ef' }}
              />
            </label>

            <label style={{ display: 'block' }}>
              <div style={{ fontSize: 13, color: '#111827', marginBottom: 6 }}>Email</div>
              <input
                value={profile.email}
                onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e6e9ef' }}
              />
            </label>

            <div>
              <div style={{ fontSize: 13, color: '#111827', marginBottom: 8 }}>Owned datasets</div>
              {Array.isArray(profile.ownedDatasets) && profile.ownedDatasets.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {profile.ownedDatasets.map((d, i) => <li key={i}><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 6 }}>{d}</code></li>)}
                </ul>
              ) : (
                <div style={{ color: '#6b7280' }}>No owned datasets</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 13, color: '#111827', marginBottom: 8 }}>Shared datasets</div>
              {Array.isArray(profile.sharedDatasets) && profile.sharedDatasets.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {profile.sharedDatasets.map((d, i) => <li key={i}><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 6 }}>{d}</code></li>)}
                </ul>
              ) : (
                <div style={{ color: '#6b7280' }}>No shared datasets</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="submit" style={{ padding: '10px 14px', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Save</button>
              {saved && <span style={{ color: '#16a34a' }}>Saved</span>}
              {loading && <span style={{ color: '#6b7280' }}>Loading...</span>}
            </div>

            {error && <div style={{ color: 'crimson' }}>{error}</div>}
          </form>
        </div>
      )}

      {(!idToken && !loading) && (
        <div style={{ maxWidth: 760, margin: '18px auto 0', ...muted }}>
          If you already signed in but the page still shows signed-out, try clearing tokens or reloading the app.
        </div>
      )}
    </div>
  );
}
