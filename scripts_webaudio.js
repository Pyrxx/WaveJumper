/* ========= Global Constants & SVG Icons ========= */
/* Basic inline SVGs with CSS-driven colors and sizes; class names match CSS selectors so the UI visuals remain identical. [12] */

const playSVG = `<svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><polygon points="6 4 20 12 6 20" /></svg>`;
const pauseSVG = `<svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const prevSVG = `<svg class="prev-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
const nextSVG = `<svg class="next-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
const muteSVG = `<svg class="unmute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><path d="M16.5 7.5a5 5 0 0 1 0 9"></path></svg>`;
const unmuteSVG = `<svg class="mute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><line x1="18" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="18" y2="15"></line></svg>`;

/* ========= Protocol Detection ========= */
/* Use Web Audio API on HTTP/HTTPS; keep HTMLAudioElement for file:// to avoid CORS and autoplay restrictions typical for local files. [10][12] */
const isHttp = location.protocol === 'http:' || location.protocol === 'https:'; /* Checks protocol to select audio engine. [10] */

/* ========= Accessibility & UX ========= */
/**
 * Formats seconds to mm:ss string.
 * Returns '0:00' if input falsy. [12]
 */
const formatTime = (seconds) => {
  if (!seconds) return '0:00'; /* Guard against NaN and undefined for stable UI text. [12] */
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/* ========= Waveform Drawing ========= */
/**
 * Draws waveform bars on a given 2D canvas context.
 * Colors differ by play progress and hover state. [12]
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
 * @param {Array<number>} ampData - normalized amplitude array (0..1).
 * @param {number} progress - fraction played (0..1).
 * @param {number} width - canvas width.
 * @param {number} height - canvas height.
 * @param {number} [hoverIndex=-1] - waveform bar index hovered (-1 if none).
 * @param {boolean} [isHovering=false] - whether mouse is currently hovering.
 */
const drawWaveform = (ctx, ampData, progress, width, height, hoverIndex = -1, isHovering = false) => {
  ctx.clearRect(0, 0, width, height); /* Clear before redraw for a clean visualization. [12] */
  const midY = height / 2;
  const total = ampData.length;
  const barWidth = 2;
  const spaceWidth = 1;

  for (let i = 0; i < total; i++) {
    const amp = ampData[i];
    const barHeight = amp * height;
    const x = i * (barWidth + spaceWidth);

    let fillStyle;
    if (isHovering && i === hoverIndex) {
      fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--highlight-alt').trim(); /* Hover color uses CSS var to match theme. [12] */
    } else if (progress > 0 && i / total <= progress) {
      fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--highlight-muted').trim(); /* Played portion uses highlight for clarity. [12] */
    } else {
      fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-color-muted').trim(); /* Unplayed portion uses muted color. [12] */
    }

    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, midY - barHeight / 2, barWidth, barHeight);
  }
};

/**
 * Interpolates input amplitude data array to fit desired length.
 * Linear interpolation ensures even distribution across canvas bars. [12]
 * @param {Array<number>} inputData - original amplitude array (length N)
 * @param {number} targetLength - desired length for output data
 * @returns {Array<number>} - interpolated amplitude data
 */
const interpolateAmplitudeData = (inputData, targetLength) => {
  const output = [];
  const inputLength = inputData.length;
  if (targetLength <= 1) {
    return inputData.length ? [inputData] : [] ; /* Edge handling keeps rendering stable. [12] */
  }
  for (let i = 0; i < targetLength; i++) {
    const pos = i * (inputLength - 1) / (targetLength - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const v1 = inputData[idx] || 0;
    const v2 = inputData[Math.min(idx + 1, inputLength - 1)] || 0;
    output[i] = v1 + frac * (v2 - v1);
  }
  return output;
};

/* ========= Audio Engine Abstraction ========= */
/* Provide a small adapter interface so the rest of the UI works with either HTMLAudioElement (file://) or Web Audio API (http/https). [12] */
/* Interface expectations in code below:
   - addEventListener(type, handler)
   - removeEventListener(type, handler)
   - play(), pause()
   - get paused, get/set currentTime, get duration, get/set volume
   - fires 'timeupdate' periodically while playing, 'ended' when finished, 'loadedmetadata' when duration is ready. [12] */

/* Shared AudioContext manager for Web Audio mode (one context across tracks). [12][10] */
const AudioContextManager = (() => {
  let ctx = null;
  return {
    getContext() {
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctor();
      }
      return ctx;
    },
    async ensureRunning() {
      const ac = AudioContextManager.getContext();
      if (ac.state === 'suspended') {
        // Must be resumed from a user gesture in modern browsers due to autoplay policies. [10][12]
        await ac.resume();
      }
      return ac;
    }
  };
})();

