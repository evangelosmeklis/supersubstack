# Substack Reader

Substack Reader is a simple Chrome extension that makes long Substack posts easier to read.

## What it does

- Adds a reading progress bar at the top of Substack articles
- Shows your current reading percentage while you scroll
- Offers an optional bionic reading mode to bold the start of words
- Lets you choose light, medium, or strong bionic reading intensity

## How it works

The extension injects a content script into Substack article pages and applies lightweight reading helpers without changing the original article content permanently.

## Files

- `manifest.json` - Chrome extension configuration
- `content.js` - progress bar and bionic reading logic
- `content.css` - injected styles for the reading UI
- `popup.html` / `popup.js` - extension popup controls

## Install locally

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select this project folder

## Usage

Open any Substack article, click the extension icon, and toggle the reading tools you want.
