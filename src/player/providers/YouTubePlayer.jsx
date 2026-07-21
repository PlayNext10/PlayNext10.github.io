import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Provider implementation only. Keep all YouTube SDK details here so the
// rest of the app can later swap providers without knowing their APIs.
let youtubeApiPromise

function loadYouTubeApi() {
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('Could not load the YouTube player'))
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
    document.head.appendChild(script)
  })

  return youtubeApiPromise
}

const YouTubePlayer = forwardRef(function YouTubePlayer(
  { videoId, playbackId, isPlaying, onEnded, onError, onProgress, size = 'compact' },
  ref
) {
  const shellRef = useRef(null)
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const isReadyRef = useRef(false)
  const onEndedRef = useRef(onEnded)
  const onErrorRef = useRef(onError)
  const onProgressRef = useRef(onProgress)
  const failedPlaybackRef = useRef(false)

  useImperativeHandle(ref, () => ({
    requestFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
        return true
      }
      if (!shellRef.current?.requestFullscreen) return false
      shellRef.current.requestFullscreen().catch(() => {})
      return true
    },
  }))

  useEffect(() => {
    onEndedRef.current = onEnded
    onErrorRef.current = onError
    onProgressRef.current = onProgress
  }, [onEnded, onError, onProgress])

  function handlePlaybackError(message) {
    // YouTube can fire more than one error event for a restricted embed. Only
    // advance once or a single bad video could skip several real requests.
    if (failedPlaybackRef.current) return
    failedPlaybackRef.current = true
    onErrorRef.current?.(message)
    onEndedRef.current?.()
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isReadyRef.current || !playerRef.current) return
      const currentTime = playerRef.current.getCurrentTime?.() || 0
      const duration = playerRef.current.getDuration?.() || 0
      onProgressRef.current?.({ currentTime, duration })
    }, 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return
        // The YouTube SDK replaces its mount element with an iframe. Create
        // that mount element imperatively so React never tries to remove it.
        const mountNode = document.createElement('div')
        hostRef.current.appendChild(mountNode)
        playerRef.current = new YT.Player(mountNode, {
          width: size === 'expanded' ? '100%' : 200,
          height: size === 'expanded' ? '100%' : 200,
          videoId,
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            controls: 0,
            fs: 0,
            disablekb: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              isReadyRef.current = true
              playerRef.current?.getIframe?.().setAttribute('allowfullscreen', '')
              if (isPlaying) playerRef.current?.playVideo()
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) onEndedRef.current?.()
            },
            onError: () => handlePlaybackError('This YouTube video cannot be played here. Skipping it.'),
          },
        })
      })
      .catch(() => onErrorRef.current?.('Could not load the YouTube player.'))

    return () => {
      cancelled = true
      isReadyRef.current = false
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
    // A provider instance is intentionally created once; video changes are
    // handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isReadyRef.current || !playerRef.current || !videoId) return
    failedPlaybackRef.current = false
    playerRef.current.loadVideoById(videoId)
    if (!isPlaying) playerRef.current.pauseVideo()
  }, [videoId, playbackId])

  useEffect(() => {
    if (!isReadyRef.current || !playerRef.current) return
    if (isPlaying) playerRef.current.playVideo()
    else playerRef.current.pauseVideo()
  }, [isPlaying])

  return (
    <div ref={shellRef} className={`youtube-player youtube-player--${size}`}>
      <div ref={hostRef} />
      <button className="youtube-exit" onClick={() => document.exitFullscreen?.()}>Exit full screen</button>
    </div>
  )
})

export default YouTubePlayer
