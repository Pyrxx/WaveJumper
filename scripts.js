/* ============================================================================
  Global constants, configuration, and reusable helpers
============================================================================ */

/**
 * SVG icon markup placeholders (inline SVG or strings)
 */
const ICONS = {
  play: `<svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><polygon points="6 4 20 12 6 20" /></svg>`,
  pause: `<svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  prev: `<svg class="prev-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`,
  next: `<svg class="next-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  mute: `<svg class="unmute-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><path d="M16.5 7.5a5 5 0 0 1 0 9"></path></svg>`,
  unmute: `<svg class="mute-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><line x1="18" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="18" y2="15"></line></svg>`
};

/**
 * Waveform visualization constants
 */
const WAVEFORM_CONFIG = {
  barWidth: 2,           // Width of each waveform bar in pixels
  spaceWidth: 1,         // Space between bars in pixels
  height: 80,            // Canvas height for waveform visualization
  get peakUnit() {
    return this.barWidth + this.spaceWidth;
  }
};

/**
 * Playback and interaction constants
 */
const PLAYBACK_CONFIG = {
  skipSmall: 10,         // Arrow keys seek step in seconds
  skipLarge: 60,         // Shift + Arrow keys seek step in seconds
  volumeStep: 0.05,      // Mouse wheel volume step
  resizeDebounceMs: 100  // Debounce delay for resize-driven re-render
};

/**
 * Formats time in seconds to a string (MM:SS or HH:MM:SS)
 * @param {number} seconds - Time in seconds
 * @param {boolean} [showHours=false] - Whether to show hours
 * @returns {string} Formatted time string
 */
const formatTime = (seconds, showHours = false) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (showHours || h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Clamps a value between 0 and 1
 * @param {number} v - Value to clamp
 * @returns {number} Clamped value
 */
const clamp01 = v => Math.min(Math.max(v, 0), 1);

/**
 * Converts a string to a URL-friendly slug
 * @param {string} input - String to slugify
 * @returns {string} Slugified string
 */
function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // Replace non-alphanumerics with dashes
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing dashes
    .replace(/-{2,}/g, '-');       // Collapse multiple dashes
}

/**
 * Gets CSS theme variables for waveform rendering
 * @returns {Object} Theme variables
 */
function getThemeVars() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    highlight: style.getPropertyValue('--highlight').trim(),
    highlightAlt: style.getPropertyValue('--highlight-alt').trim(),
    textColorMuted: style.getPropertyValue('--text-color-muted').trim()
  };
}

/* ============================================================================
  Waveform rendering and data interpolation
============================================================================ */

/**
 * Renders a bar waveform to a canvas 2D context.
 * Colors are resolved once per call and reused for all bars.
 */
/**
 * Renders a bar waveform to a canvas 2D context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number[]} ampData - Amplitude data
 * @param {number} progress - Playback progress (0-1)
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} [hoverIndex=-1] - Index of hovered bar
 * @param {boolean} [isHovering=false] - Whether hovering is active
 * @param {Object} [theme=null] - Theme colors
 */
function drawWaveform(ctx, ampData, progress, width, height, hoverIndex = -1, isHovering = false, theme = null) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const colors = theme || getThemeVars();
  const midY = height / 2;
  const total = ampData.length;

  for (let i = 0; i < total; i++) {
    const amp = ampData[i];
    const barHeight = amp * height;
    const x = i * WAVEFORM_CONFIG.peakUnit;

    let fillStyle;
    if (isHovering && i === hoverIndex) {
      fillStyle = colors.highlightAlt;
    } else if (progress > 0 && i / total <= progress) {
      fillStyle = colors.highlight;
    } else {
      fillStyle = colors.textColorMuted;
    }

    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, midY - barHeight / 2, WAVEFORM_CONFIG.barWidth, barHeight);
  }
}

/**
 * Interpolates amplitude data to a target length using linear interpolation
 * @param {number[]} inputData - Original amplitude data
 * @param {number} targetLength - Desired length
 * @returns {number[]} Interpolated data
 */
