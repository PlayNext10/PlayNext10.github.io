import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../config.js'
import './VenuePage.css'

// One anonymous id per browser, reused across venues. This is what lets the
// backend enforce "one request per guest" / cooldowns without any login —
// see the rate-limiting discussion: it's not hack-proof (clearing storage
// or an incognito window resets it), but it stops casual repeat-spamming,
// which is the actual threat model for a venue queue.
function getGuestId() {
  let id = localStorage.getItem('playnext_guest_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('playnext_guest_id', id)
  }
  return id
}

function useToast() {
  const [message, setMessage] = useState(null)
  const show = useCallback((msg) => {
    setMessage(msg)
    clearTimeout(window.__playnextToastTimer)
    window.__playnextToastTimer = setTimeout(() => setMessage(null), 2600)
  }, [])
  return [message, show]
}

export default function VenuePage() {
  const { venueSlug } = useParams()
  const guestId = getGuestId()

  const [verified, setVerified] = useState(
    () => sessionStorage.getItem(`playnext_verified_${venueSlug}`) === 'true'
  )
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(null)
  const [verifying, setVerifying] = useState(false)

  const [venue, setVenue] = useState(null)
  const [playerActive, setPlayerActive] = useState(false)
  const [nowPlaying, setNowPlaying] = useState(null)
  const [queue, setQueue] = useState([])
  const [requestStatus, setRequestStatus] = useState({ canRequest: true, retryAfterSeconds: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryUntil, setRetryUntil] = useState(null)
  const [clock, setClock] = useState(Date.now())
  const [toast, showToast] = useToast()

  async function handleVerify(e) {
    e.preventDefault()
    setCodeError(null)
    setVerifying(true)
    try {
      const res = await fetch(`${API_BASE}/venues/${venueSlug}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Wrong code')
      }
      sessionStorage.setItem(`playnext_verified_${venueSlug}`, 'true')
      setVerified(true)
    } catch (err) {
      setCodeError(err.message)
    } finally {
      setVerifying(false)
    }
  }

  const loadData = useCallback(async () => {
    try {
      const [venueRes, playbackRes] = await Promise.all([
        fetch(`${API_BASE}/venues/${venueSlug}`),
        fetch(`${API_BASE}/venues/${venueSlug}/playback?guestId=${encodeURIComponent(guestId)}`),
      ])
      if (!venueRes.ok) throw new Error('Venue not found')
      if (!playbackRes.ok) throw new Error('Could not load playback state')
      const venueData = await venueRes.json()
      const playbackData = await playbackRes.json()
      setVenue(venueData)
      setPlayerActive(playbackData?.active === true)
      setNowPlaying(playbackData.nowPlaying)
      setQueue(playbackData.upNext)
      const nextRequestStatus = playbackData.requestStatus || { canRequest: true, retryAfterSeconds: 0 }
      setRequestStatus(nextRequestStatus)
      if (nextRequestStatus.retryAfterSeconds) setRetryUntil(Date.now() + nextRequestStatus.retryAfterSeconds * 1000)
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [venueSlug])

  useEffect(() => {
    if (!verified) return
    loadData()
    // Simple polling for now so guests see the queue move without refreshing.
    // TODO: swap for WebSockets/SSE later for instant updates.
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [verified, loadData])

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleAddSong(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/venues/${venueSlug}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, guestId, title: title.trim(), artist: artist.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          // daily code was regenerated since we verified — force re-entry
          sessionStorage.removeItem(`playnext_verified_${venueSlug}`)
          setVerified(false)
        }
        if (body.retryAfterSeconds) {
          setRetryUntil(Date.now() + body.retryAfterSeconds * 1000)
        }
        throw new Error(body.error || 'Could not add that song')
      }
      setTitle('')
      setArtist('')
      showToast(`${body.title} was added to the queue.`)
      loadData()
    } catch (err) {
      showToast(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Code gate ----
  if (!verified) {
    return (
      <div className="venue-shell">
        <div className="gate-wrap">
          <form className="gate-card" onSubmit={handleVerify}>
            <h1>{venueSlug}</h1>
            <p>Enter today's code, shown at the counter, to queue a song.</p>
            <input
              className="gate-input"
              type="text"
              inputMode="numeric"
              placeholder="••••"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            {codeError && <div className="gate-error">{codeError}</div>}
            <button className="request-submit" type="submit" disabled={verifying} style={{ width: '100%' }}>
              {verifying ? 'Checking...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (loading && !venue) {
    return (
      <div className="venue-shell">
        <div className="loading-text">Loading {venueSlug}...</div>
      </div>
    )
  }

  if (loadError && !venue) {
    return (
      <div className="venue-shell">
        <div className="error-text">Couldn't load this venue: {loadError}</div>
      </div>
    )
  }

  const upNext = queue[0] || null
  const secondsRemaining = retryUntil ? Math.max(0, Math.ceil((retryUntil - clock) / 1000)) : 0
  const canRequest = requestStatus.canRequest && secondsRemaining === 0

  if (!playerActive) {
    return (
      <div className="venue-shell">
        <div className="customer-wrap">
          <section className="card now-card">
            <div className="eyebrow"><span>{venue.name}</span></div>
            <h2>The music player is inactive.</h2>
            <p className="artist">Please ask staff to open the player before adding requests.</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="venue-shell">
      <div className="customer-wrap">
        <div className="venue-header">
          <h1>{venue.name}</h1>
        </div>

        {/* Now playing / up next */}
        <section className="card now-card">
          <div className="eyebrow">
            <span>Now playing</span>
          </div>

          <div className="now-row">
            {nowPlaying?.thumbnailUrl ? (
              <img className="now-thumb" src={nowPlaying.thumbnailUrl} alt="" />
            ) : (
              <div className="now-thumb-fallback">♪</div>
            )}
            <div>
              <h2>{nowPlaying ? nowPlaying.title : 'Nothing queued yet'}</h2>
              <p className="artist">
                {nowPlaying ? nowPlaying.artist : 'Be the first to add a song'}
              </p>
            </div>
          </div>

          {upNext && (
            <div className="next-label">
              Next up
              <strong>
                {upNext.title} — {upNext.artist}
              </strong>
            </div>
          )}
        </section>

        {/* Add a song — the main event */}
        <section className="card request-card">
          <h2>What should play next?</h2>
          <p>Type a song and artist, then add it to the queue.</p>

          <form className="request-form" onSubmit={handleAddSong}>
            <input
              type="text"
              placeholder="Song title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!venue.settings.acceptRequests || !canRequest}
            />
            <input
              type="text"
              placeholder="Artist (optional)"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              disabled={!venue.settings.acceptRequests || !canRequest}
            />
            <button
              className="request-submit"
              type="submit"
              disabled={
                submitting ||
                !title.trim() ||
                !venue.settings.acceptRequests ||
                !canRequest
              }
            >
              {submitting ? 'Adding...' : 'Add to queue'}
            </button>
          </form>

          {!venue.settings.acceptRequests && (
            <div className="request-note error">This venue isn't accepting requests right now.</div>
          )}
          {venue.settings.acceptRequests && !canRequest && requestStatus.reason && (
            <div className="request-note muted">
              {secondsRemaining > 0 ? `You can request another song in ${secondsRemaining}s.` : requestStatus.reason}
            </div>
          )}
          {/* TODO: no real song search yet — this is freeform title/artist entry.
              A Spotify/YouTube search integration would replace these two
              inputs with a proper results list (see earlier discussion on
              playback). */}
        </section>

        {/* Full queue */}
        <section className="card queue-card">
          <div className="section-title-row">
            <h2>Up next</h2>
            <span>{queue.length} songs</span>
          </div>

          <div className="queue-list">
            {queue.length === 0 && <div className="empty-queue">Queue is empty — add the first song!</div>}
            {queue.map((item, index) => (
              <div className={`queue-item ${item.guestId === guestId ? 'yours' : ''}`} key={item.id}>
                <div className="queue-number">{index + 1}</div>
                {item.thumbnailUrl ? (
                  <img className="queue-thumb" src={item.thumbnailUrl} alt="" />
                ) : (
                  <div className="queue-thumb-fallback" />
                )}
                <div className="song-meta">
                  <strong>{item.title}</strong>
                  <span>{item.artist}</span>
                  {item.guestId === guestId && <span className="your-label">Your request</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}
