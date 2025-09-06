/* ============================================================================
  Global constants, configuration, and reusable helpers
============================================================================ */

/* SVG icon markup placeholders (inline SVG or strings) */
const playSVG = `<svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><polygon points="6 4 20 12 6 20" /></svg>`;
const pauseSVG = `<svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const prevSVG = `<svg class="prev-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
const nextSVG = `<svg class="next-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
const muteSVG = `<svg class="unmute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><path d="M16.5 7.5a5 5 0 0 1 0 9"></path></svg>`;
const unmuteSVG = `<svg class="mute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><line x1="18" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="18" y2="15"></line></svg>`;

/* Sizing and interaction constants */
const BAR_WIDTH = 2;                 // Width of each waveform bar in pixels
const SPACE_WIDTH = 1;               // Space between bars in pixels
const WAVE_PEAK_UNIT = BAR_WIDTH + SPACE_WIDTH; // Total pixels per peak (bar + space)
const WAVE_HEIGHT = 110;             // Canvas height for waveform visualization
const SKIP_SMALL = 10;               // Arrow keys seek step in seconds
const SKIP_LARGE = 60;               // Shift + Arrow keys seek step in seconds
const VOLUME_STEP = 0.05;            // Mouse wheel volume step
const RESIZE_DEBOUNCE_MS = 100;      // Debounce delay for resize-driven re-render

/* Formatting helpers */
const formatTime = (seconds, showHours = false) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (showHours || h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  } else {
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
};

/* Numeric helpers */
const clamp01 = v => Math.min(Math.max(v, 0), 1);

/* ID slugging for anchors and element IDs */
function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // replace non-alphanumerics with dashes
    .replace(/^-+|-+$/g, '')       // trim leading/trailing dashes
    .replace(/-{2,}/g, '-');       // collapse multiple dashes
}

/* CSS variable fetch consolidated to limit layout/style work per draw */
function getThemeVars() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return {
    highlightMuted: cs.getPropertyValue('--highlight-muted').trim(),
    highlightAlt: cs.getPropertyValue('--highlight-alt').trim(),
    textColorMuted: cs.getPropertyValue('--text-color-muted').trim()
  };
}

/* ============================================================================
  Waveform rendering and data interpolation
============================================================================ */

/**
 * Renders a bar waveform to a canvas 2D context.
 * Colors are resolved once per call and reused for all bars.
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
    const x = i * WAVE_PEAK_UNIT;

    let fillStyle;
    if (isHovering && i === hoverIndex) {
      fillStyle = colors.highlightAlt;
    } else if (progress > 0 && i / total <= progress) {
      fillStyle = colors.highlightMuted;
    } else {
      fillStyle = colors.textColorMuted;
    }

    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, midY - barHeight / 2, BAR_WIDTH, barHeight);
  }
}

/**
 * Interpolates amplitude data to a target length using linear interpolation.
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

let tracks = [];              // Array of track objects with references and helpers
let playingIndex = -1;        // Index of currently playing track, -1 if none
let isMuted = false;          // Global mute toggle
let prevVolume = 1;           // Last non-zero volume (for unmute restore)

const footerPlayBtn = document.querySelector('#btn-play-pause');
const footerPrevBtn = document.querySelector('#btn-prev');
const footerNextBtn = document.querySelector('#btn-next');
const footerMuteBtn = document.querySelector('#btn-mute');
const footerVolumeInput = document.querySelector('#volume-slider');
const volumePercentSpan = document.querySelector('#volume-percent');

/* Footer UI helpers */
const updateVolumeBar = (volume) => {
	const perc = Math.round(volume * 100);
	footerVolumeInput.style.setProperty('--vol-percent', `${perc}%`);
};

const updateVolumePercent = (volume) => {
	const percent = Math.round(volume * 100);
	volumePercentSpan.textContent = `${percent}%`;
};

const updateMuteButton = () => {
	footerMuteBtn.innerHTML = isMuted ? unmuteSVG : muteSVG;
};

/**
 * Synchronizes footer controls with an active track. Links the footer
 * play button to the specific audio/button so that footer actions resolve
 * to the correct track without rediscovery.
 */
