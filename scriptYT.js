// ==UserScript==
// @name         Youtube Autoplay Stop
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Stops autoplay on watch later videos
// @author       Alan
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// @sandbox      JavaScript
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const PAUSE_THRESHOLD_SECONDS = 1;
    const MONITORING_WINDOW_SECONDS = 60;
    const CHECK_INTERVAL_MS = 1000;
    const WATCH_LATER_LIST_ID = 'WL';

    // State tracking
    let lastUrl = location.href;
    let currentVideo = null;
    let isListenerAttached = false;
    let hasPausedVideo = false;

    // Find and cache the active video element
    function getVideo() {
        if (currentVideo && currentVideo.isConnected) {
            return currentVideo;
        }
        currentVideo = document.querySelector('video.html5-main-video') ||
                       document.querySelector('video.video-stream') ||
                       document.querySelector('#movie_player video') ||
                       document.querySelector('video');
        return currentVideo;
    }

    // Check if currently on "Watch Later" playlist
    function isWatchLater() {
        return new URLSearchParams(window.location.search).get('list') === WATCH_LATER_LIST_ID;
    }

    // Pause video when approaching the end
    function onTimeUpdate() {
        const video = this;
        if (video.paused || !video.duration || hasPausedVideo) return;

        if (video.duration - video.currentTime < PAUSE_THRESHOLD_SECONDS) {
            video.pause();
            hasPausedVideo = true;
        }
    }

    // Main monitoring loop
    function mainLoop() {
        // Detect navigation and reset state
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            currentVideo = null;
            isListenerAttached = false;
            hasPausedVideo = false;
        }

        const video = getVideo();

        // Exit if no valid video or not in Watch Later
        if (!video || !isWatchLater() || isNaN(video.duration)) {
            if (isListenerAttached) {
                video?.removeEventListener('timeupdate', onTimeUpdate);
                isListenerAttached = false;
            }
            setTimeout(mainLoop, CHECK_INTERVAL_MS);
            return;
        }

        // Attach/detach listener based on proximity to video end
        const timeLeft = video.duration - video.currentTime;
        const isNearEnd = timeLeft < MONITORING_WINDOW_SECONDS;

        if (isNearEnd && !isListenerAttached) {
            video.addEventListener('timeupdate', onTimeUpdate);
            isListenerAttached = true;
        } else if (!isNearEnd && isListenerAttached) {
            video.removeEventListener('timeupdate', onTimeUpdate);
            isListenerAttached = false;
        }

        setTimeout(mainLoop, CHECK_INTERVAL_MS);
    }

    // Start monitoring after page load
    setTimeout(mainLoop, 2000);
})();