function interpolateAmplitudeData(inputData, targetLength) {
  const output = new Array(targetLength);
  const inputLength = inputData.length;
  if (!inputLength || !targetLength) return [];

  for (let i = 0; i < targetLength; i++) {
    const pos = i * (inputLength - 1) / (targetLength - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const v1 = inputData[idx] || 0;
    const v2 = inputData[Math.min(idx + 1, inputLength - 1)] || 0;
    output[i] = v1 + frac * (v2 - v1);
  }
  return output;
}

/* ============================================================================
  Player state, DOM references, and cross-component utilities
============================================================================ */

/**
 * Player state
 */
const playerState = {
  tracks: [],           // Array of track objects with references and helpers
  playingIndex: -1,     // Index of currently playing track, -1 if none
  isMuted: false,       // Global mute toggle
  prevVolume: 1,        // Last non-zero volume (for unmute restore)
  currentVolume: 1      // Current volume level
};

/**
 * DOM element references
 */
const domElements = {
  playBtn: document.querySelector('#btn-play-pause'),
  prevBtn: document.querySelector('#btn-prev'),
  nextBtn: document.querySelector('#btn-next'),
  muteBtn: document.querySelector('#btn-mute'),
  volumeSlider: document.querySelector('#volume-slider'),
  volumeFill: document.querySelector('#volume-fill'),
  volumePercent: document.querySelector('#volume-percent'),
  tracklistDiv: document.getElementById('tracklist'),
  nowPlaying: document.getElementById('now-playing')
};

/**
 * Updates the volume bar UI
 * @param {number} volume - Volume level (0-1)
 */
function updateVolumeBar(volume) {
  const perc = Math.round(volume * 100);
  domElements.volumeSlider.style.setProperty('--vol-percent', `${perc}%`);
  if (domElements.volumeFill) {
    domElements.volumeFill.style.width = `${perc}%`;
  }
}

/**
 * Updates the volume percentage display
 * @param {number} volume - Volume level (0-1)
 */
function updateVolumePercent(volume) {
  const percent = Math.round(volume * 100);
  domElements.volumePercent.textContent = `${percent}%`;
}

/**
 * Updates the mute button icon
 */
function updateMuteButton() {
  domElements.muteBtn.innerHTML = playerState.isMuted ? ICONS.unmute : ICONS.mute;
}

/**
 * Synchronizes footer controls with an active track
 * @param {HTMLAudioElement} audio - Audio element
 * @param {HTMLElement} playBtn - Play button element
 * @param {number} idx - Track index
 */
function updateFooter(audio, playBtn, idx) {
  if ((audio || playBtn) && Number.isInteger(idx) && playerState.tracks[idx]) {
    if (!audio) audio = playerState.tracks[idx].audio;
    if (!playBtn) playBtn = playerState.tracks[idx].btnPlay;
  }

  if (audio || playBtn) {
    const paused = audio ? audio.paused : playBtn.innerHTML === ICONS.play;
    domElements.playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    domElements.playBtn.disabled = false;
    domElements.playBtn._linkedAudio = audio || null;
    domElements.playBtn._linkedPlayBtn = playBtn || null;
    domElements.playBtn._linkedIndex = Number.isInteger(idx) ? idx : -1;

    if (audio) {
      domElements.volumeSlider.value = audio.volume;
      updateVolumeBar(audio.volume);
      updateVolumePercent(audio.volume);
    } else {
      updateVolumeBar(1);
      updateVolumePercent(1);
    }
  } else {
    domElements.playBtn.innerHTML = ICONS.play;
    domElements.playBtn.disabled = true;
    domElements.playBtn._linkedAudio = null;
    domElements.playBtn._linkedPlayBtn = null;
    domElements.playBtn._linkedIndex = -1;
    updateVolumeBar(1);
    updateVolumePercent(1);
  }
}

/**
 * Scrolls an element to the vertical center of the viewport
 * @param {HTMLElement} element - Element to scroll to
 */
function scrollToCenterElement(element) {
  const bounding = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const scrollToY = window.scrollY + bounding.top - (viewportHeight / 2) + (bounding.height / 2);

  window.scrollTo({
    top: scrollToY,
    behavior: 'smooth'
  });
}

/**
 * Updates the now-playing display with active track information
 */
function updateNowPlayingDisplay() {
  const nowPlaying = domElements.nowPlaying;
  if (!nowPlaying) return;

  // Clear existing content
  nowPlaying.innerHTML = '';

  const activeIndex = playerState.playingIndex;
  if (activeIndex === -1 || !playerState.tracks[activeIndex]) return;

  const track = playerState.tracks[activeIndex];
  const audio = track.audio;
  const artist = track.container.querySelector('.track-artist')?.textContent || '';
  const title = track.container.querySelector('.track-title')?.textContent || '';
  const coverSrc = track.container.querySelector('.track-cover-img')?.src || '';
  const duration = audio.duration || 0;

  // Add aria-label to now-playing element
  nowPlaying.setAttribute('aria-label', `Now playing: ${artist} - ${title}`);

  // Create cover art div
  const coverDiv = document.createElement('div');
  coverDiv.className = 'now-playing-cover';

  const coverImg = document.createElement('img');
  coverImg.src = coverSrc;
  coverImg.alt = `${title} cover art`;
  coverImg.width = 30;
  coverImg.height = 30;
  coverImg.style.cursor = 'pointer';

  nowPlaying.addEventListener('click', () => {
    scrollToCenterElement(track.container);
  });

  coverDiv.appendChild(coverImg);

  // Create artist-title div
  const infoDiv = document.createElement('div');
  infoDiv.className = 'now-playing-info';
  infoDiv.textContent = `${artist} - ${title}`;

  // Create time div
  const timeDiv = document.createElement('div');
  timeDiv.className = 'now-playing-time';

  const playPosSpan = document.createElement('span');
  playPosSpan.className = 'now-playing-play-pos';
  playPosSpan.textContent = formatTime(audio.currentTime);

  const durationSpan = document.createElement('span');
  durationSpan.className = 'now-playing-duration';
  durationSpan.textContent = formatTime(duration);

  timeDiv.appendChild(playPosSpan);
  timeDiv.appendChild(document.createTextNode(' | '));
  timeDiv.appendChild(durationSpan);

  // Append all to now-playing
  nowPlaying.appendChild(coverDiv);
  nowPlaying.appendChild(infoDiv);
  nowPlaying.appendChild(timeDiv);
}

/**
 * Plays audio with error handling
 * @param {HTMLAudioElement} audio - Audio element to play
 * @returns {Promise<boolean>} True if playback started successfully
 */
async function safePlay(audio) {
  try {
    await audio.play();
    return true;
  } catch (err) {
    console.warn('Playback requires a user interaction to start.');
    return false;
  }
}

/**
 * Updates Media Session metadata and playback state
 * @param {number} idx - Track index
 * @param {string} [playbackState='none'] - Playback state: 'none', 'paused', or 'playing'
 */
function updateMediaSession(idx, playbackState = 'none') {
  if (!('mediaSession' in navigator)) return;

  const track = playerState.tracks[idx];
  if (!track) return;

  const artist = track.container.querySelector('.track-artist')?.textContent || '';
  const title = track.container.querySelector('.track-title')?.textContent || '';
  const imgEl = track.container.querySelector('.track-cover-img');
  const artworkSrc = imgEl?.src || '';

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: '',
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: '512x512', type: 'image/png' }] : []
    });

    // Normalize playbackState to 'playing' or 'paused' for loaded media
    if (playbackState === 'none') playbackState = 'paused';

    navigator.mediaSession.playbackState = playbackState;

    const mediaSession = navigator.mediaSession;

    // Play action handler
    mediaSession.setActionHandler('play', async () => {
      const audio = playerState.tracks[playerState.playingIndex]?.audio;
      if (audio && audio.paused) {
        try { await audio.play(); } catch { }
        updateMediaSession(playerState.playingIndex, 'playing');
      }
    });

    // Pause action handler
    mediaSession.setActionHandler('pause', () => {
      const audio = playerState.tracks[playerState.playingIndex]?.audio;
      if (audio && !audio.paused) {
        audio.pause();
        updateMediaSession(playerState.playingIndex, 'paused');
      }
    });

    // Previous track action
    mediaSession.setActionHandler('previoustrack', () => {
      if (playerState.playingIndex > 0) togglePlay(-1);
    });

    // Next track action
    mediaSession.setActionHandler('nexttrack', () => {
      if (playerState.playingIndex < playerState.tracks.length - 1) togglePlay(+1);
    });

    // Seek action
    mediaSession.setActionHandler('seekto', (details) => {
      const audio = playerState.tracks[playerState.playingIndex]?.audio;
      if (!audio) return;
      if (details.fastSeek && typeof audio.fastSeek === 'function') {
        audio.fastSeek(details.seekTime);
      } else {
        audio.currentTime = details.seekTime;
      }
    });

    // Stop action
    mediaSession.setActionHandler('stop', () => {
      const audio = playerState.tracks[playerState.playingIndex]?.audio;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      updateMediaSession(playerState.playingIndex, 'paused');
    });

  } catch (err) {
    console.warn('Failed to update Media Session:', err);
  }
}

