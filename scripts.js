/* ========= Global Constants & SVG Icons ========= */
const playSVG = `<svg class="play-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><polygon points="6 4 20 12 6 20" /></svg>`;
const pauseSVG = `<svg class="pause-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const prevSVG = `<svg class="prev-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
const nextSVG = `<svg class="next-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
const muteSVG = `<svg class="unmute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><path d="M16.5 7.5a5 5 0 0 1 0 9"></path></svg>`;
const unmuteSVG = `<svg class="mute-icon" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 9 9 13 5 13 19 9 15 3 15"></polygon><line x1="18" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="18" y2="15"></line></svg>`;

/* ========= Accessibility & UX ========= */
/**
 * Formats seconds to mm:ss string
 * Returns '0:00' if input falsy.
 */
const formatTime = (seconds) => {
	if (!seconds) return '0:00';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/* ========= Waveform Drawing ========= */
/**
 * Draws waveform bars on a given 2D canvas context.
 * Colors differ by play progress and hover state.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
 * @param {Array<number>} ampData - normalized amplitude array (0..1).
 * @param {number} progress - fraction played (0..1).
 * @param {number} width - canvas width.
 * @param {number} height - canvas height.
 * @param {number} [hoverIndex=-1] - waveform bar index hovered (-1 if none).
 * @param {boolean} [isHovering=false] - whether mouse is currently hovering.
 */
const drawWaveform = (ctx, ampData, progress, width, height, hoverIndex = -1, isHovering = false) => {
	ctx.clearRect(0, 0, width, height);
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
				.getPropertyValue('--highlight-alt').trim();
		} else if (progress > 0 && i / total <= progress) {
			fillStyle = getComputedStyle(document.documentElement)
				.getPropertyValue('--highlight-muted').trim();
		} else {
			fillStyle = getComputedStyle(document.documentElement)
				.getPropertyValue('--text-color-muted').trim();
		}

		ctx.fillStyle = fillStyle;
		ctx.fillRect(x, midY - barHeight / 2, barWidth, barHeight);
	}
};

/**
 * Interpolates input amplitude data array to fit length required
 * @param {Array<number>} inputData - original amplitude array (length N)
 * @param {number} targetLength - desired length for output data
 * @returns {Array<number>} - interpolated amplitude data
 */
const interpolateAmplitudeData = (inputData, targetLength) => {
	const output = [];
	const inputLength = inputData.length;

	for (let i = 0; i < targetLength; i++) {
		// Calculate fractional position in input data
		const pos = i * (inputLength - 1) / (targetLength - 1);
		const idx = Math.floor(pos);
		const frac = pos - idx;
		const v1 = inputData[idx] || 0;
		const v2 = inputData[Math.min(idx + 1, inputLength - 1)] || 0;

		// Linear interpolation
		output[i] = v1 + frac * (v2 - v1);
	}

	return output;
};

/* ========= UI Construction & Track Element Creation ========= */
/**
 * Creates and returns a track DOM element with all UI components,
 * sets up event listeners for playback and waveform interaction.
 * @param {Array} data - musicData single track array.
 * @param {number} idx - track index in playlist.
 * @returns {object} track object containing references to components and audio functions.
 */
