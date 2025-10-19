import { useEffect, useState } from 'react';

export default function Callback() {
  const [params, setParams] = useState(null);
  const [error, setError] = useState(null);
  const expectedRedirect = typeof window !== 'undefined' ? `${window.location.origin}/callback` : process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // parse query (not commonly used for implicit) and hash fragments
      const u = new URL(window.location.href);
      const search = Object.fromEntries(u.searchParams.entries());
      const hash = (window.location.hash || '').replace(/^#/, '');
      const hashParams = hash
        ? Object.fromEntries(hash.split('&').map(p => {
            const [k, v] = p.split('=');
            return [decodeURIComponent(k), decodeURIComponent(v || '')];
          }))
        : {};

      const merged = { ...search, ...hashParams };
      setParams(merged);

      if (merged.error || merged.error_description) {
        setError(merged.error_description || merged.error || 'Unknown error');
        return;
      }

      // Only support the implicit/hash flow here (legacy working flow)
      if (merged.id_token || merged.access_token) {
        const token = merged.id_token || merged.access_token;
        // store token where other pages expect it
        localStorage.setItem('idToken', token);
        // clean up the URL (remove hash and query)
        try { window.history.replaceState({}, document.title, '/profile'); } catch (e) {}
        // redirect to profile to show signed-in state
        try { window.location.replace('/profile'); } catch (e) {}
        return;
      }
    } catch (ex) {
      setError(String(ex));
    }
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Auth callback</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        <strong>Registered redirect (must match exactly):</strong>
        <div style={{ fontFamily: 'monospace', marginTop: 6 }}>{expectedRedirect}</div>
      </div>
      <h3 style={{ marginTop: 12 }}>Params (query + hash)</h3>
      <pre style={{ whiteSpace: 'pre-wrap', maxWidth: 800 }}>{params ? JSON.stringify(params, null, 2) : 'Parsing...'}</pre>
      <p>
        This app is using the implicit (hash) flow. If you see error=unauthorized_client then your App client is not authorized for the requested grant type. Ensure the Redirect URI matches and the App client supports the implicit grant if you wish to continue using this flow.
      </p>
    </div>
  );
}