/* ============================================================================
  Core playback and navigation
============================================================================ */

/**
 * Gets the current track index based on various factors
 * @returns {number} Current track index
 */
function getCurrentTrackIndex() {
  // Check if we have a linked index from the footer button
  if (Number.isInteger(domElements.playBtn._linkedIndex)) {
    return domElements.playBtn._linkedIndex;
  }

  // Check if we have a currently playing track
  if (playerState.playingIndex !== -1) {
    return playerState.playingIndex;
  }

  // Check URL hash for a track ID
  const hashId = (window.location.hash || '').slice(1);
  const hashIndex = playerState.tracks.findIndex(t => t.container.id === hashId);
  if (hashIndex >= 0) {
    return hashIndex;
  }

  // Default to first track
  return 0;
}

/**
 * Gets the next track index based on direction
 * @param {number} currentIndex - Current track index
 * @param {number} direction - -1 for previous, +1 for next
 * @returns {number|null} Next track index or null if invalid
 */
function getNextTrackIndex(currentIndex, direction) {
  let nextIndex = currentIndex;

  if (direction === -1) { // Previous
    nextIndex = currentIndex > 0 ? currentIndex - 1 : null;
  } else if (direction === +1) { // Next
    nextIndex = currentIndex < playerState.tracks.length - 1 ? currentIndex + 1 : null;
  }

  return nextIndex !== null && playerState.tracks[nextIndex] ? nextIndex : null;
}

/**
 * Pauses all tracks except the specified one
 * @param {HTMLAudioElement} excludeAudio - Audio element to exclude from pausing
 */
function pauseAllOtherTracks(excludeAudio) {
  playerState.tracks.forEach(({ audio, btnPlay }) => {
    if (audio && audio !== excludeAudio) {
      audio.pause();
      if (btnPlay) {
        btnPlay.innerHTML = ICONS.play;
        btnPlay.setAttribute('aria-pressed', 'false');
      }
    }
  });
}