const createTrackElement = (data, idx) => {
	// Main wrapper
	const trackElem = document.createElement('div');
	trackElem.className = 'track-item content';

	// 1. Cover Art Container with direct link
	const coverContainer = document.createElement('div');
	coverContainer.className = 'track-cover-container';
	const coverLink = document.createElement('a');
	coverLink.href = `#${data[0].replace(/ /g, '-')}`;
	coverLink.className = 'track-cover-link';
	
	const coverImg = document.createElement('img');
	coverImg.alt = `${data[2]} cover art`;
	coverImg.className = 'track-cover';
	coverImg.src = `data:image/png;base64,${data[7]}`;
	
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
	playPauseBtn.setAttribute('aria-label', `Play or Pause ${data[2]} by ${data[1]}`);
	playPauseBtn.innerHTML = playSVG;
	playBtnContainer.appendChild(playPauseBtn);

	// 2.2 Artist & Title Container (stacked)
	const artistTitleContainer = document.createElement('div');
	artistTitleContainer.className = 'artist-title-container';
	const artistDiv = document.createElement('div');
	artistDiv.className = 'track-artist';
	artistDiv.textContent = data[1];
	const titleDiv = document.createElement('div');
	titleDiv.className = 'track-title';
	titleDiv.textContent = data[2];
	artistTitleContainer.appendChild(artistDiv);
	artistTitleContainer.appendChild(titleDiv);

	// 2.3 Meta Info Container - Genre & Date + Time Row
	const metaContainer = document.createElement('div');
	metaContainer.className = 'meta-info-container';

	// Genre and Date Row
	const genreDateRow = document.createElement('div');
	genreDateRow.className = 'genre-date-row';
	const genreDiv = document.createElement('div');
	genreDiv.className = 'track-genre';
	genreDiv.textContent = data[4];
	const dateDiv = document.createElement('div');
	dateDiv.className = 'track-date';
	dateDiv.textContent = data[3];
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
	durDiv.textContent = formatTime(data[5]);
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

	if (data[6] != null && data[6].trim() !== '') {
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
		detailsContent.innerHTML = data[6];
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
	trackElem.id = data[0].replace(/ /g, '-');

	/* ========= Audio Streaming & Playback Control ========= */
	// Create hidden audio element for fallback streaming
	const audioElement = document.createElement('audio');
	audioElement.src = `music/${data[0]}`;
	audioElement.preload = 'metadata';
	audioElement.style.display = 'none';
	audioElement.controls = false;
	trackElem.appendChild(audioElement);

	// Waveform drawing context and metadata
	const ctx = waveformCanvas.getContext('2d');
	const height = waveformCanvas.height;
	const originalAmpData = JSON.parse(data[8]);
	const duration = data[5];

	// Variables to hold current canvas width and interpolated amp data
	let currentCanvasWidth = 0;
	let ampData = [];

	// Function to update canvas width, amp data interpolation, and draw waveform
	const updateCanvasWidthAndDraw = () => {
		// Get actual width of waveform container in pixels
		let containerWidth = waveformContainer.offsetWidth;

		// Reduce width by up to 2px to make it divisible by 3
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

		// Calculate number of peaks based on rule: peak width 2px + 1px space = 3px per peak
		const numPeaks = containerWidth / 3;

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
	audioElement.addEventListener('timeupdate', () => {
		if (!mouseHovering) {
			const current = audioElement.currentTime;
			const dur = audioElement.duration || duration;
			const prog = dur ? current / dur : 0;
			drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
			playPosDiv.textContent = formatTime(current);
			durDiv.textContent = formatTime(dur);
		}
	});

	// On track end, reset UI and play next track
	audioElement.addEventListener('ended', () => {
		playPauseBtn.innerHTML = playSVG;
		if (playingIndex === idx) {
			playingIndex = -1;
			updateFooter(null, null, -1);
			playNextTrack(idx);
		}
	});

	// Play/Pause button toggles playback state for this track
	playPauseBtn.addEventListener('click', () => {
		if (audioElement.paused) {
			// Pause all other track audios
			tracks.forEach(({ audio, btnPlay }, i) => {
				if (i !== idx) {
					audio?.pause();
					btnPlay.innerHTML = playSVG;
				}
			});
			audioElement.play();
			playPauseBtn.innerHTML = pauseSVG;
			playingIndex = idx;
			updateFooter(audioElement, playPauseBtn, idx);
		} else {
			audioElement.pause();
			playPauseBtn.innerHTML = playSVG;
			if (playingIndex === idx) playingIndex = -1;
			updateFooter(null, null, -1);
		}
	});

	// Clicking waveform seeks playback position
	waveformCanvas.addEventListener('click', e => {
		const rect = waveformCanvas.getBoundingClientRect();
		const ratio = (e.clientX - rect.left) / rect.width;
		const dur = audioElement.duration || duration;
		audioElement.currentTime = ratio * dur;
		drawWaveform(ctx, ampData, ratio, currentCanvasWidth, height);
	});

	// Hovering waveform shows hover time, highlights bar
	waveformCanvas.addEventListener('mousemove', e => {
		mouseHovering = true;
		const rect = waveformCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const ratio = x / rect.width;
		hoverIndex = Math.min(Math.max(Math.floor(ratio * ampData.length), 0), ampData.length - 1);
		const dur = audioElement.duration || duration;
		playPosDiv.textContent = formatTime(ratio * dur);
		durDiv.textContent = formatTime(dur);
		const prog = audioElement.currentTime / dur;
		drawWaveform(ctx, ampData, prog, currentCanvasWidth, height, hoverIndex, true);
	});

	// Leaving waveform resets to current playback time display & bar
	waveformCanvas.addEventListener('mouseleave', () => {
		mouseHovering = false;
		hoverIndex = -1;
		const dur = audioElement.duration || duration;
		const curTime = audioElement.currentTime;
		const prog = dur ? curTime / dur : 0;
		drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
		playPosDiv.textContent = formatTime(curTime);
		durDiv.textContent = formatTime(dur);
	});

	// Observe width changes of waveform container and update canvas accordingly
	const resizeObserver = new ResizeObserver(() => {
		updateCanvasWidthAndDraw();
		// After resizing, redraw the waveform progress if audio is playing
		if (!audioElement.paused) {
			const curDur = audioElement.duration || duration;
			const prog = curDur ? audioElement.currentTime / curDur : 0;
			drawWaveform(ctx, ampData, prog, currentCanvasWidth, height);
		}
	});
	resizeObserver.observe(waveformContainer);

	// Return track object with references & control functions
	return {
		container: trackElem,
		audio: audioElement,
		btnPlay: playPauseBtn,
		timeDisplay: timeRow,
		canvasCtx: ctx,
		ampData,
		width: currentCanvasWidth,
		height,
		get currentTime() { return audioElement.currentTime; },
		playAudioFn: () => audioElement.play(),
		pauseAudioFn: () => audioElement.pause(),
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
 * Updates the mute button icon based on current mute state
 */
const updateMuteButton = () => {
	footerMuteBtn.innerHTML = isMuted ? unmuteSVG : muteSVG;
};

/**
 * Updates the volume percentage display
 * @param {number} volume - Volume value between 0 and 1
 */
const updateVolumePercent = (volume) => {
	const percent = Math.round(volume * 100);
	volumePercentSpan.textContent = `${percent}%`;
};

/**
 * Updates the global footer controls:
 * - Synchronizes play/pause icon and state
 * - Associates global controls with the active track
 * - Adjusts volume slider fill percentage
 * @param {HTMLAudioElement|null} audio - currently playing audio or null if none.
 * @param {HTMLButtonElement|null} playBtn - corresponding play button or null.
 * @param {number} idx - current track index or -1 if none.
 */
const updateFooter = (audio, playBtn, idx) => {
	if (audio || playBtn) {
		const paused = audio ? audio.paused : playBtn.innerHTML === playSVG;
		footerPlayBtn.innerHTML = paused ? playSVG : pauseSVG;
		footerPlayBtn.disabled = false;
		footerPlayBtn._linkedAudio = audio;
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
 * Updates the CSS variable controlling volume slider's filled track
 * @param {number} volume - value between 0 and 1
 */
const updateVolumeBar = (volume) => {
	const perc = Math.round(volume * 100);
	footerVolumeInput.style.setProperty('--vol-percent', `${perc}%`);
};

/**
 * Plays the next track in the playlist, if any.
 * Pauses all other tracks.
 * Scrolls the new track into vertical center view if not fully visible.
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
			a.pause();
			b.innerHTML = playSVG;
		}
	});

	audio.currentTime = 0;
	audio.play();
	btnPlay.innerHTML = pauseSVG;
	playingIndex = nextIdx;
	updateFooter(audio, btnPlay, nextIdx);

	// Scroll track element into vertical center of viewport if not fully visible
	const bounding = container.getBoundingClientRect();
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const isFullyVisible = bounding.top >= 0 && bounding.bottom <= viewportHeight;

	if (!isFullyVisible) {
		const scrollToY = window.scrollY + bounding.top - (viewportHeight / 2) + (bounding.height / 2);
		window.scrollTo({
			top: scrollToY,
			behavior: 'smooth'
		});
	}
};

/* ========= Global Footer Controls Event Handlers ========= */
// Global footer play/pause button toggles currently playing track
footerPlayBtn.addEventListener('click', () => {
  let audio = footerPlayBtn._linkedAudio;
  let playBtn = footerPlayBtn._linkedPlayBtn;

  // If no track is currently playing, determine the current track
  if (!audio) {
    let currentTrackIdx = -1;
    const hash = window.location.hash.substring(1); // Remove '#'

    // Check if hash matches a track's ID
    tracks.forEach((track, idx) => {
      if (track.container.id === hash) {
        currentTrackIdx = idx;
      }
    });

    // If no hash match, use the first track
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
          a.pause();
          b.innerHTML = playSVG;
        }
      });

      // Play the selected track
      audio.play();
      playBtn.innerHTML = pauseSVG;
      footerPlayBtn.innerHTML = pauseSVG;

      // Update playingIndex and footer
      playingIndex = currentTrackIdx;
      updateFooter(audio, playBtn, currentTrackIdx);
    }
  } else {
    // Existing logic for toggling play/pause
    if (audio.paused) {
      tracks.forEach(({ audio: a, btnPlay: b }) => {
        if (a && a !== audio) {
          a.pause();
          b.innerHTML = playSVG;
        }
      });
      audio.play();
      playBtn.innerHTML = pauseSVG;
      footerPlayBtn.innerHTML = pauseSVG;
    } else {
      audio.pause();
      playBtn.innerHTML = playSVG;
      footerPlayBtn.innerHTML = playSVG;
    }
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
		prevVolume = 0.05; // Set prevVolume to 0.05 when volume reaches 0
	} else if (isMuted) {
		isMuted = false;
		prevVolume = vol; // Update prevVolume to current volume
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
		prevVolume = 0.05; // Set prevVolume to 0.05 when volume reaches 0
	} else if (isMuted) {
		isMuted = false;
		prevVolume = vol; // Update prevVolume to current volume
	}
	updateMuteButton();
}, { passive: false });

/* ========= Media Session & Keyboard Shortcut Handlers ========= */
// Setup media session if available
if ('mediaSession' in navigator) {
	const mediaSession = navigator.mediaSession;

	// Define action handlers for media keys
	mediaSession.setActionHandler('play', () => {
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
			footerPrevBtn.click();
		}
	});

	mediaSession.setActionHandler('nexttrack', () => {
		if (playingIndex !== -1) {
			footerNextBtn.click();
		}
	});
}

// Keyboard shortcuts for playback control
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
	} else if (e.code === 'KeyM' || e.code === 'Numpad0') { // M key or Numpad 0 for mute
		e.preventDefault();
		footerMuteBtn.click();
	}
});