/* Web Audio adapter: fetches, decodes, and plays via AudioBufferSourceNode; recreates node for each play/seek as sources are one-shot. [9][6] */
class WebAudioAdapter {
  constructor(url, fallbackDuration = 0) {
    this.url = url;
    this._buffer = null;
    this._source = null;
    this._gain = AudioContextManager.getContext().createGain();
    this._gain.connect(AudioContextManager.getContext().destination);

    this._volume = 1;
    this._gain.gain.value = this._volume;

    this._isPlaying = false;
    this._startTime = 0; // AudioContext.currentTime when started. [12]
    this._offset = 0;    // Seconds offset into buffer for resume/seek. [12]
    this._fallbackDuration = fallbackDuration || 0;

    this._events = new Map();
    this._rafId = null; // For timeupdate loop. [12]
    this._loadedMetadataFired = false;
  }

  /* Event management mimics HTMLMediaElement's addEventListener/removeEventListener. [12] */
  addEventListener(type, handler) {
    if (!this._events.has(type)) this._events.set(type, new Set());
    this._events.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    if (this._events.has(type)) this._events.get(type).delete(handler);
  }
  _dispatch(type) {
    const set = this._events.get(type);
    if (!set) return;
    set.forEach(fn => {
      try { fn(); } catch (e) { /* noop */ }
    });
  }

  /* Lazy fetch and decode on first play/seek; decodeAudioData is asynchronous. [9] */
  async _ensureBuffer() {
    if (this._buffer) return;
    const ac = AudioContextManager.getContext();
    const res = await fetch(this.url);
    const arrayBuf = await res.arrayBuffer();
    this._buffer = await ac.decodeAudioData(arrayBuf); /* Decoded PCM data into an AudioBuffer for playback. [9] */
    if (!this._loadedMetadataFired) {
      this._loadedMetadataFired = true;
      this._dispatch('loadedmetadata');
    }
  }

  /* Create a new one-shot source node and connect graph: source -> gain -> destination. [6][12] */
  _createSource(startOffset = 0) {
    if (!this._buffer) return;
    const ac = AudioContextManager.getContext();
    const src = ac.createBufferSource();
    src.buffer = this._buffer;
    src.connect(this._gain);
    src.onended = () => {
      // If ended naturally (not paused), set state and fire 'ended'.
      if (this._isPlaying) {
        this._isPlaying = false;
        this._offset = this.duration; // Snap to end. [12]
        this._stopTimeupdateLoop();
        this._dispatch('ended');
      }
    };
    this._source = src;
    this._startTime = ac.currentTime;
    this._offset = startOffset;
  }

  /* Animation frame loop to emulate 'timeupdate' while playing. [12] */
  _startTimeupdateLoop() {
    const tick = () => {
      this._dispatch('timeupdate');
      if (this._isPlaying) {
        this._rafId = requestAnimationFrame(tick);
      } else {
        this._rafId = null;
      }
    };
    if (!this._rafId) this._rafId = requestAnimationFrame(tick);
  }
  _stopTimeupdateLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  async play() {
    await AudioContextManager.ensureRunning(); /* Resume context on first user gesture to satisfy autoplay policy. [10][12] */
    await this._ensureBuffer(); /* Ensure we have decoded data before playback starts. [9] */
    if (this._isPlaying) return;
    this._createSource(this._offset);
    const ac = AudioContextManager.getContext();
    const remaining = Math.max(0, this.duration - this._offset);
    try {
      this._source.start(0, this._offset, remaining); /* Start from offset for accurate resume/seek. [6] */
    } catch (e) {
      // If start throws (e.g., invalid state), bail gracefully.
      return;
    }
    this._isPlaying = true;
    this._startTimeupdateLoop();
  }

  pause() {
    if (!this._isPlaying) return;
    const ac = AudioContextManager.getContext();
    // Update offset by elapsed time since start.
    this._offset = Math.min(this.duration, this._offset + (ac.currentTime - this._startTime)); /* Accumulate played time for resume. [12] */
    try {
      this._source?.stop(0); /* Stop current source; sources are one-shot and must be recreated later. [6] */
    } catch (e) { /* noop */ }
    this._isPlaying = false;
    this._stopTimeupdateLoop();
    this._source = null;
  }

  get paused() {
    return !this._isPlaying; /* Matches HTMLMediaElement.paused semantics for uniform UI logic. [12] */
  }

