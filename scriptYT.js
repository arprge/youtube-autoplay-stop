// ==UserScript==
// @name         YouTube Autoplay Stop
// @namespace    https://github.com/arprge/youtube-autoplay-stop
// @version      3.2.0
// @description  Prevents autoplay on YouTube Watch Later playlist
// @author       Alan
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/arprge/youtube-autoplay-stop
// @updateURL    https://github.com/arprge/youtube-autoplay-stop/raw/main/scriptYT.js
// @downloadURL  https://github.com/arprge/youtube-autoplay-stop/raw/main/scriptYT.js
// ==/UserScript==

(function() {
    'use strict';

    const PAUSE_THRESHOLD = 1;
    const MONITOR_WINDOW = 60;
    const CHECK_INTERVAL = 1000;
    const WATCH_LATER_LIST = 'WL';

    let lastUrl = location.href;
    let currentVideo = null;
    let listenerActive = false;
    let paused = false;

    function getVideo() {
        if (currentVideo && currentVideo.isConnected) return currentVideo;
        currentVideo = document.querySelector('video.html5-main-video') ||
                       document.querySelector('video.video-stream') ||
                       document.querySelector('#movie_player video') ||
                       document.querySelector('video');
        return currentVideo;
    }

    function isWatchLater() {
        return new URLSearchParams(window.location.search).get('list') === WATCH_LATER_LIST;
    }

    function onTimeUpdate() {
        const video = this;
        if (video.paused || !video.duration || paused) return;

        if (video.duration - video.currentTime < PAUSE_THRESHOLD) {
            video.pause();
            paused = true;
        }
    }

    function check() {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            currentVideo = null;
            listenerActive = false;
            paused = false;
        }

        const video = getVideo();

        if (!video || !isWatchLater() || isNaN(video.duration)) {
            if (listenerActive) {
                video?.removeEventListener('timeupdate', onTimeUpdate);
                listenerActive = false;
            }
            setTimeout(check, CHECK_INTERVAL);
            return;
        }

        const timeLeft = video.duration - video.currentTime;
        const nearEnd = timeLeft < MONITOR_WINDOW;

        if (nearEnd && !listenerActive) {
            video.addEventListener('timeupdate', onTimeUpdate);
            listenerActive = true;
        } else if (!nearEnd && listenerActive) {
            video.removeEventListener('timeupdate', onTimeUpdate);
            listenerActive = false;
        }

        setTimeout(check, CHECK_INTERVAL);
    }

    setTimeout(check, 2000);
})();
