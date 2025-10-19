import Link from 'next/link';
import { useRouter } from 'next/router';

export default function ProfileButton({ initial = 'A' }) {
  const router = useRouter();

  // Don't render the button on the profile page (or any sub-route like /profile/...)
  // Router may be undefined during SSR; guard with typeof window check.
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path.startsWith('/profile')) return null;
  } else if (router && router.pathname && String(router.pathname).startsWith('/profile')) {
    // In case router is available on the server side, also avoid rendering
    return null;
  }

  return (
    <Link
      href="/profile"
      title="View profile"
      aria-label="Open profile"
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 9999,
        display: 'inline-block',
        cursor: 'pointer',
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#8B5CF6',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        {initial}
      </span>
    </Link>
  );
}