  get currentTime() {
    if (!this._isPlaying) return this._offset; /* When paused, time is stored offset. [12] */
    const ac = AudioContextManager.getContext();
    return Math.min(this.duration, this._offset + (ac.currentTime - this._startTime)); /* Compute current time relative to start. [12] */
  }
  set currentTime(t) {
    const clamped = Math.max(0, Math.min(this.duration, Number(t) || 0));
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.pause(); /* Pause and recreate source at new position, since nodes are one-shot. [6] */
    this._offset = clamped;
    if (wasPlaying) this.play();
    this._dispatch('timeupdate'); /* Keep UI in sync after seek. [12] */
  }

  get duration() {
    return this._buffer ? this._buffer.duration : (this._fallbackDuration || 0); /* Use decoded duration when available; fallback to metadata otherwise. [9] */
  }

  get volume() {
    return this._volume; /* Mirror gain value to keep slider state consistent. [12] */
  }
  set volume(v) {
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this._volume = val;
    this._gain.gain.value = val; /* Apply volume via GainNode to match per-track control. [12] */
  }
}

/* HTMLAudio adapter: thin wrapper around HTMLAudioElement to share the same interface. [12] */
class HTMLAudioAdapter {
  constructor(audioEl) {
    this.el = audioEl;
  }
  addEventListener(type, handler) { this.el.addEventListener(type, handler); } /* Delegate DOM events to preserve existing logic. [12] */
  removeEventListener(type, handler) { this.el.removeEventListener(type, handler); }
  play() { return this.el.play(); } /* HTMLMediaElement play() returns a Promise; UI can ignore it. [12] */
  pause() { return this.el.pause(); }
  get paused() { return this.el.paused; }
  get currentTime() { return this.el.currentTime || 0; }
  set currentTime(v) { this.el.currentTime = Number(v) || 0; }
  get duration() { return isFinite(this.el.duration) ? this.el.duration : 0; }
  get volume() { return this.el.volume; }
  set volume(v) { this.el.volume = Math.max(0, Math.min(1, Number(v) || 0)); }
}

/* ========= UI Construction & Track Element Creation ========= */
/**
 * Creates and returns a track DOM element with all UI components,
 * sets up event listeners for playback and waveform interaction. [12]
 * @param {Array} trackData - musicData single track array.
 * @param {number} idx - track index in playlist.
 * @returns {object} track object containing references to components and audio functions.
 */
