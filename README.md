# 🚀 Instagram Reels Sorter v3.0

[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)]()

**Instagram Reels Sorter** is a powerful, zero-dependency Vanilla JavaScript tool designed to automatically extract, sort, and export Instagram Reels data directly from your browser. 

Whether you are a social media manager, content creator, or data analyst, this script provides an effortless way to scrape Instagram Reels views, likes, and URLs, outputting a cleanly formatted CSV file sorted by highest views.

<img width="1366" height="605" alt="Screenshot 2026-05-20 143222" src="https://github.com/user-attachments/assets/27c5fdc4-16d5-4a2c-ab9b-4e068165042e" />
<img width="1366" height="610" alt="Screenshot 2026-05-20 143234" src="https://github.com/user-attachments/assets/a72230cf-3fa7-416a-a25d-adfe6dfbbc4a" />

## ✨ Key Features

* **🚀 Zero Setup Required:** Runs entirely in the browser console. No Python, Node.js, or API keys needed.
* **📊 Automated Data Extraction:** Captures Reels URLs, shortcodes, view counts, and like counts dynamically.
* **🤖 Smart Auto-Scrolling:** Automatically scrolls through the profile's Reels feed to load historical content, with adaptive pausing to avoid rate limits.
* **⚡ Real-Time Mutation Observer:** Instantly catches new Reels as they are injected into the DOM, eliminating lag.
* **🎛️ Glassmorphism Floating HUD:** Features a sleek, draggable UI panel tracking real-time stats (speed, total gathered, time elapsed, and top 3 performing Reels).
* **📈 CSV Export:** Automatically sorts the extracted data by view count and generates a timestamped `.csv` file for easy spreadsheet analysis.

## 🛠️ Tutorial: How to Use

Follow these simple steps to run the Instagram Reels Sorter and export your data.

### Step 1: Navigate to the Target Profile
Open your desktop web browser (Chrome, Edge, Firefox, or Safari) and go to the exact Reels tab of the desired Instagram profile:
`https://www.instagram.com/USERNAME/reels/`

### Step 2: Open the Developer Console
Press `F12` on your keyboard, or right-click anywhere on the page and select **Inspect**. Navigate to the **Console** tab.

> **⚠️ Note on "Allow Pasting":** > For security reasons, modern browsers and Instagram may block pasting scripts. If you see a warning in the console, simply type `allow pasting` (or whatever exact phrase the browser asks for), hit **Enter**, and then proceed to the next step.

### Step 3: Run the Script
Copy the entire source code of the `Instagram Reels Sorter v3.0` script. Paste it into the console and hit **Enter**.

### Step 4: Monitor the Live HUD
A floating, dark-mode panel will appear in the bottom right corner of your screen. The script will begin auto-scrolling the page. You can monitor:
* The total number of Reels found.
* Your real-time Top 3 Reels.
* Extraction speed and elapsed time.

### Step 5: Download Your CSV
The script will automatically stop when it reaches the bottom of the page or hits the maximum safety scroll limit. 
* To export the data, click the **⬇ Baixar CSV** (Download CSV) button on the floating panel.
* If you want to stop the process early and download what has been collected so far, click **⏹ Parar coleta** (Stop Collection).

---

## ⌨️ Advanced Console Shortcuts

If you prefer to control the script via the console instead of the floating UI, you can use the following global methods:

* `window.__reelsDownloadCSV()`: Forces the generation and download of the CSV file immediately.
* `window.__reelsGetData()`: Returns an array of objects containing all scraped data so far (useful if you want to pipe the JSON data into another script).
* `window.__reelsStop()`: Safely halts the auto-scrolling and data collection process.

## ⚙️ Configuration Variables

If you want to tweak the script's behavior before pasting it, look for the `CFG` object at the top of the code. You can adjust:
* `scrollPause` *(default: 900)*: Milliseconds to wait after each scroll. Increase this if your internet is slow or Instagram is failing to load new images.
* `scrollStep` *(default: 1100)*: Amount of pixels to scroll per cycle.
* `maxTotalScrolls` *(default: 800)*: Absolute safety ceiling to prevent infinite loops.

## ⚠️ Disclaimer

This tool is intended for **educational and personal analytical purposes only**. It interacts directly with the DOM and relies on Instagram's current frontend structure. 
* **Do not abuse this script.** Running it aggressively on hundreds of profiles per day may result in your Instagram account or IP address being temporarily rate-limited or restricted by Meta.
* Because Instagram frequently updates its web structure, DOM selectors (`div`, `span`, `aria-label`) may change over time, which could require minor updates to the `extractViews` and `extractLikes` functions.

## 🤝 Contributing
Feel free to fork this repository, submit Pull Requests, or open Issues if you notice Instagram has changed their DOM structure and the scraper needs updating.