function updateFooter(audio, playBtn, idx) {
  if ((audio || playBtn) && Number.isInteger(idx) && tracks[idx]) {
    if (!audio) audio = tracks[idx].audio;
    if (!playBtn) playBtn = tracks[idx].btnPlay;
  }

  if (audio || playBtn) {
    const paused = audio ? audio.paused : playBtn.innerHTML === playSVG;
    footerPlayBtn.innerHTML = paused ? playSVG : pauseSVG;
    footerPlayBtn.disabled = false;
    footerPlayBtn._linkedAudio = audio || null;
    footerPlayBtn._linkedPlayBtn = playBtn || null;
    footerPlayBtn._linkedIndex = Number.isInteger(idx) ? idx : -1;

    if (audio) {
      footerVolumeInput.value = audio.volume;
      updateVolumeBar(audio.volume);
      updateVolumePercent(audio.volume);
    } else {
      updateVolumeBar(1);
      updateVolumePercent(1);
    }
  } else {
    footerPlayBtn.innerHTML = playSVG;
    footerPlayBtn.disabled = true;
    footerPlayBtn._linkedAudio = null;
    footerPlayBtn._linkedPlayBtn = null;
    footerPlayBtn._linkedIndex = -1;
    updateVolumeBar(1);
    updateVolumePercent(1);
  }
}

/* Scrolls the given element into vertical center of the viewport */
function scrollToCenterElement(element) {
  const bounding = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const scrollToY = window.scrollY + bounding.top - (viewportHeight / 2) + (bounding.height / 2);

  window.scrollTo({
    top: scrollToY,
    behavior: 'smooth'
  });
}

/* Plays audio with promise handling. Returns true on success, false on block. */
async function safePlay(audio) {
  try {
    await audio.play();
    return true;
  } catch (err) {
    // Autoplay may be blocked if not triggered by a user gesture.
    // A subsequent user interaction should enable playback.
    console && console.warn && console.warn('Playback requires a user interaction to start.');
    return false;
  }
}

/* Updates Media Session metadata for a given track index */
function updateMediaSession(idx) {
  if (!('mediaSession' in navigator)) return;
  const t = tracks[idx];
  if (!t) return;

  const artist = t.container.querySelector('.track-artist')?.textContent || '';
  const title  = t.container.querySelector('.track-title')?.textContent || '';
  const imgEl  = t.container.querySelector('.track-cover');
  const artworkSrc = imgEl?.src || '';

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: '',
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: '340x340', type: 'image/png' }] : []
    });
  } catch {}
}

/* ============================================================================
  Core playback and navigation
============================================================================ */

/**
 * Centralized play/pause/resume toggle. 
 * Resolves a target track if the global footer control is not yet linked, 
 * then toggles that track and keeps UI/state in sync.
 */