const createTrackElement = (trackData, idx) => {
  // Defensive: ensure the provided structure matches expected indexes and types per musicData "as is". [12]
  // Expected: =filename, [1]=artist, [2]=title, [3]=date, [4]=genre, [5]=duration(s number), [6]=details HTML string,
  // [7]=cover PNG base64, [8]=JSON stringified amplitude array, [9]=optional checksum string. [12]
  const filename = String(trackData[0] || ''); /* Ensure string to avoid ".replace is not a function" errors. [12] */
  const artist = String(trackData[1] || '');
  const title = String(trackData[2] || '');
  const date = String(trackData[3] || '');
  const genre = String(trackData[4] || '');
  const durationMeta = Number(trackData[5] || 0);
  const detailsHtml = trackData[6] != null ? String(trackData[6]) : '';
  const coverBase64 = String(trackData[7] || '');
  // Amplitude data is stored as a JSON string in the dataset; parse safely.
  let originalAmpData = [];
  try {
    const ampStr = trackData[8];
    originalAmpData = Array.isArray(ampStr) ? ampStr : JSON.parse(String(ampStr || '[]')); /* Parse stringified array; accept array if already parsed. [12] */
  } catch (e) {
    originalAmpData = []; /* On parse failure, draw empty waveform (UI remains consistent). [12] */
  }

  // Main wrapper
  const trackElem = document.createElement('div');
  trackElem.className = 'track-item content';

  // 1. Cover Art Container with direct link
  const coverContainer = document.createElement('div');
  coverContainer.className = 'track-cover-container';
  const coverLink = document.createElement('a');
  coverLink.href = `#${filename.replace(/ /g, '-')}`; /* Use filename-derived anchor ID to match original UX. [12] */
  coverLink.className = 'track-cover-link';
  const coverImg = document.createElement('img');
  coverImg.alt = `${title} cover art`;
  coverImg.className = 'track-cover';
  coverImg.src = `data:image/png;base64,${coverBase64}`;
  coverLink.appendChild(coverImg);
  coverContainer.appendChild(coverLink);

  // 2. Info Container (flex row with 3 sections)
  const infoContainer = document.createElement('div');
  infoContainer.className = 'track-info-container';

  // 2.1 Play / Pause Button Container
  const playBtnContainer = document.createElement('div');
  playBtnContainer.className = 'play-btn-container';
  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'button btn-play-pause';
  playPauseBtn.setAttribute('aria-label', `Play or Pause ${title} by ${artist}`);
  playPauseBtn.innerHTML = playSVG;
  playBtnContainer.appendChild(playPauseBtn);

  // 2.2 Artist & Title Container (stacked)
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

  // 2.3 Meta Info Container - Genre & Date + Time Row
  const metaContainer = document.createElement('div');
  metaContainer.className = 'meta-info-container';

  const genreDateRow = document.createElement('div');
  genreDateRow.className = 'genre-date-row';
  const genreDiv = document.createElement('div');
  genreDiv.className = 'track-genre';
  genreDiv.textContent = genre;
  const dateDiv = document.createElement('div');
  dateDiv.className = 'track-date';
  dateDiv.textContent = date;
  genreDateRow.appendChild(genreDiv);
  genreDateRow.appendChild(dateDiv);

  // Time Row: current play time | separator | duration
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
  durDiv.textContent = formatTime(durationMeta);
  timeRow.appendChild(playPosDiv);
  timeRow.appendChild(sepDiv);
  timeRow.appendChild(durDiv);

  metaContainer.appendChild(genreDateRow);
  metaContainer.appendChild(timeRow);

  // Append all 3 info subcontainers
  infoContainer.appendChild(playBtnContainer);
  infoContainer.appendChild(artistTitleContainer);
  infoContainer.appendChild(metaContainer);

  // 3. Waveform Container - canvas for visualization
  const waveformContainer = document.createElement('div');
  waveformContainer.className = 'waveform-container';
  const waveformCanvas = document.createElement('canvas');
  waveformCanvas.className = 'waveform-canvas';
  waveformCanvas.height = 110;
  waveformContainer.appendChild(waveformCanvas);

  // 4. Details Toggle Container - content from id3 comments, e.g. a tracklist
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'details-container';
  let toggleBtn = null;
  let detailsContent = null;
  if (detailsHtml.trim() !== '') {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-toggle-details';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = 'Details';
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      detailsContent.classList.toggle('visible');
    });
    detailsContent = document.createElement('div');
    detailsContent.className = 'details-content';
    detailsContent.innerHTML = detailsHtml;
    detailsContainer.appendChild(toggleBtn);
    detailsContainer.appendChild(detailsContent);
  }

  // Append all main containers into track item
  trackElem.appendChild(coverContainer);
  trackElem.appendChild(infoContainer);
  trackElem.appendChild(waveformContainer);
  if (detailsContainer.childNodes.length > 0) {
    trackElem.appendChild(detailsContainer);
  }

  // Set unique ID for track element based on filename
  trackElem.id = filename.replace(/ /g, '-');

  /* ========= Audio Streaming & Playback Control ========= */
  // Create audio backend based on protocol; HTMLAudioElement for file://, Web Audio for http/https. [10][12]
  let player;
  let htmlAudioEl = null;
  if (!isHttp) {
    // file:// fallback
    htmlAudioEl = document.createElement('audio');
    htmlAudioEl.src = `music/${filename}`;
    htmlAudioEl.preload = 'metadata';
    htmlAudioEl.style.display = 'none';
    htmlAudioEl.controls = false;
    trackElem.appendChild(htmlAudioEl);
    player = new HTMLAudioAdapter(htmlAudioEl); /* Wrap to unify interface across modes. [12] */
  } else {
    // http/https Web Audio
    player = new WebAudioAdapter(`music/${filename}`, durationMeta); /* Decode later on demand; duration falls back to metadata. [9] */
  }

  // Waveform drawing context and metadata
  const ctx = waveformCanvas.getContext('2d');
  const height = waveformCanvas.height;
  const durationFallback = durationMeta;

  // Variables to hold current canvas width and interpolated amp data
  let currentCanvasWidth = 0;
  let ampData = [];

  // Function to update canvas width, amp data interpolation, and draw waveform
  const updateCanvasWidthAndDraw = () => {
    // Get actual width of waveform container in pixels
    let containerWidth = waveformContainer.offsetWidth;
    // Reduce width by up to 2px to make it divisible by 3 (2px bar + 1px space)
    for (let reduction = 0; reduction <= 2; reduction++) {
      const testWidth = containerWidth - reduction;
      if (testWidth % 3 === 0) {
        containerWidth = testWidth;
        break;
      }
    }
    // Update the canvas width (height stays fixed)
    waveformCanvas.width = containerWidth;
    currentCanvasWidth = containerWidth;

    // Calculate number of peaks based on rule: 3px per peak
    const numPeaks = Math.max(1, Math.floor(containerWidth / 3));
    // Interpolate amplitude data to numPeaks length
    ampData = interpolateAmplitudeData(originalAmpData, numPeaks);
    // Draw initial waveform with zero progress
    drawWaveform(ctx, ampData, 0, waveformCanvas.width, height);
  };

  updateCanvasWidthAndDraw();

  /* ========= Playback Progress Updates & Waveform Interaction ========= */
  // State vars to handle waveform interaction
  let mouseHovering = false;
  let hoverIndex = -1;

  // Update waveform, time display as audio plays (unless hovering)
  const onTimeUpdate = () => {
    if (!mouseHovering) {
      const current = player.currentTime;
      // Prefer decoded duration when available, otherwise fallback to metadata
      const dur = player.duration || durationFallback;
      const prog = dur ? current / dur : 0;
      drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
      playPosDiv.textContent = formatTime(current);
      durDiv.textContent = formatTime(dur);
    }
  };

  player.addEventListener('timeupdate', onTimeUpdate);

  // On track end, reset UI and play next track
  player.addEventListener('ended', () => {
    playPauseBtn.innerHTML = playSVG;
    if (playingIndex === idx) {
      playingIndex = -1;
      updateFooter(null, null, -1);
      playNextTrack(idx);
    }
  });

  // Account for metadata when available (e.g., Web Audio decode completion)
  player.addEventListener('loadedmetadata', () => {
    // Update duration display once accurate duration is known
    const dur = player.duration || durationFallback;
    durDiv.textContent = formatTime(dur);
  });

  // Play/Pause button toggles playback state for this track
  playPauseBtn.addEventListener('click', async () => {
    if (player.paused) {
      // Pause all other track players
      tracks.forEach(({ audio, btnPlay }, i) => {
        if (i !== idx) {
          try { audio?.pause(); } catch (_) { /* noop */ }
          btnPlay.innerHTML = playSVG;
        }
      });
      await player.play();
      playPauseBtn.innerHTML = pauseSVG;
      playingIndex = idx;
      updateFooter(player, playPauseBtn, idx);
    } else {
      player.pause();
      playPauseBtn.innerHTML = playSVG;
      if (playingIndex === idx) playingIndex = -1;
      updateFooter(null, null, -1);
    }
  });

  // Clicking waveform seeks playback position
  waveformCanvas.addEventListener('click', e => {
    const rect = waveformCanvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const dur = player.duration || durationFallback;
    player.currentTime = ratio * dur;
    drawWaveform(ctx, ampData, ratio, currentCanvasWidth, height);
  });

  // Hovering waveform shows hover time, highlights bar
  waveformCanvas.addEventListener('mousemove', e => {
    mouseHovering = true;
    const rect = waveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    hoverIndex = Math.min(Math.max(Math.floor(ratio * ampData.length), 0), ampData.length - 1);
    const dur = player.duration || durationFallback;
    playPosDiv.textContent = formatTime(ratio * dur);
    durDiv.textContent = formatTime(dur);
    const prog = (player.currentTime || 0) / (dur || 1);
    drawWaveform(ctx, ampData, prog, currentCanvasWidth, height, hoverIndex, true);
  });

  // Leaving waveform resets to current playback time display & bar
  waveformCanvas.addEventListener('mouseleave', () => {
    mouseHovering = false;
    hoverIndex = -1;
    const dur = player.duration || durationFallback;
    const curTime = player.currentTime || 0;
    const prog = dur ? curTime / dur : 0;
    drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
    playPosDiv.textContent = formatTime(curTime);
    durDiv.textContent = formatTime(dur);
  });

  // Observe width changes of waveform container and update canvas accordingly
  const resizeObserver = new ResizeObserver(() => {
    updateCanvasWidthAndDraw();
    // After resizing, redraw the waveform progress if playing
    const curDur = player.duration || durationFallback;
    const prog = curDur ? (player.currentTime || 0) / curDur : 0;
    drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
  });
  resizeObserver.observe(waveformContainer);

  // Return track object with references & control functions
  return {
    container: trackElem,
    audio: player,              // unified audio interface for both modes
    btnPlay: playPauseBtn,
    timeDisplay: timeRow,
    canvasCtx: ctx,
    ampData,
    width: currentCanvasWidth,
    height,
    get currentTime() { return player.currentTime; },
    playAudioFn: () => player.play(),
    pauseAudioFn: () => player.pause(),
    updateCanvasWidthAndDraw
  };
};

