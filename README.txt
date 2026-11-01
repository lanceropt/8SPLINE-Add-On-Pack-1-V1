================================================================
 POWER TOOLS for 8SPINE - INSTALL GUIDE
================================================================

WHAT'S IN THIS FOLDER
  power-tools.js   the module (tweak engine + command console)
  source.json      the "source" file the app reads to list the module
  installer.html   optional one-tap "open in 8SPINE" page (Safari/iPhone)

WHAT IT DOES (v1.0.0)
  - Audio normalization: forces the app's normalization flags ON
  - Ad-free mode: for people who ALREADY pay for Premium - flips the
    app-side premium flags and neutralizes ad calls/components
    (no DRM or stream logic is touched)
  - Volume sync: mirrors the player volume slider with iOS system volume
  - Badges: hides everything below Lossless; Lossless and Dolby Atmos
    stay (icon styling will be tuned in v1.1 after we see internals)
  - Settings section: adds a Power Tools block at the top of Settings
  - Command console: open the module and search: help / status / diag

================================================================
 STEP 1 - HOST THE TWO FILES (iPhone only, ~2 minutes)
================================================================
Use this private GitHub repository. The raw URLs below are already wired into `source.json`:

 1. Open this repository in Safari and open `source.json`.
 2. Tap the **Raw** button. Copy the raw URL; this is your source URL.
 3. The `download` value already points to the raw `power-tools.js` file in this repository.
 4. If GitHub Raw is unavailable inside 8SPINE because the repository is private,
    use a public host or a secret gist instead; the app must be able to fetch the URLs.


================================================================
 STEP 2 - IMPORT INTO THE APP (two ways)
================================================================

 WAY A - One tap (same flow as the module library site):
   Open installer.html in Safari (host it anywhere, or open the file
   from Files), paste your source.json raw URL, tap
   "Add source to 8SPINE".
   The site you know just builds these links - the app's real scheme is:
     eightspine://source?url=<encoded source.json URL>
     eightspine://install?url=<encoded module file URL>
   So you can also make the link yourself:
     eightspine://source?url=https%3A%2F%2Fraw.githubusercontent.com%2Flanceropt%2F8SPLINE-Add-On-Pack-1-V1%2Fmain%2Fsource.json

 WAY B - Manual (always works):
   8SPINE -> Sources / Add Source -> paste the raw URL of source.json.

 Then: install "Power Tools" from the source list, tap OPEN.

================================================================
 STEP 3 - VERIFY + TUNE
================================================================
 1. Open the Power Tools module -> search box is a console.
 2. Type:  status   (quick view)   or   diag   (full diagnostics)
 3. If something isn't working yet (e.g. "volmgr not found"), run
    "diag" and also try "scan volume", "scan badge", "scan ad",
    "scan normal" - then send the output back so the patches can be
    aimed precisely in v1.1.
 4. Commands: norm|ads|prem|badges|vol|ui on/off, stores, log, reset.

NOTES
 - Tweaks re-apply every time you tap OPEN on the module (one tap after
   launching the app is enough).
 - Toggles persist via AsyncStorage when it's found.
 - The Settings section is defensive: if anything fails to render it
   falls back to the original Settings page. Disable with: ui off
 - Icons: v1 fixes the badge TEXT; custom Lossless / Dolby icons will
   be embedded in v1.1 once diag shows how the app builds badges.
 - This module does NOT bypass DRM and does not touch streams.
================================================================