async function togglePlay(direction) {
  let audio, playBtn;
  let idx = Number.isInteger(footerPlayBtn._linkedIndex) ? footerPlayBtn._linkedIndex : -1;

  // Determine index
  if (!audio) {
    if (playingIndex !== -1) {
      idx = playingIndex;
    } else {
      const hashId = (window.location.hash || '').slice(1);
      idx = tracks.findIndex(t => t.container.id === hashId);
      if (idx < 0) idx = 0;
    }
  }

  // Handle prev/next logic
  if (direction === -1) { // Previous
    if (idx > 0) idx -= 1;
    else return; // no previous
  } else if (direction === +1) { // Next
    if (idx < tracks.length - 1) idx += 1;
    else return; // no next
  }

  const target = tracks[idx];
  if (!target) return;
  audio = target.audio;
  playBtn = target.btnPlay;
  updateFooter(audio, playBtn, idx);

  // Always reset position to start for prev/next
  if (direction !== undefined) audio.currentTime = 0;

  const wasPaused = audio.paused;
  // Pause others & reset their play btn
  tracks.forEach(({ audio: a, btnPlay: b }) => {
    if (a && a !== audio) {
      a.pause();
      if (b) {
        b.innerHTML = playSVG;
        b.setAttribute('aria-pressed', 'false');
      }
    }
  });

  if (wasPaused || direction !== undefined) {
    const ok = await safePlay(audio);
    if (!ok) return;
    if (playBtn) {
      playBtn.innerHTML = pauseSVG;
      playBtn.setAttribute('aria-pressed', 'true');
    }
    footerPlayBtn.innerHTML = pauseSVG;
    playingIndex = idx;
    // Sync hash & scroll to active track
    const id = tracks[playingIndex]?.container?.id;
    if (id && window.location.hash.slice(1) !== id) {
      history.pushState({}, '', `#${id}`);
    }
    if (tracks[playingIndex]?.container) {
      scrollToCenterElement(tracks[playingIndex].container);
    }
    updateMediaSession(playingIndex);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  } else {
    audio.pause();
    if (playBtn) {
      playBtn.innerHTML = playSVG;
      playBtn.setAttribute('aria-pressed', 'false');
    }
    footerPlayBtn.innerHTML = playSVG;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

/* ============================================================================
  Track element creation and per-track interaction wiring
============================================================================ */

/**
 * Creates a track block, waveform, audio element, and attaches all behaviors.
 * Returns an object with references needed by global controls.
 */
function createTrackElement(data, idx) {
  // Data shape:
  // [ filename, artist, title, date, genre, durationSec, detailsHTML, coverBase64, ampJSON, hash ]
  const fileName = data[0];
  const artist = data[1];
  const title = data[2];
  const dateStr = data[3];
  const genre = data[4];
  const nominalDuration = data[5];
  const detailsHTML = data[6];
  const coverBase64 = data[7];
  const ampDataRaw = JSON.parse(data[8]);

  const trackElem = document.createElement('div');
  trackElem.className = 'track-item content';
  trackElem.id = slugify(fileName);

  // Cover section with anchor for centered scrolling
  const coverContainer = document.createElement('div');
  coverContainer.className = 'track-cover-container';

  const coverLink = document.createElement('a');
  coverLink.href = `#${trackElem.id}`;
  coverLink.className = 'track-cover-link';

  const coverImg = document.createElement('img');
  coverImg.alt = `${title} cover art`;
  coverImg.className = 'track-cover';
  coverImg.src = `data:image/png;base64,${coverBase64}`;

  coverLink.appendChild(coverImg);
  coverContainer.appendChild(coverLink);

  // Info and waveform column wrapper
  const infoWaveContainer = document.createElement('div');
  infoWaveContainer.className = 'track-info-wave-container';

  // Info row
  const infoContainer = document.createElement('div');
  infoContainer.className = 'track-info-container';

  // Play button
  const playBtnContainer = document.createElement('div');
  playBtnContainer.className = 'play-btn-container';

  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'playback-button btn-play-pause';
  playPauseBtn.setAttribute('aria-label', `Play or Pause ${title} by ${artist}`);
  playPauseBtn.setAttribute('aria-pressed', 'false');
  playPauseBtn.innerHTML = playSVG;

  playBtnContainer.appendChild(playPauseBtn);

  // Artist & Title
  const artistTitleContainer = document.createElement('div');
  artistTitleContainer.className = 'artist-title-container';

  const artistDiv = document.createElement('div');
  artistDiv.className = 'track-artist';
  artistDiv.textContent = artist;

  const titleDiv = document.createElement('div');
  titleDiv.className = 'track-title';
  titleDiv.textContent = title;

  artistTitleContainer.appendChild(artistDiv);
  artistTitleContainer.appendChild(titleDiv);

  // Meta (genre, date, times)
  const metaContainer = document.createElement('div');
  metaContainer.className = 'meta-info-container';

  const genreDateRow = document.createElement('div');
  genreDateRow.className = 'genre-date-row';

  const genreDiv = document.createElement('div');
  genreDiv.className = 'track-genre';
  genreDiv.textContent = genre;

  const dateDiv = document.createElement('div');
  dateDiv.className = 'track-date';
  dateDiv.textContent = dateStr;

  genreDateRow.appendChild(genreDiv);
  genreDateRow.appendChild(dateDiv);

  const timeRow = document.createElement('div');
  timeRow.className = 'time-row';

  const playPosDiv = document.createElement('div');
  playPosDiv.className = 'play-pos';
  playPosDiv.textContent = '0:00';

  const sepDiv = document.createElement('div');
  sepDiv.className = 'separator';
  sepDiv.textContent = '|';

  const durDiv = document.createElement('div');
  durDiv.className = 'duration';
  durDiv.textContent = formatTime(nominalDuration);

  timeRow.appendChild(playPosDiv);
  timeRow.appendChild(sepDiv);
  timeRow.appendChild(durDiv);

  metaContainer.appendChild(genreDateRow);
  metaContainer.appendChild(timeRow);

  infoContainer.appendChild(playBtnContainer);
  infoContainer.appendChild(artistTitleContainer);
  infoContainer.appendChild(metaContainer);

  // Waveform canvas
  const waveformContainer = document.createElement('div');
  waveformContainer.className = 'waveform-container';

  const waveformCanvas = document.createElement('canvas');
  waveformCanvas.className = 'waveform-canvas';
  waveformCanvas.height = WAVE_HEIGHT;
  waveformContainer.appendChild(waveformCanvas);

  infoWaveContainer.appendChild(infoContainer);
  infoWaveContainer.appendChild(waveformContainer);

  // Details (tracklist, notes)
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'details-container';

  if (detailsHTML != null && String(detailsHTML).trim() !== '') {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-toggle-details';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = 'Details';

    const detailsContent = document.createElement('div');
    detailsContent.className = 'details-content';
    detailsContent.innerHTML = detailsHTML;

    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      detailsContent.classList.toggle('visible');
    });

    detailsContainer.appendChild(toggleBtn);
    detailsContainer.appendChild(detailsContent);
  }

  trackElem.appendChild(coverContainer);
  trackElem.appendChild(infoWaveContainer);
  if (detailsContainer.childNodes.length > 0) {
    trackElem.appendChild(detailsContainer);
  }

  // Hidden audio element
  const audioElement = document.createElement('audio');
  audioElement.src = `music/${fileName}`;
  audioElement.preload = 'metadata';
  audioElement.style.display = 'none';
  audioElement.controls = false;
  trackElem.appendChild(audioElement);

  /* Waveform drawing context and amplitude preparation */
  const ctx = waveformCanvas.getContext('2d');
  const themeCache = getThemeVars();
  const durationFallback = nominalDuration;

  let currentCanvasWidth = 0;
  let ampData = [];

  const updateCanvasWidthAndDraw = () => {
    let containerWidth = waveformContainer.offsetWidth || 0;

    // Ensure width is divisible by peak unit for a perfect grid
    for (let reduction = 0; reduction <= (WAVE_PEAK_UNIT - 1); reduction++) {
      const testWidth = containerWidth - reduction;
      if (testWidth % WAVE_PEAK_UNIT === 0) {
        containerWidth = testWidth;
        break;
      }
    }

    waveformCanvas.width = containerWidth;
    currentCanvasWidth = containerWidth;

    const numPeaks = containerWidth > 0 ? Math.floor(containerWidth / WAVE_PEAK_UNIT) : 0;
    ampData = interpolateAmplitudeData(ampDataRaw, Math.max(numPeaks, 0));

    drawWaveform(ctx, ampData, 0, waveformCanvas.width, WAVE_HEIGHT, -1, false, themeCache);
  };

  updateCanvasWidthAndDraw();

  /* End-of-track handler: reset and advance */
  audioElement.addEventListener('ended', () => { footerNextBtn.click(); });

  /* Align the URL anchor with the active track when playback begins */
  audioElement.addEventListener('play', () => {
    const trackId = trackElem.id;
    const currentHash = window.location.hash.substring(1);
    if (currentHash !== trackId) {
      history.pushState({}, '', `#${trackId}`);
    }
  });

  /* Track-level play/pause control */
  playPauseBtn.addEventListener('click', async () => {
    if (audioElement.paused) {
      // Pause other tracks
      tracks.forEach(({ audio, btnPlay }, i) => {
        if (i !== idx) {
          audio?.pause();
          btnPlay.innerHTML = playSVG;
          btnPlay.setAttribute('aria-pressed', 'false');
        }
      });

      const ok = await safePlay(audioElement);
      if (!ok) return;

      playPauseBtn.innerHTML = pauseSVG;
      playPauseBtn.setAttribute('aria-pressed', 'true');
      playingIndex = idx;
      updateFooter(audioElement, playPauseBtn, idx);

      // Center the active track in the viewport
      scrollToCenterElement(trackElem);

      // Media session metadata/state
      updateMediaSession(idx);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else {
      audioElement.pause();
      playPauseBtn.innerHTML = playSVG;
      playPauseBtn.setAttribute('aria-pressed', 'false');
      if (playingIndex === idx) playingIndex = -1;
      updateFooter(null, null, -1);

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  });

  /* Unified pointer interactions for waveform hovering and seeking */
  let isHovering = false;
  let hoverIndex = -1;
  let isPointerDown = false;

  if (waveformCanvas && waveformCanvas.style) {
    waveformCanvas.style.touchAction = 'none';
  }

  function getDuration() {
    return audioElement.duration || durationFallback || 0;
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
      playPosDiv.classList.add('play-pos-wave-hover');
    } else {
      playPosDiv.classList.remove('play-pos-wave-hover');
    }
  }

  function renderWave({ progressRatio, hoverIdx = -1, showHover = false }) {
    drawWaveform(ctx, ampData, progressRatio, currentCanvasWidth, WAVE_HEIGHT, hoverIdx, showHover, themeCache);
  }

  function updateTimeDisplay(showHover, ratioForHover = null) {
    const dur = getDuration();
    const cur = audioElement.currentTime;
    const timeToShow = showHover && ratioForHover != null ? (ratioForHover * dur) : cur;
    playPosDiv.textContent = formatTime(timeToShow);
    durDiv.textContent = formatTime(dur);
    setHoverUI(showHover);
  }

  function getRatioFromClientX(clientX) {
    const rect = waveformCanvas.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }

  function getRatioFromEvent(ev) {
    return getRatioFromClientX(ev.clientX);
  }

  function getHoverIndexFromRatio(ratio) {
    if (!ampData || !ampData.length) return -1;
    const i = Math.floor(clamp01(ratio) * ampData.length);
    return Math.min(Math.max(i, 0), ampData.length - 1);
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
      playPosDiv.textContent = formatTime(cur);
      durDiv.textContent = formatTime(dur);
    }
  });

  function onPointerDown(ev) {
    ev.preventDefault();
    isPointerDown = true;
    isHovering = true;
    try {
      waveformCanvas.setPointerCapture(ev.pointerId);
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
      waveformCanvas.releasePointerCapture(ev.pointerId);
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

  waveformCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  waveformCanvas.addEventListener('pointermove', onPointerMove, { passive: false });
  waveformCanvas.addEventListener('pointerup', onPointerUp);
  waveformCanvas.addEventListener('pointerleave', onPointerLeave);
  waveformCanvas.addEventListener('pointercancel', onPointerCancel);

  // Debounced resize handling
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateCanvasWidthAndDraw();
      if (!audioElement.paused) {
        const curDur = audioElement.duration || durationFallback;
        const prog = curDur ? audioElement.currentTime / curDur : 0;
        drawWaveform(ctx, ampData, prog, currentCanvasWidth, WAVE_HEIGHT, -1, false, themeCache);
      }
    }, RESIZE_DEBOUNCE_MS);
  });
  resizeObserver.observe(waveformContainer);

  return {
    container: trackElem,
    audio: audioElement,
    btnPlay: playPauseBtn,
    timeDisplay: timeRow,
    canvasCtx: ctx,
    updateCanvasWidthAndDraw
  };
}

