/**
 * @fileoverview Content script for Twitter/X Video Auto-Pause extension.
 * Pauses videos when they become visible using IntersectionObserver (assertive pause),
 * allows user click within the video container to play using event delegation.
 * Uses MutationObserver to trigger debounced global video scans.
 * Includes a 'play' event listener to counteract unwanted plays.
 */

const SCRIPT_VERSION = "v6.5-debug-play-listener"; // Updated version
console.log(`Twitter/X Video Auto-Pause script loaded (${SCRIPT_VERSION}).`);

// Keep track of videos the user has intentionally played by clicking
const userClickedPlay = new Set();
// Keep track of videos being observed by IntersectionObserver
const observedVideos = new WeakSet();
let debounceTimer = null; // Timer for debouncing the global scan

/**
 * Handles the 'play' event on a video.
 * If the play was not initiated by the user (i.e., video not in userClickedPlay set),
 * pauses the video immediately.
 * @param {Event} event The 'play' event object.
 */
function handleVideoPlay(event) {
    const video = event.target;
    console.log(`[handleVideoPlay] 'play' event detected for video:`, video);
    if (!userClickedPlay.has(video)) {
        console.log(`[handleVideoPlay] Play was not user-initiated. Attempting to pause.`);
        try {
            video.pause();
             if (video.paused) {
                 console.log(`[handleVideoPlay] SUCCESS: Paused video via play listener.`);
             } else {
                  console.warn(`[handleVideoPlay] WARN: Called pause() via play listener, but video.paused is still false.`);
             }
        } catch (error) {
            console.error(`[handleVideoPlay] ERROR: Failed to pause video via play listener:`, error);
        }
    } else {
        console.log(`[handleVideoPlay] Play is allowed (user initiated).`);
    }
}

/**
 * Attaches the 'play' event listener to a video if not already attached.
 * @param {HTMLVideoElement} video The video element.
 */
function attachPlayListenerIfNeeded(video) {
    if (video && video.dataset.playListenerAttached !== 'true') {
        console.log(`[attachPlayListenerIfNeeded] Attaching 'play' listener to video:`, video);
        video.addEventListener('play', handleVideoPlay);
        video.dataset.playListenerAttached = 'true';
    }
}


/**
 * Pauses a video if appropriate based on context and user interaction.
 * @param {HTMLVideoElement} video The video element to potentially pause.
 * @param {string} context A string indicating where this function was called from.
 * @param {boolean} [assertivePause=false] If true, skip the !isPaused check (used for intersection).
 */
function pauseVideoIfAppropriate(video, context, assertivePause = false) {
    // Ensure the play listener is attached whenever we interact with the video
    attachPlayListenerIfNeeded(video);

    console.log(`[${context}] Checking video (Assertive: ${assertivePause}):`, video);
    if (video) {
        const isPaused = video.paused;
        const isUserClicked = userClickedPlay.has(video);
        console.log(`[${context}] Video state: isPaused=${isPaused}, isUserClicked=${isUserClicked}`);

        // Determine if we should attempt to pause
        let shouldPause = false;
        if (assertivePause) {
            // For intersection observer, pause forcefully unless user clicked play
            shouldPause = !isUserClicked;
            if (isUserClicked) console.log(`[${context}] SKIPPED Assertive Pause: User Clicked`, video);
        } else {
            // For regular scans, only pause if it's actually playing and not user-clicked
            shouldPause = !isPaused && !isUserClicked;
             if (!shouldPause) console.log(`[${context}] SKIPPED Normal Pause: (Paused: ${isPaused}, User Clicked: ${isUserClicked})`, video);
        }

        if (shouldPause) {
            try {
                // Only log the attempt if it wasn't already paused (to reduce noise if assertive)
                if (!isPaused || assertivePause) {
                    console.log(`[${context}] Attempting to pause video...`);
                }
                video.pause();
                // Check if it actually paused (sometimes might fail silently?)
                if (video.paused) {
                    console.log(`[${context}] SUCCESS: Paused video:`, video);
                } else {
                     console.warn(`[${context}] WARN: Called pause(), but video.paused is still false.`, video);
                }
            } catch (error) {
                console.error(`[${context}] ERROR: Failed to pause video:`, error, video);
            }
        }
    } else {
        console.log(`[${context}] SKIPPED Pause: Video element was null.`);
    }
}

/**
 * Callback function for the IntersectionObserver.
 * Pauses videos when they become visible, if appropriate.
 * @param {IntersectionObserverEntry[]} entries List of entries being observed.
 * @param {IntersectionObserver} observer The observer instance.
 */
function handleIntersection(entries, observer) {
  // console.log(`[IntersectionObserver] handleIntersection called with ${entries.length} entries.`); // Can be noisy
  entries.forEach(entry => {
    const video = entry.target;
    if (entry.isIntersecting && video instanceof HTMLVideoElement) {
      console.log(`[IntersectionObserver] Video intersecting: isIntersecting=${entry.isIntersecting}, target=`, video);
      // Use assertive pause (skip isPaused check) when called from intersection observer
      pauseVideoIfAppropriate(video, "Intersection-Immediate", true); // Pass true for assertivePause
      setTimeout(() => {
          // console.log(`[IntersectionObserver] Running timeout check for video:`, video); // Can be noisy
          pauseVideoIfAppropriate(video, "Intersection-Timeout", true); // Pass true for assertivePause
      }, 50);
    }
  });
}

