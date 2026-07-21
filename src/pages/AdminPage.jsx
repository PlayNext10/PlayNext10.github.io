import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../config.js'
import PlayerEngine from '../player/PlayerEngine.jsx'
import './AdminPage.css'

function useToast() {
  const [message, setMessage] = useState(null)
  const show = useCallback((msg) => {
    setMessage(msg)
    clearTimeout(window.__playnextToastTimer)
    window.__playnextToastTimer = setTimeout(() => setMessage(null), 2400)
  }, [])
  return [message, show]
}

export default function AdminPage() {
  const { venueSlug } = useParams()
  const [token, setToken] = useState(() => sessionStorage.getItem(`playnext_token_${venueSlug}`))
  const [code, setCode] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const [tab, setTab] = useState('manager') // 'manager' | 'player'
  const [showSettings, setShowSettings] = useState(false)
  const [venue, setVenue] = useState(null) // { name, mode, dailyCode, settings }
  const [playerActive, setPlayerActive] = useState(false)
  const [nowPlaying, setNowPlaying] = useState(null)
  const [queue, setQueue] = useState([])
  const [pending, setPending] = useState([])
  const [adminTitle, setAdminTitle] = useState('')
  const [adminArtist, setAdminArtist] = useState('')
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [dashboardError, setDashboardError] = useState(null)
  const [toast, showToast] = useToast()
  const [isPlaying, setIsPlaying] = useState(true)
  const [playbackProgress, setPlaybackProgress] = useState({ currentTime: 0, duration: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const advancingRef = useRef(false)
  const playerEmbedRef = useRef(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError(null)
    setLoggingIn(true)
    try {
      const res = await fetch(`${API_BASE}/venues/${venueSlug}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Wrong code')
      }
      const data = await res.json()
      sessionStorage.setItem(`playnext_token_${venueSlug}`, data.token)
      setToken(data.token)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    if (token) {
      fetch(`${API_BASE}/venues/${venueSlug}/player/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      })
    }
    sessionStorage.removeItem(`playnext_token_${venueSlug}`)
    setToken(null)
  }

  const authedFetch = useCallback(
    (path, options = {}) =>
      fetch(`${API_BASE}/venues/${venueSlug}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      }),
    [venueSlug, token]
  )

  const loadDashboard = useCallback(async () => {
    if (!token) return
    try {
      setLoadingDashboard(true)
      const [meRes, playbackRes, pendingRes] = await Promise.all([
        authedFetch('/admin/me'),
        authedFetch('/playback'),
        authedFetch('/pending'),
      ])
      if (meRes.status === 401) {
        logout()
        return
      }
      if (!meRes.ok) throw new Error('Could not load venue dashboard')
      const me = await meRes.json()
      if (!playbackRes.ok) throw new Error('Could not load playback state')
      const playbackData = await playbackRes.json()
      setVenue(me)
      setPlayerActive(playbackData?.active === true)
      setNowPlaying(playbackData?.nowPlaying || null)
      setQueue(Array.isArray(playbackData?.upNext) ? playbackData.upNext : [])
      if (pendingRes.ok) setPending(await pendingRes.json())
      setDashboardError(null)
    } catch (err) {
      setDashboardError(err.message)
    } finally {
      setLoadingDashboard(false)
    }
  }, [token, authedFetch])

  useEffect(() => {
    loadDashboard()
    const interval = setInterval(loadDashboard, 1000)
    return () => clearInterval(interval)
  }, [loadDashboard])

  useEffect(() => {
    if (!token) return

    const heartbeat = async () => {
      const res = await authedFetch('/player/heartbeat', { method: 'POST' })
      if (res.ok) setPlayerActive(true)
    }

    heartbeat()
    const interval = setInterval(heartbeat, 3000)
    return () => clearInterval(interval)
  }, [token, authedFetch])

  useEffect(() => {
    if (!token) return
    const stopOnExit = () => {
      fetch(`${API_BASE}/venues/${venueSlug}/player/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      })
    }
    window.addEventListener('pagehide', stopOnExit)
    return () => window.removeEventListener('pagehide', stopOnExit)
  }, [token, venueSlug])

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (nowPlaying?.videoId) setIsPlaying(true)
  }, [nowPlaying?.id])

  async function removeQueueItem(itemId, title) {
    const res = await authedFetch(`/queue/${itemId}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setQueue((q) => q.filter((item) => item.id !== itemId))
      showToast(`${title} was removed from the queue.`)
    } else {
      showToast('Could not remove that song — try again.')
    }
  }

  async function approvePending(itemId) {
    const res = await authedFetch(`/pending/${itemId}/approve`, { method: 'POST' })
    if (!res.ok) return showToast('Could not approve that request.')
    const playback = await res.json()
    setNowPlaying(playback.nowPlaying || null)
    setQueue(Array.isArray(playback.upNext) ? playback.upNext : [])
    setPending((items) => items.filter((item) => item.id !== itemId))
  }

  async function rejectPending(itemId) {
    const res = await authedFetch(`/pending/${itemId}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) setPending((items) => items.filter((item) => item.id !== itemId))
  }

  async function resetQueue() {
    if (queue.length === 0 || !window.confirm('Remove every song waiting in the queue? The current song will keep playing.')) return
    const res = await authedFetch('/queue', { method: 'DELETE' })
    if (!res.ok) return showToast('Could not reset the queue.')
    setQueue([])
    showToast('Queue cleared.')
  }

  async function resetPending() {
    if (pending.length === 0 || !window.confirm('Remove every request waiting for approval?')) return
    const res = await authedFetch('/pending', { method: 'DELETE' })
    if (!res.ok) return showToast('Could not reset pending requests.')
    setPending([])
    showToast('Pending requests cleared.')
  }

  async function moveQueueItem(itemId, direction) {
    const res = await authedFetch(`/queue/${itemId}/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
    })
    if (!res.ok) return showToast('Could not reorder that song.')
    const playback = await res.json()
    setNowPlaying(playback.nowPlaying || null)
    setQueue(Array.isArray(playback.upNext) ? playback.upNext : [])
  }

  async function addAdminSong(e) {
    e.preventDefault()
    if (!adminTitle.trim()) return
    const res = await authedFetch('/admin/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: adminTitle.trim(), artist: adminArtist.trim() }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return showToast(body.error || 'Could not add the song.')
    setAdminTitle(''); setAdminArtist('')
    setNowPlaying(body.nowPlaying || null); setQueue(Array.isArray(body.upNext) ? body.upNext : [])
  }

  async function skipCurrent() {
    // YouTube can emit an ended event while a staff member also presses Skip.
    // Only one advance request may be in flight from this player tab.
    if (!nowPlaying || advancingRef.current) return
    advancingRef.current = true
    try {
      const res = await authedFetch('/playback/advance', { method: 'POST' })
      if (!res.ok) {
        showToast('Could not advance the player — try again.')
        return
      }
      const playback = await res.json()
      setNowPlaying(playback?.nowPlaying || null)
      setQueue(Array.isArray(playback?.upNext) ? playback.upNext : [])
      setPlaybackProgress({ currentTime: 0, duration: 0 })
    } catch {
      showToast('Could not advance the player — try again.')
    } finally {
      advancingRef.current = false
    }
  }

  function openFullscreen() {
    if (!playerEmbedRef.current?.requestFullscreen()) {
      showToast('The video player is not ready yet.')
    }
  }

  async function copyVenueLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${venueSlug}`)
      showToast('Venue link copied.')
    } catch {
      showToast('Could not copy the venue link.')
    }
  }

  const progressPercent = playbackProgress.duration
    ? Math.min(100, (playbackProgress.currentTime / playbackProgress.duration) * 100)
    : 0
  const formatTime = (seconds) => {
    const value = Math.max(0, Math.floor(seconds || 0))
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
  }

  async function toggleSetting(key) {
    if (!venue) return
    const newValue = !venue.settings[key]
    const changes = { [key]: newValue }
    if (key === 'sameNetworkRequired' && newValue) changes.dailyCodeRequired = false
    const previousSettings = venue.settings
    setVenue((v) => ({ ...v, settings: { ...v.settings, ...changes } }))
    const res = await authedFetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    if (!res.ok) {
      setVenue((v) => ({ ...v, settings: previousSettings }))
      showToast('Could not update that setting — try again.')
    }
  }

  async function updateCooldown(seconds) {
    setVenue((v) => ({ ...v, settings: { ...v.settings, cooldownSeconds: seconds, onePerGuest: false } }))
    const res = await authedFetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cooldownSeconds: seconds, onePerGuest: false }),
    })
    if (!res.ok) {
      showToast('Could not update the cooldown — try again.')
    }
  }

  async function regenerateDailyCode() {
    const res = await authedFetch('/daily-code/regenerate', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setVenue((v) => ({ ...v, dailyCode: data.dailyCode }))
      showToast(`New daily code: ${data.dailyCode}`)
    } else {
      showToast('Could not generate a new code — try again.')
    }
  }

  // ---- Not logged in: code gate ----
  if (!token) {
    return (
      <div className="admin-shell">
        <div className="gate-wrap">
          <form className="gate-card" onSubmit={handleLogin}>
            <h1>{venueSlug}</h1>
            <p>Enter the admin code to manage this venue.</p>
            <input
              className="gate-input"
              type="text"
              inputMode="numeric"
              placeholder="••••"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            {loginError && <div className="gate-error">{loginError}</div>}
            <button className="primary-btn" type="submit" disabled={loggingIn} style={{ width: '100%' }}>
              {loggingIn ? 'Checking...' : 'Log in'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (loadingDashboard && !venue) {
    return (
      <div className="admin-shell">
        <div className="loading-text">Loading {venueSlug}...</div>
      </div>
    )
  }

  if (dashboardError && !venue) {
    return (
      <div className="admin-shell">
        <div className="error-text">Couldn't load this venue: {dashboardError}</div>
      </div>
    )
  }

  const upNext = queue[0] || null
  const venueUrl = `${window.location.origin}/${venueSlug}`
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    venueUrl
  )}`

  return (
    <div className="admin-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">♪</div>
          <div>
            playnext
            <small>{venue?.name || venueSlug}</small>
          </div>
        </div>

        <nav className="view-switcher">
          <button className={tab === 'manager' ? 'active' : ''} onClick={() => setTab('manager')}>
            Manager
          </button>
          <button className={tab === 'player' ? 'active' : ''} onClick={() => setTab('player')}>
            Player
          </button>
        </nav>

        <button className="secondary-btn settings-trigger" onClick={() => setShowSettings(true)}>
          Settings
        </button>
        <button className="secondary-btn" onClick={logout}>
          Log out
        </button>
      </header>

      {tab === 'manager' && (
        <main className="admin-main">
          <div className="admin-grid">
            <div>
              <section className="admin-card">
                <h3>Now playing</h3>
                <p>The first song in the queue is treated as what's currently playing.</p>

                <div className="admin-now">
                  {nowPlaying?.thumbnailUrl ? (
                    <img className="admin-cover-img" src={nowPlaying.thumbnailUrl} alt="" />
                  ) : (
                    <div className="admin-cover">♪</div>
                  )}
                  <div>
                    <h2>{nowPlaying ? nowPlaying.title : 'Nothing queued'}</h2>
                    <p>{nowPlaying ? nowPlaying.artist : 'Add a song to get started'}</p>
                    <div className="progress"><span style={{ width: `${progressPercent}%` }} /></div>
                    <div className="time-row"><span>{formatTime(playbackProgress.currentTime)}</span><span>{formatTime(playbackProgress.duration)}</span></div>
                  </div>
                </div>

                <div className="admin-actions">
                  <button
                    className={`playback-action ${isPlaying ? 'pause-state' : 'play-state'}`}
                    onClick={() => setIsPlaying((playing) => !playing)}
                    disabled={!nowPlaying}
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button className="danger-btn" onClick={skipCurrent} disabled={!nowPlaying}>
                    Skip
                  </button>
                </div>
              </section>

              <section className="admin-card">
                <div className="card-title-row"><h3>Queue</h3><button className="secondary-btn list-reset" onClick={resetQueue} disabled={queue.length === 0}>Reset queue</button></div>
                <p>Remove requests before they play.</p>

                <form className="admin-add-song" onSubmit={addAdminSong}>
                  <input value={adminTitle} onChange={(e) => setAdminTitle(e.target.value)} placeholder="Add song title" />
                  <input value={adminArtist} onChange={(e) => setAdminArtist(e.target.value)} placeholder="Artist (optional)" />
                  <button className="primary-btn" type="submit">Add song</button>
                </form>

                <div className="admin-queue">
                  {queue.length === 0 && <div className="empty-queue">Queue is empty.</div>}
                  {queue.map((item) => (
                    <div className="admin-song" key={item.id}>
                      {item.thumbnailUrl ? (
                        <img className="cover-img" src={item.thumbnailUrl} alt="" />
                      ) : (
                        <div className="cover" />
                      )}
                      <div className="song-meta">
                        <strong>{item.title}</strong>
                        <span>{item.artist}</span>
                      </div>
                      <div className="queue-actions">
                        <button onClick={() => moveQueueItem(item.id, 'up')} title="Move up">↑</button>
                        <button onClick={() => moveQueueItem(item.id, 'down')} title="Move down">↓</button>
                        <button onClick={() => removeQueueItem(item.id, item.title)} title="Remove">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {venue.settings.manualApproval && (
                <section className="admin-card pending-card--left">
                  <div className="card-title-row"><h3>Pending approval</h3><button className="secondary-btn list-reset" onClick={resetPending} disabled={pending.length === 0}>Reset list</button></div>
                  <p>These requests are hidden from guests until approved.</p>
                  <div className="admin-queue">
                    {pending.length === 0 && <div className="empty-queue">No pending requests.</div>}
                    {pending.map((item) => (
                      <div className="admin-song" key={item.id}>
                        {item.thumbnailUrl ? <img className="cover-img" src={item.thumbnailUrl} alt="" /> : <div className="cover" />}
                        <div className="song-meta"><strong>{item.title}</strong><span>{item.artist}</span></div>
                        <div className="queue-actions">
                          <button className="approve-request" onClick={() => approvePending(item.id)} title="Approve">✓</button>
                          <button onClick={() => rejectPending(item.id)} title="Delete">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div>
              <aside className={`settings-drawer ${showSettings ? 'open' : ''}`}>
                <div className="settings-drawer-head"><h3>Request controls</h3><button onClick={() => setShowSettings(false)} aria-label="Close settings">×</button></div>
                <p>Rules are enforced by the backend.</p>

                <div className="settings-stack">
                  <div className="setting-row">
                    <div>
                      <strong>Accept song requests</strong>
                      <span>Allow guests to join the queue.</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.acceptRequests ? 'on' : ''}`}
                      onClick={() => toggleSetting('acceptRequests')}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>Manual approval</strong>
                      <span>Staff approve requests before queueing.</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.manualApproval ? 'on' : ''}`}
                      onClick={() => toggleSetting('manualApproval')}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>One request per guest</strong>
                      <span>Guest can only have one active request at a time.</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.onePerGuest ? 'on' : ''}`}
                      onClick={() => toggleSetting('onePerGuest')}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>Require verified track match</strong>
                      <span>Only accept requests iTunes can identify; otherwise use YouTube fallback.</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.requireVerifiedMatch ? 'on' : ''}`}
                      onClick={() => toggleSetting('requireVerifiedMatch')}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>Require daily code</strong>
                      <span>{venue.settings.sameNetworkRequired ? 'Disabled while venue Wi-Fi access is required.' : 'Guests enter the daily code before joining.'}</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.dailyCodeRequired ? 'on' : ''}`}
                      onClick={() => toggleSetting('dailyCodeRequired')}
                      disabled={venue.settings.sameNetworkRequired}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <strong>Require venue Wi-Fi</strong>
                      <span>Guests must share the active player’s public internet connection. This turns off the daily code.</span>
                    </div>
                    <button
                      className={`toggle ${venue.settings.sameNetworkRequired ? 'on' : ''}`}
                      onClick={() => toggleSetting('sameNetworkRequired')}
                    />
                  </div>

                  {!venue.settings.onePerGuest && (
                    <div className="setting-row">
                      <div>
                        <strong>Wait between requests</strong>
                        <span>Minimum seconds a guest must wait between songs.</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        className="cooldown-input"
                        value={venue.settings.cooldownSeconds}
                        onChange={(e) => updateCooldown(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
              </aside>

              <section className="admin-card">
                <h3>QR and daily code</h3>
                <p>Display these near the entrance or counter.</p>

                <div className="code-box">
                  <div className="daily-code">
                    <span>Today's code</span>
                    <strong>{venue.dailyCode}</strong>
                    <div style={{ marginTop: 14 }}>
                      <button className="secondary-btn" onClick={regenerateDailyCode}>
                        Generate new code
                      </button>
                    </div>
                  </div>

                  <img className="qr-img" src={qrSrc} alt={`QR code linking to ${venueUrl}`} />
                </div>

                <div className="venue-link">{venueUrl} <button className="copy-link-btn" onClick={copyVenueLink} title="Copy venue link" aria-label="Copy venue link">⧉</button></div>
              </section>

              {venue.settings.manualApproval && (
                <section className="admin-card pending-card">
                  <div className="card-title-row"><h3>Pending approval</h3><button className="secondary-btn list-reset" onClick={resetPending} disabled={pending.length === 0}>Reset list</button></div>
                  <p>These requests are hidden from guests until approved.</p>
                  <div className="admin-queue">
                    {pending.length === 0 && <div className="empty-queue">No pending requests.</div>}
                    {pending.map((item) => (
                      <div className="admin-song" key={item.id}>
                        {item.thumbnailUrl ? <img className="cover-img" src={item.thumbnailUrl} alt="" /> : <div className="cover" />}
                        <div className="song-meta"><strong>{item.title}</strong><span>{item.artist}</span></div>
                        <div className="queue-actions"><button className="approve-request" onClick={() => approvePending(item.id)} title="Approve">✓</button><button onClick={() => rejectPending(item.id)} title="Delete">×</button></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      )}

      <main className={`player-wrap ${tab === 'player' ? '' : 'player-wrap--background'}`}>
          <div className="player-panel">
            {nowPlaying?.videoId ? (
              <div className="player-media compact">
                <PlayerEngine
                  ref={playerEmbedRef}
                  provider="youtube"
                  videoId={nowPlaying.videoId}
                  playbackId={nowPlaying.id}
                  isPlaying={isPlaying}
                  onEnded={skipCurrent}
                  onError={showToast}
                  onProgress={setPlaybackProgress}
                  size="compact"
                />
              </div>
            ) : (
              <div className="player-album">♪</div>
            )}

            {nowPlaying?.thumbnailUrl ? (
              <img className="player-artwork" src={nowPlaying.thumbnailUrl} alt="" />
            ) : (
              <div className="player-album">Now playing</div>
            )}

            <div className="player-kicker">Now playing at {venue?.name || venueSlug}</div>
            <h1>{nowPlaying ? nowPlaying.title : 'Nothing queued'}</h1>
            <h2>{nowPlaying ? nowPlaying.artist : '—'}</h2>

            <div className="player-controls">
              <button
                className={`playback-action ${isPlaying ? 'pause-state' : 'play-state'}`}
                onClick={() => setIsPlaying((p) => !p)}
                disabled={!nowPlaying}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button className="danger-btn" onClick={skipCurrent} disabled={!nowPlaying}>
                Skip
              </button>
            </div>

            <div className="player-progress">
              <div className="progress"><span style={{ width: `${progressPercent}%` }} /></div>
              <div className="time-row"><span>{formatTime(playbackProgress.currentTime)}</span><span>{formatTime(playbackProgress.duration)}</span></div>
            </div>

            <button className="secondary-btn player-fullscreen" onClick={openFullscreen} disabled={!nowPlaying}>
              {isFullscreen ? 'Exit full screen' : 'Full screen video'}
            </button>

            <div className="next-up">
              Next in queue
              <strong>{upNext ? `${upNext.title} — ${upNext.artist}` : 'Nothing next'}</strong>
            </div>
          </div>
        </main>

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}
