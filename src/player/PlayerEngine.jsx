import { forwardRef } from 'react'
import YouTubePlayer from './providers/YouTubePlayer.jsx'

// The app talks only to this boundary, never to a provider SDK. To change
// playback later, add a provider component under player/providers and map it
// here. AdminPage and the queue API stay unchanged.
const PlayerEngine = forwardRef(function PlayerEngine({ provider = 'youtube', ...props }, ref) {
  const providers = { youtube: YouTubePlayer }
  const Provider = providers[provider]
  return Provider ? <Provider ref={ref} {...props} /> : null
})

export default PlayerEngine