/**
 * Creates and returns an IntersectionObserver instance.
 */
function createIntersectionObserver() {
    console.log("[createIntersectionObserver] Creating IntersectionObserver.");
    return new IntersectionObserver(handleIntersection, {
      threshold: 0.1 // Trigger when at least 10% visible
    });
}

// Create the observer instance
const intersectionObserver = createIntersectionObserver();

/**
 * Scans the entire document for video elements and ensures they are observed
 * by the IntersectionObserver and have the play listener attached.
 */
function scanAndObserveAllVideos() {
    console.log("[scanAndObserveAllVideos] Starting global scan for videos.");
    const allVideos = document.querySelectorAll('video');
    console.log(`[scanAndObserveAllVideos] Found ${allVideos.length} videos in the document.`);

    allVideos.forEach(video => {
        // Ensure play listener is attached
        attachPlayListenerIfNeeded(video);

        // Observe with IntersectionObserver if needed
        if (!observedVideos.has(video)) {
            console.log("[scanAndObserveAllVideos] Starting IntersectionObserver for new video:", video);
            intersectionObserver.observe(video);
            observedVideos.add(video);
            // Initial check uses normal pause logic (don't pause if already paused)
            pauseVideoIfAppropriate(video, "Scan-InitialCheck", false); // Pass false (or omit)
        } else {
             // console.log("[scanAndObserveAllVideos] Video already observed, skipping:", video); // Can be noisy
        }
    });
     console.log("[scanAndObserveAllVideos] Global scan finished.");
}

/**
 * Debounced version of scanAndObserveAllVideos. Ensures the scan doesn't run
 * too frequently during rapid DOM changes.
 */
function debouncedScanAndObserve() {
    clearTimeout(debounceTimer);
    // console.log("[Debounce] DOM change detected, setting timer for global scan."); // Can be noisy
    debounceTimer = setTimeout(() => {
        console.log("[Debounce] Timer expired, running global scan.");
        scanAndObserveAllVideos();
    }, 300); // Wait 300ms after the *last* detected change before scanning
}


/**
 * Handles click events delegated from the document body.
 * Checks if the click occurred within a video player container and plays the video.
 * @param {Event} event The click event.
 */
function handleBodyClick(event) {
    console.log("[handleBodyClick] Click detected on target:", event.target);
    const videoContainer = event.target.closest('div[data-testid="videoComponent"], div[data-testid="videoPlayer"]');

    if (videoContainer) {
        console.log("[handleBodyClick] Click target is inside a video container:", videoContainer);
        const video = videoContainer.querySelector('video');
        if (video) {
            // Ensure play listener is attached before potential play
            attachPlayListenerIfNeeded(video);

            console.log("[handleBodyClick] Found video element:", video);
            if (!userClickedPlay.has(video)) {
                 console.log("[handleBodyClick] Adding video to userClickedPlay set.");
                 userClickedPlay.add(video);
            } else {
                 console.log("[handleBodyClick] Video was already in userClickedPlay set.");
            }
            console.log("[handleBodyClick] Attempting to play video...");
            video.play().then(() => {
                console.log("[handleBodyClick] Play command successful for video:", video);
            }).catch(error => {
                console.error("[handleBodyClick] ERROR: Play command failed:", error, video);
            });
        } else {
             console.log("[handleBodyClick] No video element found within the container.");
        }
    } else {
         console.log("[handleBodyClick] Click was not inside a known video container.");
    }
}


/**
 * Sets up a MutationObserver to detect dynamically added/removed nodes
 * and trigger a debounced global video scan.
 */
function observeDOMChanges() {
  const targetNode = document.body;
  // Observe changes to the list of children and the subtree for additions/removals
  const config = { childList: true, subtree: true };

  const callback = function(mutationsList, observer) {
    // Check if any mutation involved adding or removing nodes
    let changed = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            changed = true;
            break;
        }
    }

    // If nodes were added or removed, trigger the debounced scan
    if (changed) {
        // console.log("[MutationObserver] Relevant DOM change detected."); // Can be noisy
        debouncedScanAndObserve();
    }
  };

  const mutationObserver = new MutationObserver(callback);
  mutationObserver.observe(targetNode, config);
  console.log("[observeDOMChanges] MutationObserver set up to trigger debounced scans.");
}

// --- Script Execution ---

// 1. Add the single click listener to the body for event delegation
document.body.addEventListener('click', handleBodyClick, true); // Use capture phase
console.log("INITIALIZATION: Body click listener added.");

// 2. Run an initial global scan after a delay
console.log("INITIALIZATION: Setting timeout for initial video scan.");
setTimeout(() => {
    console.log("INITIALIZATION: Running initial video scan.");
    scanAndObserveAllVideos();
}, 1000); // Adjust delay if needed

// 3. Set up the MutationObserver to trigger subsequent scans
console.log("INITIALIZATION: Setting timeout for MutationObserver setup.");
setTimeout(() => {
    console.log("INITIALIZATION: Setting up MutationObserver.");
    observeDOMChanges();
}, 1500); // Delay slightly more

console.log(`INITIALIZATION: Script ${SCRIPT_VERSION} setup complete.`);