/**
 * Updates UI for play state
 * @param {HTMLAudioElement} audio - Audio element
 * @param {HTMLElement} playBtn - Play button element
 */
function updatePlayStateUI(audio, playBtn) {
  if (playBtn) {
    playBtn.innerHTML = ICONS.pause;
    playBtn.setAttribute('aria-pressed', 'true');
  }
  domElements.playBtn.innerHTML = ICONS.pause;
}

/**
 * Updates the active track class
 * @param {number} activeIndex - Index of the active track
 */
function updateActiveTrackClass(activeIndex) {
  // Remove active-track class from all tracks
  playerState.tracks.forEach((track, index) => {
    if (track.container) {
      track.container.classList.remove('active-track');
    }
  });

  // Add active-track class to the active track
  if (activeIndex >= 0 && activeIndex < playerState.tracks.length) {
    const activeTrack = playerState.tracks[activeIndex];
    if (activeTrack && activeTrack.container) {
      activeTrack.container.classList.add('active-track');
    }
  }
}

/**
 * Updates UI for pause state
 * @param {HTMLAudioElement} audio - Audio element
 * @param {HTMLElement} playBtn - Play button element
 */
function updatePauseStateUI(audio, playBtn) {
  if (playBtn) {
    playBtn.innerHTML = ICONS.play;
    playBtn.setAttribute('aria-pressed', 'false');
  }
  domElements.playBtn.innerHTML = ICONS.play;
}

/**
 * Centralized play/pause/resume toggle
 * @param {number} [direction] -1 for previous track, +1 for next track
 */
async function togglePlay(direction) {
  const currentIndex = getCurrentTrackIndex();
  const targetIndex = direction !== undefined ? getNextTrackIndex(currentIndex, direction) : currentIndex;

  if (targetIndex === null) return;

  const target = playerState.tracks[targetIndex];
  if (!target) return;

  const { audio, btnPlay } = target;

  // Always reset position to start for prev/next
  if (direction !== undefined) {
    audio.currentTime = 0;
  }

  updateFooter(audio, btnPlay, targetIndex);
  pauseAllOtherTracks(audio);

  if (audio.paused || direction !== undefined) {
    const ok = await safePlay(audio);
    if (!ok) return;

    updatePlayStateUI(audio, btnPlay);
    playerState.playingIndex = targetIndex;

    // Sync hash & scroll to active track
    const trackId = target.container.id;
    if (window.location.hash.slice(1) !== trackId) {
      history.pushState({}, '', `#${trackId}`);
    }
    scrollToCenterElement(target.container);
    updateMediaSession(targetIndex, 'playing');
    updateActiveTrackClass(targetIndex);
    updateNowPlayingDisplay();
  } else {
    audio.pause();
    updatePauseStateUI(audio, btnPlay);
    // Don't reset playingIndex when pausing - this keeps the "now playing" display visible
    updateMediaSession(targetIndex, 'paused');
    updateActiveTrackClass(targetIndex);
    updateNowPlayingDisplay();
  }
}

/* ============================================================================
  Track element creation and per-track interaction wiring
============================================================================ */

/**
 * Creates a track block, waveform, audio element, and attaches all behaviors
 * @param {Array} data - Track data array
 * @param {number} idx - Track index
 * @returns {Object} Track object with references
 */