/* ========= Global State Management & Playback Control ========= */
let tracks = [];
let playingIndex = -1;
let isMuted = false;
let prevVolume = 1;

// Select DOM elements
const footerPlayBtn = document.querySelector('#footer-controls .btn-play-pause');
const footerPrevBtn = document.querySelector('#footer-controls .btn-prev');
const footerNextBtn = document.querySelector('#footer-controls .btn-next');
const footerMuteBtn = document.querySelector('#footer-controls .btn-mute');
const footerVolumeInput = document.querySelector('#footer-controls input[type="range"]');
const volumePercentSpan = document.querySelector('#footer-controls #volume-percent');

/**
 * Updates the mute button icon based on current mute state. [12]
 */
const updateMuteButton = () => {
  footerMuteBtn.innerHTML = isMuted ? unmuteSVG : muteSVG;
};

/**
 * Updates the volume percentage display. [12]
 * @param {number} volume - Volume value between 0 and 1
 */
const updateVolumePercent = (volume) => {
  const percent = Math.round(volume * 100);
  if (volumePercentSpan) volumePercentSpan.textContent = `${percent}%`;
};

/**
 * Updates the global footer controls:
 * - Synchronizes play/pause icon and state
 * - Associates global controls with the active track
 * - Adjusts volume slider fill percentage. [12]
 * @param {object|null} audio - currently playing adapter or null if none.
 * @param {HTMLButtonElement|null} playBtn - corresponding play button or null.
 * @param {number} idx - current track index or -1 if none.
 */
