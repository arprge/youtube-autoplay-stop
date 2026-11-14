// ==UserScript==
// @name         YouTube Autoplay Stop
// @namespace    https://github.com/arprge/youtube-autoplay-stop
// @version      4.2.0
// @description  Prevents autoplay on YouTube Watch Later playlist
// @author       Alan
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @run-at       document-idle
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/arprge/youtube-autoplay-stop
// @updateURL    https://raw.githubusercontent.com/arprge/youtube-autoplay-stop/refs/heads/main/scriptYT.user.js
// @downloadURL  https://raw.githubusercontent.com/arprge/youtube-autoplay-stop/refs/heads/main/scriptYT.user.js
// ==/UserScript==

(() => {
    'use strict';

    const BASE_PAUSE_THRESHOLD = 1.0; // seconds at 1x speed
    const WATCH_LATER_LIST = 'WL';

    let attachedVideo = null;
    let listenerController = null;
    let hasPausedThisPlay = false;

    function getPlayer() {
        return document.getElementById('movie_player');
    }

    function isWatchLater(player) {
        const urlList = new URLSearchParams(window.location.search).get('list');
        if (urlList !== null) {
            return urlList === WATCH_LATER_LIST;
        }
        // Fallback for miniplayer mode when browsing off /watch
        if (typeof player?.getPlaylistId === 'function') {
            return player.getPlaylistId() === WATCH_LATER_LIST;
        }
        return false;
    }

    function isAdPlaying(player) {
        if (!player) return false;
        return (
            player.classList.contains('ad-showing') ||
            player.classList.contains('ad-interrupting') ||
            player.getAdState?.() === 1
        );
    }

    function pausePlayback(player, video) {
        if (typeof player?.pauseVideo === 'function') {
            player.pauseVideo();
        } else {
            video.pause();
        }
    }

    function checkPlaybackBoundary(event) {
        const video = event.currentTarget;
        const player = getPlayer();

        if (!isWatchLater(player) || isAdPlaying(player)) return;
        if (video.paused || !Number.isFinite(video.duration) || video.duration <= 0) return;

        // Scale threshold with playback speed (e.g., 2.0s buffer at 2x speed)
        const threshold = Math.max(BASE_PAUSE_THRESHOLD, BASE_PAUSE_THRESHOLD * video.playbackRate);
        const timeLeft = video.duration - video.currentTime;

        if (timeLeft <= threshold) {
            if (!hasPausedThisPlay) {
                pausePlayback(player, video);
                hasPausedThisPlay = true;
            }
        } else if (hasPausedThisPlay && timeLeft > threshold + 2) {
            // Reset if the user manually rewound past the threshold buffer
            hasPausedThisPlay = false;
        }
    }

    function resetPauseState() {
        hasPausedThisPlay = false;
    }

    const mountObserver = new MutationObserver(() => {
        if (attachToVideo()) {
            mountObserver.disconnect();
        }
    });

    function attachToVideo() {
        // Scope strictly to #movie_player to ignore homepage hover-preview videos
        const video = document.querySelector('#movie_player video.html5-main-video');
        if (!video) return false;
        if (video === attachedVideo && video.isConnected) return true;

        listenerController?.abort();
        listenerController = new AbortController();
        const { signal } = listenerController;

        attachedVideo = video;
        hasPausedThisPlay = false;

        video.addEventListener('timeupdate', checkPlaybackBoundary, { signal });
        video.addEventListener('seeked', checkPlaybackBoundary, { signal });
        video.addEventListener('loadedmetadata', resetPauseState, { signal });
        video.addEventListener('emptied', resetPauseState, { signal });

        return true;
    }

    function syncPlayer() {
        hasPausedThisPlay = false;
        if (!attachToVideo() && document.body) {
            mountObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    for (const eventName of ['yt-navigate-finish', 'yt-page-data-fetched', 'yt-player-updated']) {
        document.addEventListener(eventName, syncPlayer);
    }

    syncPlayer();
})();