function createTrackElement(data, idx) {
  // Data shape: [filename, artist, title, date, genre, durationSec, detailsHTML, coverBase64, ampJSON, hash]
  const [filename, artist, title, dateStr, genre, durationSec, detailsHTML, coverBase64, ampJSON] = data;
  const ampData = JSON.parse(ampJSON);

  const trackItemDiv = document.createElement('div');
  trackItemDiv.className = 'track-item content';
  trackItemDiv.id = slugify(filename);

  const trackMainDiv = document.createElement('div');
  trackMainDiv.className = 'track-main';

  const trackBgDiv = document.createElement('div');
  trackBgDiv.className = 'track-bg';

  const trackCoverDiv = document.createElement('div');
  trackCoverDiv.className = 'track-cover';

  const trackCoverLink = document.createElement('a');
  trackCoverLink.href = `#${trackItemDiv.id}`;
  trackCoverLink.className = 'track-cover-link';

  const trackCoverImg = document.createElement('img');
  trackCoverImg.alt = `${title} cover art`;
  trackCoverImg.className = 'track-cover-img';
  trackCoverImg.src = `data:image/png;base64,${coverBase64}`;

  trackCoverLink.appendChild(trackCoverImg);
  trackCoverDiv.appendChild(trackCoverLink);

  const trackPlayPauseBtn = document.createElement('button');
  trackPlayPauseBtn.className = 'playback-button track-btn-play-pause';
  trackPlayPauseBtn.setAttribute('aria-label', `Play or Pause ${title} by ${artist}`);
  trackPlayPauseBtn.setAttribute('aria-pressed', 'false');
  trackPlayPauseBtn.innerHTML = ICONS.play;

  const trackArtistTitleDiv = document.createElement('div');
  trackArtistTitleDiv.className = 'track-artist-title';

  const trackArtistDiv = document.createElement('div');
  trackArtistDiv.className = 'track-artist';
  trackArtistDiv.textContent = artist;

  const trackTitleDiv = document.createElement('div');
  trackTitleDiv.className = 'track-title';
  trackTitleDiv.textContent = title;

  trackArtistTitleDiv.appendChild(trackArtistDiv);
  trackArtistTitleDiv.appendChild(trackTitleDiv);

  const trackGenreDiv = document.createElement('div');
  trackGenreDiv.className = 'track-genre';
  trackGenreDiv.textContent = genre;

  const trackDateDiv = document.createElement('div');
  trackDateDiv.className = 'track-date';
  trackDateDiv.textContent = dateStr;

  const trackTimeDiv = document.createElement('div');
  trackTimeDiv.className = 'track-time';

  const trackPlayPosDiv = document.createElement('div');
  trackPlayPosDiv.className = 'track-play-pos';
  trackPlayPosDiv.textContent = '0:00';

  const trackDurationDiv = document.createElement('div');
  trackDurationDiv.className = 'track-duration';
  trackDurationDiv.textContent = formatTime(durationSec);

  trackTimeDiv.appendChild(trackPlayPosDiv);
  trackTimeDiv.appendChild(trackDurationDiv);

  const trackWaveformDiv = document.createElement('div');
  trackWaveformDiv.className = 'track-waveform';

  const trackWaveformCanvas = document.createElement('canvas');
  trackWaveformCanvas.className = 'track-waveform-canvas';
  trackWaveformCanvas.height = WAVEFORM_CONFIG.height;
  trackWaveformDiv.appendChild(trackWaveformCanvas);

  trackBgDiv.style.cssText = `background-image: url(${trackCoverImg.src});`;
  trackMainDiv.appendChild(trackBgDiv);
  trackMainDiv.appendChild(trackCoverDiv);
  trackMainDiv.appendChild(trackWaveformDiv);
  trackMainDiv.appendChild(trackPlayPauseBtn);
  trackMainDiv.appendChild(trackArtistTitleDiv);

  if (genre != null && String(genre).trim() !== '') {
    trackMainDiv.appendChild(trackGenreDiv);
  }

  trackMainDiv.appendChild(trackDateDiv);
  trackMainDiv.appendChild(trackTimeDiv);

  const trackDetailsDiv = document.createElement('div');
  trackDetailsDiv.className = 'track-details';

  if (detailsHTML != null && String(detailsHTML).trim() !== '') {
    const trackDetailsBtn = document.createElement('button');
    trackDetailsBtn.className = 'track-details-btn';
    trackDetailsBtn.setAttribute('aria-expanded', 'false');
    trackDetailsBtn.textContent = 'Details';

    const trackDetailsContentDiv = document.createElement('div');
    trackDetailsContentDiv.className = 'track-details-content';
    trackDetailsContentDiv.innerHTML = detailsHTML;

    trackDetailsBtn.addEventListener('click', () => {
      const expanded = trackDetailsBtn.getAttribute('aria-expanded') === 'true';
      trackDetailsBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      trackDetailsContentDiv.classList.toggle('visible');
    });

    trackDetailsDiv.appendChild(trackDetailsBtn);
    trackDetailsDiv.appendChild(trackDetailsContentDiv);
  }

  trackItemDiv.appendChild(trackMainDiv);
  if (trackDetailsDiv.childNodes.length > 0) {
    trackItemDiv.appendChild(trackDetailsDiv);
  }

  // Hidden audio element
  const audioElement = document.createElement('audio');
  audioElement.src = `music/${filename}`;
  audioElement.preload = 'metadata';
  audioElement.style.display = 'none';
  audioElement.controls = false;
  trackItemDiv.appendChild(audioElement);

  /* Waveform drawing context and amplitude preparation */
  const ctx = trackWaveformCanvas.getContext('2d');
  const themeCache = getThemeVars();

  let currentCanvasWidth = 0;
  let waveformData = [];

  const updateCanvasWidthAndDraw = () => {
    let containerWidth = trackWaveformDiv.offsetWidth || 0;

    // Ensure width is divisible by peak unit for a perfect grid
    for (let reduction = 0; reduction <= (WAVEFORM_CONFIG.peakUnit - 1); reduction++) {
      const testWidth = containerWidth - reduction;
      if (testWidth % WAVEFORM_CONFIG.peakUnit === 0) {
        containerWidth = testWidth;
        break;
      }
    }

    trackWaveformCanvas.width = containerWidth;
    currentCanvasWidth = containerWidth;

    const numPeaks = containerWidth > 0 ? Math.floor(containerWidth / WAVEFORM_CONFIG.peakUnit) : 0;
    waveformData = interpolateAmplitudeData(ampData, Math.max(numPeaks, 0));

    drawWaveform(ctx, waveformData, 0, trackWaveformCanvas.width, WAVEFORM_CONFIG.height, -1, false, themeCache);
  };

  updateCanvasWidthAndDraw();

  /* End-of-track handler: reset and advance */
  audioElement.addEventListener('ended', () => { domElements.nextBtn.click(); });

  /* Align the URL anchor with the active track when playback begins */
  audioElement.addEventListener('play', () => {
    const trackId = trackItemDiv.id;
    const currentHash = window.location.hash.substring(1);
    if (currentHash !== trackId) {
      history.pushState({}, '', `#${trackId}`);
    }
  });

  /* Track-level play/pause control */
  trackPlayPauseBtn.addEventListener('click', async () => {
    if (audioElement.paused) {
      // Pause other tracks
      playerState.tracks.forEach(({ audio, btnPlay }, i) => {
        if (i !== idx) {
          audio?.pause();
          btnPlay.innerHTML = ICONS.play;
          btnPlay.setAttribute('aria-pressed', 'false');
        }
      });

      const ok = await safePlay(audioElement);
      if (!ok) return;

      trackPlayPauseBtn.innerHTML = ICONS.pause;
      trackPlayPauseBtn.setAttribute('aria-pressed', 'true');
      playerState.playingIndex = idx;
      updateFooter(audioElement, trackPlayPauseBtn, idx);
      scrollToCenterElement(trackItemDiv);
      updateMediaSession(idx, 'playing');
      updateActiveTrackClass(idx);
    } else {
      audioElement.pause();
      trackPlayPauseBtn.innerHTML = ICONS.play;
      trackPlayPauseBtn.setAttribute('aria-pressed', 'false');
      // Don't reset playingIndex when pausing - this keeps the "now playing" display visible
      updateMediaSession(idx, 'paused');
      updateActiveTrackClass(idx);
    }
  });

  /* Unified pointer interactions for waveform hovering and seeking */
  let isHovering = false;
  let hoverIndex = -1;
  let isPointerDown = false;

  if (trackWaveformCanvas && trackWaveformCanvas.style) {
    trackWaveformCanvas.style.touchAction = 'none';
  }

  function getDuration() {
    return audioElement.duration || durationSec || 0;
  }

  function getProgressRatio() {
    const dur = getDuration();
    return dur ? (audioElement.currentTime / dur) : 0;
  }

  function setCurrentTimeFromRatio(ratio) {
    const dur = getDuration();
    audioElement.currentTime = clamp01(ratio) * dur;
  }

  function setHoverUI(showHover) {
    if (showHover) {
      trackTimeDiv.classList.add('wave-hover');
    } else {
      trackTimeDiv.classList.remove('wave-hover');
    }
  }

  function renderWave({ progressRatio, hoverIdx = -1, showHover = false }) {
    drawWaveform(ctx, waveformData, progressRatio, currentCanvasWidth, WAVEFORM_CONFIG.height, hoverIdx, showHover, themeCache);
  }

  function updateTimeDisplay(showHover, ratioForHover = null) {
    const dur = getDuration();
    const cur = audioElement.currentTime;
    const timeToShow = showHover && ratioForHover != null ? (ratioForHover * dur) : cur;
    trackPlayPosDiv.textContent = formatTime(timeToShow);
    trackDurationDiv.textContent = formatTime(dur);
    setHoverUI(showHover);
  }

  function getRatioFromClientX(clientX) {
    const rect = trackWaveformCanvas.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }

  function getRatioFromEvent(ev) {
    return getRatioFromClientX(ev.clientX);
  }

  function getHoverIndexFromRatio(ratio) {
    if (!waveformData || !waveformData.length) return -1;
    const i = Math.floor(clamp01(ratio) * waveformData.length);
    return Math.min(Math.max(i, 0), waveformData.length - 1);
  }

  function updateHoverFromEvent(ev, seeking = false) {
    const ratio = getRatioFromEvent(ev);
    const dur = getDuration();

    hoverIndex = getHoverIndexFromRatio(ratio);
    isHovering = true;

    if (seeking) setCurrentTimeFromRatio(ratio);

    const progressRatio = seeking ? ratio : getProgressRatio();
    renderWave({ progressRatio, hoverIdx: hoverIndex, showHover: true });
    updateTimeDisplay(true, ratio);

    return { ratio, dur };
  }

  function clearHover() {
    isHovering = false;
    hoverIndex = -1;
    const dur = getDuration();
    const cur = audioElement.currentTime;
    const progressRatio = dur ? (cur / dur) : 0;

    renderWave({ progressRatio, hoverIdx: -1, showHover: false });
    updateTimeDisplay(false, null);
  }

  audioElement.addEventListener('timeupdate', () => {
    if (!isHovering) {
      const cur = audioElement.currentTime;
      const dur = getDuration();
      const prog = dur ? cur / dur : 0;
      renderWave({ progressRatio: prog, hoverIdx: -1, showHover: false });
      trackPlayPosDiv.textContent = formatTime(cur);
      trackDurationDiv.textContent = formatTime(dur);

      // Update now-playing display if this is the active track
      if (playerState.playingIndex === idx) {
        updateNowPlayingDisplay();
      }
    }
  });

  function onPointerDown(ev) {
    ev.preventDefault();
    isPointerDown = true;
    isHovering = true;
    try {
      trackWaveformCanvas.setPointerCapture(ev.pointerId);
    } catch {}
    updateHoverFromEvent(ev, true);
  }

  function onPointerMove(ev) {
    const supportsHover = ev.pointerType === 'mouse';
    if (isPointerDown) {
      ev.preventDefault();
      updateHoverFromEvent(ev, true);
    } else if (supportsHover) {
      updateHoverFromEvent(ev, false);
    }
  }

  function onPointerUp(ev) {
    isPointerDown = false;
    const supportsHover = ev.pointerType === 'mouse';
    try {
      trackWaveformCanvas.releasePointerCapture(ev.pointerId);
    } catch {}
    if (supportsHover) {
      updateHoverFromEvent(ev, false);
    } else {
      clearHover();
    }
  }

  function onPointerLeave() {
    if (!isPointerDown) clearHover();
  }

  function onPointerCancel() {
    isPointerDown = false;
    clearHover();
  }

  trackWaveformCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  trackWaveformCanvas.addEventListener('pointermove', onPointerMove, { passive: false });
  trackWaveformCanvas.addEventListener('pointerup', onPointerUp);
  trackWaveformCanvas.addEventListener('pointerleave', onPointerLeave);
  trackWaveformCanvas.addEventListener('pointercancel', onPointerCancel);

  /**
   * Adjusts width to fit waveform grid
   * @param {number} width - Original width
   * @param {number} unit - Grid unit size
   * @returns {number} Adjusted width
   */
  function adjustWidthToGrid(width, unit) {
    for (let reduction = 0; reduction <= (unit - 1); reduction++) {
      const testWidth = width - reduction;
      if (testWidth % unit === 0) {
        return testWidth;
      }
    }
    return width;
  }

  /**
   * Calculates number of peaks for waveform
   * @param {number} containerWidth - Container width
   * @returns {number} Number of peaks
   */
  function calculateNumPeaks(containerWidth) {
    return containerWidth > 0 ? Math.floor(containerWidth / WAVEFORM_CONFIG.peakUnit) : 0;
  }

  // Debounced resize handling
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateCanvasWidthAndDraw();
      if (!audioElement.paused) {
        const curDur = audioElement.duration || durationSec;
        const prog = curDur ? audioElement.currentTime / curDur : 0;
        drawWaveform(ctx, waveformData, prog, currentCanvasWidth, WAVEFORM_CONFIG.height, -1, false, themeCache);
      }
    }, PLAYBACK_CONFIG.resizeDebounceMs);
  });
  resizeObserver.observe(trackWaveformDiv);

  return {
    container: trackItemDiv,
    audio: audioElement,
    btnPlay: trackPlayPauseBtn,
    timeDisplay: trackTimeDiv,
    canvasCtx: ctx,
    updateCanvasWidthAndDraw
  };
}

