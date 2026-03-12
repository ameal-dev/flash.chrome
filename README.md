# Flash Yank

EasyMotion-style text jumping for Chrome. Type to search, jump to matches, then use Vimium's visual mode to select and yank.

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable Developer Mode
4. Click "Load unpacked" → select this directory

## Usage

1. Press **Hyper+B** (`Cmd+Ctrl+Alt+Shift+B`) to activate
2. Type 2+ characters to search for visible text
3. Type the hint label to jump to a match
4. Press `v` for Vimium visual mode, select text, `y` to yank

Press **Escape** to cancel at any time.

## Requirements

- [Vimium](https://chrome.google.com/webstore/detail/vimium/dbepggeogbaibhgnhhndojpepiihcmeb) for visual mode and yanking
- Hyper key mapped via [Karabiner-Elements](https://karabiner-elements.pqrs.org/) (or similar)