/* ============================================================================
  Global footer controls, keyboard, media keys, and navigation
============================================================================ */

/* Volume slider: propagate to all tracks, update UI and mute state */
footerVolumeInput.addEventListener('input', e => {
	const vol = parseFloat(e.target.value);
	tracks.forEach(({ audio }) => {
		if (audio) audio.volume = vol;
	});
	updateVolumeBar(vol);
	updateVolumePercent(vol);

	// Update mute button state when volume reaches 0 or non-zero
	if (vol === 0) {
		isMuted = true;
		prevVolume = 0.05; // Set prevVolume to 0.05 when volume reaches 0
	} else if (isMuted) {
		isMuted = false;
		prevVolume = vol; // Update prevVolume to current volume
	}
	updateMuteButton();
});

/* Volume slider mouse wheel adjustment */
footerVolumeInput.addEventListener('wheel', e => {
	e.preventDefault();
	const delta = e.deltaY || e.detail || e.wheelDelta;
	const step = 0.05;
	let vol = parseFloat(footerVolumeInput.value);
	vol += delta < 0 ? step : -step;
	vol = Math.min(1, Math.max(0, vol));
	footerVolumeInput.value = vol;
	tracks.forEach(({ audio }) => {
		if (audio) audio.volume = vol;
	});
	updateVolumeBar(vol);
	updateVolumePercent(vol);

	// Update mute button state when volume reaches 0 or non-zero
	if (vol === 0) {
		isMuted = true;
		prevVolume = 0.05; // Set prevVolume to 0.05 when volume reaches 0
	} else if (isMuted) {
		isMuted = false;
		prevVolume = vol; // Update prevVolume to current volume
	}
	updateMuteButton();
}, { passive: false });