/* ============================================================================
  Global footer controls, keyboard, media keys, and navigation
============================================================================ */

/* Volume slider: propagate to all tracks, update UI and mute state */
let isDragging = false;

/**
 * Calculates volume from slider position
 * @param {number} clientX - Mouse position
 * @returns {number} Volume level (0-1)
 */
const updateVolumeFromPosition = (clientX) => {
  const rect = domElements.volumeSlider.getBoundingClientRect();
  const clickPosition = Math.min(Math.max(0, clientX - rect.left), rect.width);
  const vol = clickPosition / rect.width;
  return Math.min(1, Math.max(0, vol));
};

/**
 * Handles volume changes
 * @param {number} vol - New volume level (0-1)
 */
const handleVolumeChange = (vol) => {
  playerState.currentVolume = vol;

  // Set volume on all audio elements
  playerState.tracks.forEach(({ audio }) => {
    if (audio) {
      audio.volume = vol;
    }
  });

  updateVolumeBar(vol);
  updateVolumePercent(vol);

  // Update mute button state when volume reaches 0 or non-zero
  if (vol === 0) {
    playerState.isMuted = true;
    playerState.prevVolume = 0.05; // Set prevVolume to 0.05 when volume reaches 0
  } else if (playerState.isMuted) {
    playerState.isMuted = false;
    playerState.prevVolume = vol; // Update prevVolume to current volume
  }
  updateMuteButton();
};