const updateFooter = (audio, playBtn, idx) => {
  if (audio || playBtn) {
    const paused = audio ? audio.paused : playBtn.innerHTML === playSVG;
    footerPlayBtn.innerHTML = paused ? playSVG : pauseSVG;
    footerPlayBtn.disabled = false;
    footerPlayBtn._linkedAudio = audio;        // keep property name for compatibility with existing logic
    footerPlayBtn._linkedPlayBtn = playBtn;
    footerPlayBtn._linkedIndex = idx;
    if (audio) footerVolumeInput.value = audio.volume;
    updateVolumeBar(audio ? audio.volume : 1);
  } else {
    footerPlayBtn.innerHTML = playSVG;
    footerPlayBtn.disabled = true;
    footerPlayBtn._linkedAudio = null;
    footerPlayBtn._linkedPlayBtn = null;
    footerPlayBtn._linkedIndex = -1;
    updateVolumeBar(1);
  }
};

/**
 * Updates the CSS variable controlling volume slider's filled track. [12]
 * @param {number} volume - value between 0 and 1
 */
const updateVolumeBar = (volume) => {
  const perc = Math.round(volume * 100);
  footerVolumeInput.style.setProperty('--vol-percent', `${perc}%`);
};

/**
 * Plays the next track in the playlist, if any.
 * Pauses all other tracks.
 * Scrolls the new track into vertical center view if not fully visible. [12]
 * @param {number} currentIndex - index of the track that just ended.
 */
const playNextTrack = (currentIndex) => {
  let nextIdx = currentIndex + 1;
  if (nextIdx >= tracks.length) {
    updateFooter(null, null, -1);
    return; // No more tracks
  }
  const { audio, btnPlay, container } = tracks[nextIdx];
  tracks.forEach(({ audio: a, btnPlay: b }) => {
    if (a && a !== audio) {
      try { a.pause(); } catch (_) { /* noop */ }
      b.innerHTML = playSVG;
    }
  });
  audio.currentTime = 0;
  audio.play();
  btnPlay.innerHTML = pauseSVG;
  playingIndex = nextIdx;
  updateFooter(audio, btnPlay, nextIdx);
  // Scroll track element into vertical center of viewport
  scrollToCenterElement(container);
};

/**
 * Plays the previous track in the playlist, if any. [12]
 */
const playPrevTrack = () => {
  if (playingIndex <= 0) return;
  const prevIdx = playingIndex - 1;
  const { audio, btnPlay, container } = tracks[prevIdx];
  tracks.forEach(({ audio: a, btnPlay: b }) => {
    if (a && a !== audio) {
      try { a.pause(); } catch (_) { /* noop */ }
      b.innerHTML = playSVG;
    }
  });
  audio.currentTime = 0;
  audio.play();
  btnPlay.innerHTML = pauseSVG;
  playingIndex = prevIdx;
  updateFooter(audio, btnPlay, prevIdx);
  scrollToCenterElement(container);
};

