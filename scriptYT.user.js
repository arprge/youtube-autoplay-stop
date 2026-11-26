// ==UserScript==
// @name         YouTube Autoplay Stop
// @namespace    https://github.com/arprge/youtube-autoplay-stop
// @version      4.2.2
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

    if (document.contentType && !document.contentType.includes('html')) {
        return;
    }

    const BASE_PAUSE_THRESHOLD = 1.0; // seconds at 1x speed
    const WATCH_LATER_LIST = 'WL';
    const PATCHED_MANAGER = Symbol('wlAutoplayPatched');

    let attachedVideo = null;
    let listenerController = null;
    let hasPausedThisPlay = false;

    const getPlayer = () => document.getElementById('movie_player');
    const isShortsPage = () => window.location.pathname.startsWith('/shorts');

    const isWatchLater = (player) => {
        const urlList = new URLSearchParams(window.location.search).get('list');
        if (urlList !== null) {
            return urlList === WATCH_LATER_LIST;
        }
        // Fallback for miniplayer mode when browsing off /watch
        return typeof player?.getPlaylistId === 'function'
            ? player.getPlaylistId() === WATCH_LATER_LIST
            : false;
    };

    const isAdPlaying = (player) =>
        Boolean(
            player &&
                (player.classList.contains('ad-showing') ||
                    player.classList.contains('ad-interrupting') ||
                    player.getAdState?.() === 1)
        );

    const pausePlayback = (player, video) => {
        if (typeof player?.pauseVideo === 'function') {
            player.pauseVideo();
        } else {
            video.pause();
        }
    };

    const getPropertyDescriptor = (obj, prop) => {
        let current = obj;
        while (current && current !== Object.prototype) {
            const desc = Object.getOwnPropertyDescriptor(current, prop);
            if (desc) return desc;
            current = Object.getPrototypeOf(current);
        }
        return undefined;
    };

    // Fallback for throttled/background tabs: prevent yt-playlist-manager from advancing Watch Later
    const guardPlaylistManager = () => {
        const manager = document.querySelector('yt-playlist-manager');
        if (!manager || manager[PATCHED_MANAGER]) return;

        const ownDesc = Object.getOwnPropertyDescriptor(manager, 'canAutoAdvance_');
        if (ownDesc && !ownDesc.configurable) return;

        const desc = ownDesc ?? getPropertyDescriptor(Object.getPrototypeOf(manager), 'canAutoAdvance_');
        let actualValue = desc && 'value' in desc ? desc.value : (manager.canAutoAdvance_ ?? true);

        try {
            Object.defineProperty(manager, 'canAutoAdvance_', {
                configurable: true,
                enumerable: true,
                get() {
                    if (isWatchLater(getPlayer())) {
                        return false;
                    }
                    return desc?.get ? desc.get.call(this) : actualValue;
                },
                set(value) {
                    if (desc?.set) {
                        desc.set.call(this, value);
                    } else {
                        actualValue = value;
                    }
                },
            });
            manager[PATCHED_MANAGER] = true;
        } catch {
            // Ignore if the element prevents property redefinition
        }
    };

    const checkPlaybackBoundary = ({ currentTarget: video }) => {
        const player = getPlayer();

        if (isShortsPage() || !isWatchLater(player) || isAdPlaying(player)) return;
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
    };

    const resetPauseState = () => {
        hasPausedThisPlay = false;
    };

    const attachToVideo = () => {
        guardPlaylistManager();

        // Scope strictly to #movie_player to ignore homepage hover-preview videos
        const video = document.querySelector('#movie_player video.html5-main-video');
        if (!video) return false;
        if (video === attachedVideo && video.isConnected) return true;

        listenerController?.abort();
        listenerController = new AbortController();
        const { signal } = listenerController;

        attachedVideo = video;
        hasPausedThisPlay = false;

        for (const eventName of ['timeupdate', 'seeked', 'ratechange', 'playing']) {
            video.addEventListener(eventName, checkPlaybackBoundary, { signal });
        }
        for (const eventName of ['loadedmetadata', 'emptied']) {
            video.addEventListener(eventName, resetPauseState, { signal });
        }

        return true;
    };

    const mountObserver = new MutationObserver(() => {
        if (attachToVideo()) {
            mountObserver.disconnect();
        }
    });

    const syncPlayer = () => {
        hasPausedThisPlay = false;

        if (isShortsPage()) {
            mountObserver.disconnect();
            listenerController?.abort();
            listenerController = null;
            attachedVideo = null;
            return;
        }

        if (attachToVideo()) {
            mountObserver.disconnect();
            return;
        }

        if (document.body) {
            mountObserver.observe(document.body, { childList: true, subtree: true });
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', syncPlayer, { once: true });
        }
    };

    for (const eventName of ['yt-navigate-finish', 'yt-page-data-fetched', 'yt-player-updated']) {
        document.addEventListener(eventName, syncPlayer);
    }

    syncPlayer();
})();