const onPointerMove = (e) => {
  if (isDragging) {
    const vol = updateVolumeFromPosition(e.clientX || e.touches[0].clientX);
    handleVolumeChange(vol);
  }
};

const onPointerUp = () => {
  isDragging = false;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
};

domElements.volumeSlider.addEventListener('pointerdown', (e) => {
  isDragging = true;
  const vol = updateVolumeFromPosition(e.clientX || e.touches[0].clientX);
  handleVolumeChange(vol);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
});

domElements.volumeSlider.addEventListener('click', (e) => {
  const vol = updateVolumeFromPosition(e.clientX);
  handleVolumeChange(vol);
});

/* Volume slider mouse wheel adjustment */
domElements.volumeSlider.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY || e.detail || e.wheelDelta;
  const step = PLAYBACK_CONFIG.volumeStep;
  let vol = playerState.currentVolume;
  vol += delta < 0 ? step : -step;
  vol = Math.min(1, Math.max(0, vol));
  handleVolumeChange(vol);
}, { passive: false });

/* Global mute */
domElements.muteBtn.addEventListener('click', () => {
  playerState.isMuted = !playerState.isMuted;
  updateMuteButton();

  if (playerState.isMuted) {
    // Save the current volume
    playerState.prevVolume = playerState.currentVolume === 0 ? 0.05 : playerState.currentVolume;

    // Mute all tracks regardless of playback state
    playerState.tracks.forEach(({ audio }) => {
      if (audio) audio.volume = 0;
    });

    // Update UI to show muted state
    updateVolumeBar(0);
    updateVolumePercent(0);
  } else {
    // Unmute all tracks using the saved volume
    const volumeToRestore = playerState.prevVolume;
    playerState.tracks.forEach(({ audio }) => {
      if (audio) audio.volume = volumeToRestore;
    });

    // Update UI to show restored volume
    playerState.currentVolume = volumeToRestore;
    updateVolumeBar(volumeToRestore);
    updateVolumePercent(volumeToRestore);
  }
});