/**
 * Scrolls the specified element into the vertical center of the viewport. [12]
 * @param {HTMLElement} element - The element to scroll into view
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

/* ========= Global Footer Controls Event Handlers ========= */
// Global footer play/pause button toggles currently playing track
footerPlayBtn.addEventListener('click', async () => {
  let audio = footerPlayBtn._linkedAudio;
  let playBtn = footerPlayBtn._linkedPlayBtn;

  // If no track is currently linked, determine the current track by hash or default to first
  if (!audio) {
    let currentTrackIdx = -1;
    const hash = window.location.hash.substring(1); // Remove '#'
    // Check if hash matches a track's ID
    tracks.forEach((track, idx) => {
      if (track.container.id === hash) {
        currentTrackIdx = idx;
      }
    });
    // If no hash match, use the first track if available
    if (currentTrackIdx === -1 && tracks.length > 0) {
      currentTrackIdx = 0;
    }
    if (currentTrackIdx !== -1) {
      const { audio: selectedAudio, btnPlay: selectedBtn, container: selectedContainer } = tracks[currentTrackIdx];
      audio = selectedAudio;
      playBtn = selectedBtn;
      // Pause all other tracks
      tracks.forEach(({ audio: a, btnPlay: b }) => {
        if (a && a !== audio) {
          try { a.pause(); } catch (_) { /* noop */ }
          b.innerHTML = playSVG;
        }
      });
      // Play the selected track
      await audio.play();
      playBtn.innerHTML = pauseSVG;
      footerPlayBtn.innerHTML = pauseSVG;
      // Update playingIndex and footer
      playingIndex = currentTrackIdx;
      updateFooter(audio, playBtn, currentTrackIdx);
      return;
    } else {
      // No tracks to play
      return;
    }
  }

  // Toggle play/pause for the linked track
  if (audio.paused) {
    tracks.forEach(({ audio: a, btnPlay: b }) => {
      if (a && a !== audio) {
        try { a.pause(); } catch (_) { /* noop */ }
        b.innerHTML = playSVG;
      }
    });
    await audio.play();
    playBtn.innerHTML = pauseSVG;
    footerPlayBtn.innerHTML = pauseSVG;
  } else {
    audio.pause();
    playBtn.innerHTML = playSVG;
    footerPlayBtn.innerHTML = playSVG;
  }
});

// Volume slider input event updates all track volumes
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
    prevVolume = 0.05; // Keep a tiny stored value for quick unmute UX parity with existing behavior. [12]
  } else if (isMuted) {
    isMuted = false;
    prevVolume = vol;
  }
  updateMuteButton();
});

// Volume slider mouse wheel controls volume in steps
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
    prevVolume = 0.05;
  } else if (isMuted) {
    isMuted = false;
    prevVolume = vol;
  }
  updateMuteButton();
}, { passive: false });

/* ========= Media Session & Keyboard Shortcut Handlers ========= */
// Setup media session action handlers for hardware keys and OS-level controls, routing to existing buttons/logic. [11][15]
if ('mediaSession' in navigator) {
  const mediaSession = navigator.mediaSession;
  mediaSession.setActionHandler('play', async () => {
    if (footerPlayBtn._linkedAudio && footerPlayBtn._linkedAudio.paused) {
      footerPlayBtn.click();
    }
  });
  mediaSession.setActionHandler('pause', () => {
    if (footerPlayBtn._linkedAudio && !footerPlayBtn._linkedAudio.paused) {
      footerPlayBtn.click();
    }
  });
  mediaSession.setActionHandler('previoustrack', () => {
    if (playingIndex !== -1) {
      playPrevTrack();
    }
  });
  mediaSession.setActionHandler('nexttrack', () => {
    if (playingIndex !== -1) {
      playNextTrack(playingIndex);
    }
  });
  mediaSession.setActionHandler('seekbackward', (details) => {
    if (playingIndex === -1) return;
    const currentAudio = tracks[playingIndex]?.audio;
    if (!currentAudio) return;
    const skipTime = (details && details.seekOffset) || 10;
    currentAudio.currentTime = Math.max(currentAudio.currentTime - skipTime, 0);
  });
  mediaSession.setActionHandler('seekforward', (details) => {
    if (playingIndex === -1) return;
    const currentAudio = tracks[playingIndex]?.audio;
    if (!currentAudio) return;
    const skipTime = (details && details.seekOffset) || 10;
    const dur = currentAudio.duration || Infinity;
    currentAudio.currentTime = Math.min(currentAudio.currentTime + skipTime, dur);
  });
}