// Keyboard shortcuts for playback skip (left/right arrows)
window.addEventListener('keydown', e => {
	if (playingIndex === -1) return;
	const currentAudio = tracks[playingIndex]?.audio;
	if (!currentAudio) return;
	const skipSmall = 10; // seconds for normal arrow keys
	const skipLarge = 60; // seconds for shift + arrow keys

	if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
		e.preventDefault();
		const direction = e.code === 'ArrowRight' ? 1 : -1;
		const skipAmount = e.shiftKey ? skipLarge : skipSmall;
		let newTime = currentAudio.currentTime + direction * skipAmount;

		if (newTime < 0) newTime = 0;
		if (currentAudio.duration && newTime > currentAudio.duration) newTime = currentAudio.duration;
		currentAudio.currentTime = newTime;
	}
});


/* ========= Initialization & Lifecycle ========= */
const playlistRoot = document.getElementById('playlist-container');

// Create UI, track objects and append to playlist
musicData.forEach((trackData, i) => {
	const trackObj = createTrackElement(trackData, i);
	tracks.push(trackObj);
	playlistRoot.appendChild(trackObj.container);
});

// Set initial button icons
footerPlayBtn.innerHTML = playSVG;
updateMuteButton();
footerPrevBtn.innerHTML = prevSVG;
footerNextBtn.innerHTML = nextSVG;

// Initialize volume controls
updateVolumeBar(1);
updateVolumePercent(1);

// Event handler for previous track button
footerPrevBtn.addEventListener('click', () => {
	if (playingIndex === -1) return;
	playNextTrack(playingIndex - 2); // -2 because playNextTrack expects the index of the track that just ended
});

// Event handler for next track button
footerNextBtn.addEventListener('click', () => {
	if (playingIndex === -1) return;

	// Check if we're at the last track
	if (playingIndex + 1 < tracks.length) {
		playNextTrack(playingIndex);
	}
	// If we're at the last track, don't change the play/pause button state
});

// Event handler for mute button
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

// Update volume percentage when slider changes
footerVolumeInput.addEventListener('input', e => {
	const vol = parseFloat(e.target.value);
	// Update prevVolume when user manually changes volume
	if (playingIndex >= 0) {
		prevVolume = vol;
	}
	updateVolumePercent(vol);
});

// Pause all audio on page unload for clean exit
window.addEventListener('pagehide', () => {
	tracks.forEach(({ audio }) => {
		audio?.pause();
	});
});