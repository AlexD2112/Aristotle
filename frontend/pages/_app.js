import '../styles/globals.css'
import ProfileButton from '../components/ProfileButton'

export default function App({ Component, pageProps }) {
  return (
    <>
      <ProfileButton />
      <Component {...pageProps} />
    </>
  )
}