/* Keyboard shortcuts for playback control (kept identical to original UX). [12] */
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    footerPlayBtn.click();
  } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    if (playingIndex === -1) return;
    e.preventDefault();
    if (e.code === 'ArrowDown') {
      footerNextBtn.click();
    } else {
      footerPrevBtn.click();
    }
  } else if (e.code === 'KeyM' || e.code === 'Numpad0') {
    e.preventDefault();
    footerMuteBtn.click();
  }
});

// Keyboard shortcuts for playback skip (left/right arrows) with Shift for large step. [15]
window.addEventListener('keydown', e => {
  if (playingIndex === -1) return;
  const currentAudio = tracks[playingIndex]?.audio;
  if (!currentAudio) return;
  const skipSmall = 10;
  const skipLarge = 60;
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    e.preventDefault();
    const direction = e.code === 'ArrowRight' ? 1 : -1;
    const skipAmount = e.shiftKey ? skipLarge : skipSmall;
    let newTime = (currentAudio.currentTime || 0) + direction * skipAmount;
    if (newTime < 0) newTime = 0;
    if (currentAudio.duration && newTime > currentAudio.duration) newTime = currentAudio.duration;
    currentAudio.currentTime = newTime;
  }
});

/* ========= Anchor Click Handling ========= */
/**
 * Prevents default anchor behavior and uses scrollToCenterElement instead to keep visual focus consistent. [12]
 * @param {Event} event - The click event on an anchor tag.
 */
const handleAnchorClick = (event) => {
  const targetId = event.currentTarget.getAttribute('href').substring(1);
  const targetElement = document.getElementById(targetId);
  if (targetElement) {
    // Prevent default anchor behavior
    event.preventDefault();
    // Update the browser's address bar with the new hash
    history.pushState({}, '', `#${targetId}`);
    // Scroll to the element using our custom centred function
    scrollToCenterElement(targetElement);
  }
};

/* ========= Initialization & Lifecycle ========= */
const playlistRoot = document.getElementById('playlist-container');

// Create UI, track objects and append to playlist; works with musicData as provided (no mutation of its structure). [12]
/* global musicData */
musicData.forEach((trackData, i) => {
  const trackObj = createTrackElement(trackData, i);
  tracks.push(trackObj);
  playlistRoot.appendChild(trackObj.container);
});

// Add event listeners to all anchor links for custom scrolling behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', handleAnchorClick);
});

// Handle anchor hash on page load
window.addEventListener('load', function() {
  const hash = window.location.hash;
  if (hash) {
    const elementId = hash.substring(1);
    const element = document.getElementById(elementId);
    if (element) {
      scrollToCenterElement(element);
    }
  }

  // Set initial button icons
  footerPlayBtn.innerHTML = playSVG;
  updateMuteButton();
  footerPrevBtn.innerHTML = prevSVG;
  footerNextBtn.innerHTML = nextSVG;

  // Initialize volume controls to 100%
  updateVolumeBar(1);
  updateVolumePercent(1);
});

// Event handler for previous track button
footerPrevBtn.addEventListener('click', () => {
  if (playingIndex === -1) return;
  playPrevTrack();
});

// Event handler for next track button
footerNextBtn.addEventListener('click', () => {
  if (playingIndex === -1) return;
  // Check if we're at the last track
  if (playingIndex + 1 < tracks.length) {
    playNextTrack(playingIndex);
  }
  // If at last track, do nothing to preserve UX parity.
});

// Event handler for mute button
footerMuteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  updateMuteButton();
  const currentSliderVol = parseFloat(footerVolumeInput.value);
  if (isMuted) {
    // Save the current volume from the slider
    prevVolume = (currentSliderVol === 0 ? 0.05 : currentSliderVol);
    // Mute all tracks regardless of playback state
    tracks.forEach(({ audio }) => {
      if (audio) audio.volume = 0;
    });
  } else {
    // Unmute all tracks using the saved volume
    tracks.forEach(({ audio }) => {
      if (audio) audio.volume = prevVolume;
    });
  }
  updateVolumeBar(isMuted ? 0 : prevVolume);
  updateVolumePercent(isMuted ? 0 : prevVolume);
  // Also update the volume slider value to reflect mute state
  footerVolumeInput.value = isMuted ? 0 : prevVolume;
});

// Update volume percentage when slider changes (ensure prevVolume tracks user changes)
footerVolumeInput.addEventListener('change', e => {
  const vol = parseFloat(e.target.value);
  if (playingIndex >= 0) {
    prevVolume = vol;
  }
  updateVolumePercent(vol);
});

// Pause all audio on page unload for clean exit
window.addEventListener('pagehide', () => {
  tracks.forEach(({ audio }) => {
    try { audio?.pause(); } catch (_) { /* noop */ }
  });
});