/* Global play/pause */
domElements.playBtn.addEventListener('click', () => { void togglePlay(); });

/* Global previous */
domElements.prevBtn.addEventListener('click', () => { void togglePlay(-1); });

/* Global next */
domElements.nextBtn.addEventListener('click', () => { void togglePlay(+1); });

/* Keyboard shortcuts: Space (toggle), Up/Down (prev/next), M/Numpad0 (mute), Left/Right (seek) */
window.addEventListener('keydown', e => {
  switch (e.code) {
    // play/pause
    case 'Space':
      e.preventDefault();
      void togglePlay();
      break;
    // next track
    case 'ArrowDown':
      e.preventDefault();
      void togglePlay(+1);
      break;
    // previous track
    case 'ArrowUp':
      e.preventDefault();
      void togglePlay(-1);
      break;
    // mute
    case 'KeyM':
      e.preventDefault();
      domElements.muteBtn.click();
      break;
    // seek left/right
    case 'ArrowRight':
    case 'ArrowLeft': {
      if (playerState.playingIndex === -1) return;
      const currentAudio = playerState.tracks[playerState.playingIndex]?.audio;
      if (!currentAudio) return;
      e.preventDefault();
      const direction = e.code === 'ArrowRight' ? 1 : -1;
      const skipAmount = e.shiftKey ? PLAYBACK_CONFIG.skipLarge : PLAYBACK_CONFIG.skipSmall;
      let newTime = currentAudio.currentTime + direction * skipAmount;
      if (newTime < 0) newTime = 0;
      if (currentAudio.duration && newTime > currentAudio.duration) newTime = currentAudio.duration;
      currentAudio.currentTime = newTime;
      break;
    }
    default:
      break;
  }
});

/**
 * Handles anchor clicks for smooth scrolling
 * @param {Event} event - Click event
 */
const handleAnchorClick = (event) => {
  const targetId = event.currentTarget.getAttribute('href').substring(1);
  const targetElement = document.getElementById(targetId);
  if (targetElement) {
    event.preventDefault();
    history.pushState({}, '', `#${targetId}`);
    scrollToCenterElement(targetElement);
  }
};

/* Keep centered on browser navigation through hash changes */
window.addEventListener('popstate', () => {
  const id = (window.location.hash || '').slice(1);
  if (!id) return;
  const el = document.getElementById(id);
  if (el) scrollToCenterElement(el);
});

/* ============================================================================
  Initialization and lifecycle
============================================================================ */

// Build all track elements from musicData and attach to the DOM
musicData.forEach((trackData, i) => {
  const trackObj = createTrackElement(trackData, i);
  playerState.tracks.push(trackObj);
  domElements.tracklistDiv.appendChild(trackObj.container);
});

// Anchor click binding for centered scroll behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', handleAnchorClick);
});

// Align initial hash and center the corresponding element (default to first track)
window.addEventListener('load', function () {
  let hash = window.location.hash;
  if (!hash && playerState.tracks.length > 0) {
    const firstTrackId = playerState.tracks[0].container.id;
    hash = `#${firstTrackId}`;
    history.pushState({}, '', hash);
  }

  if (hash) {
    const elementId = hash.substring(1);
    const element = document.getElementById(elementId);
    if (element) {
      scrollToCenterElement(element);
    }
  }

  // Global icons and controls initial state
  domElements.playBtn.innerHTML = ICONS.play;
  updateMuteButton();
  domElements.prevBtn.innerHTML = ICONS.prev;
  domElements.nextBtn.innerHTML = ICONS.next;

  // Volume initial state
  updateVolumeBar(1);
  updateVolumePercent(1);
});

// Pause all audio on page unload
window.addEventListener('pagehide', () => {
  playerState.tracks.forEach(({ audio }) => {
    audio?.pause();
  });
});