/* Footer mute */
footerMuteBtn.addEventListener('click', () => {
	isMuted = !isMuted;
	updateMuteButton();

	const currentVolume = parseFloat(footerVolumeInput.value);

	if (isMuted) {
		// Save the current volume from the slider
		prevVolume = (currentVolume === 0 ? 0.05 : currentVolume);

		// Mute all tracks regardless of playback state
		tracks.forEach(({ audio }) => {
			if (audio) audio.volume = 0;
		});
	} else {
		// Unmute all tracks using the volume from the slider
		tracks.forEach(({ audio }) => {
			if (audio) audio.volume = prevVolume;
		});
	}

	updateVolumeBar(isMuted ? 0 : prevVolume);
	updateVolumePercent(isMuted ? 0 : prevVolume);
	// Also update the volume slider value to reflect mute state
	footerVolumeInput.value = isMuted ? 0 : prevVolume;
});

/* Footer play/pause */
footerPlayBtn.addEventListener('click', () => { void togglePlay(); });

/* Footer previous */
footerPrevBtn.addEventListener('click', () => { void togglePlay(-1); });

/* Footer next */
footerNextBtn.addEventListener('click', () => { void togglePlay(+1); });

/* Keyboard shortcuts: Space (toggle), Up/Down (prev/next), M/Numpad0 (mute), Left/Right (seek) */
window.addEventListener('keydown', e => {
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      void toggleFooterPlay();
      break;
    case 'ArrowDown':
      if (playingIndex === -1) return;
      e.preventDefault();
      void playNextTrack(playingIndex);
      break;
    case 'ArrowUp':
      if (playingIndex === -1) return;
      e.preventDefault();
      void playNextTrack(playingIndex - 2);
      break;
    case 'KeyM':
    case 'Numpad0':
      e.preventDefault();
      footerMuteBtn.click();
      break;
    case 'ArrowRight':
    case 'ArrowLeft': {
      if (playingIndex === -1) return;
      const currentAudio = tracks[playingIndex]?.audio;
      if (!currentAudio) return;
      e.preventDefault();
      const direction = e.code === 'ArrowRight' ? 1 : -1;
      const skipAmount = e.shiftKey ? SKIP_LARGE : SKIP_SMALL;
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

/* Media Session hardware key handlers (if available) */
if ('mediaSession' in navigator) {
  const mediaSession = navigator.mediaSession;
  mediaSession.setActionHandler('play', () => { void toggleFooterPlay(); });
  mediaSession.setActionHandler('pause', () => { void toggleFooterPlay(); });
  mediaSession.setActionHandler('previoustrack', () => {
    if (playingIndex !== -1) footerPrevBtn.click();
  });
  mediaSession.setActionHandler('nexttrack', () => {
    if (playingIndex !== -1) footerNextBtn.click();
  });
}

/* Anchors: intercept clicks to center elements and push hash */
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

const playlistRoot = document.getElementById('playlist-container');

// Build all track elements from musicData and attach to the DOM
musicData.forEach((trackData, i) => {
  const trackObj = createTrackElement(trackData, i);
  tracks.push(trackObj);
  playlistRoot.appendChild(trackObj.container);
});

// Anchor click binding for centered scroll behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', handleAnchorClick);
});

// Align initial hash and center the corresponding element (default to first track)
window.addEventListener('load', function () {
  let hash = window.location.hash;
  if (!hash && tracks.length > 0) {
    const firstTrackId = tracks[0].container.id;
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

  // Footer icons and controls initial state
  footerPlayBtn.innerHTML = playSVG;
  updateMuteButton();
  footerPrevBtn.innerHTML = prevSVG;
  footerNextBtn.innerHTML = nextSVG;

  // Volume initial state
  updateVolumeBar(1);
  updateVolumePercent(1);
});

// Pause all audio on page unload
window.addEventListener('pagehide', () => {
  tracks.forEach(({ audio }) => {
    audio?.pause();
  });
});
