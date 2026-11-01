# 8SPINE public references

- Official module docs: https://8spine.club/documentation
  - Public contract documents `searchTracks(query, limit)`, `getTrackStreamUrl(id, quality)`, optional album/artist methods.
  - It does not document Settings-page or runtime-patching hooks.
- Public module library: https://8spine-modules.vercel.app/
- Working encoded reference: https://raw.githubusercontent.com/KissAnotherDay/Geolier2-8spine/main/Geolier_tidal.8spine
  - The attached user file matches this public file exactly; SHA-256: 0d174489fd7c46c7b8f5b756f461e808d01f8c618ccb14032a381a2dda60d7ad.
- Public Parasy8 repository: https://github.com/lvwmwm/8spine
  - Loader: https://raw.githubusercontent.com/lvwmwm/8spine/main/loader/loader.js
  - Bundle: https://raw.githubusercontent.com/lvwmwm/8spine/main/dist/spine.js
  - Settings UI: https://raw.githubusercontent.com/lvwmwm/8spine/main/bundle/ui.js
  - Settings hook: https://raw.githubusercontent.com/lvwmwm/8spine/main/bundle/settings.js
  - Metro discovery: https://raw.githubusercontent.com/lvwmwm/8spine/main/bundle/metro.js
  - Source: https://raw.githubusercontent.com/lvwmwm/8spine/main/source.json

Findings: Parasy8 exposes `SPINE.metro`, `SPINE.ui.injectIntoSettings`, and `SPINE.registerMod`; its UI bundle discovers React/RN/layout modules and injects a row into the real Settings page. The companion module uses only those exposed interfaces and does not include `__r`, `globalThis`, dynamic `Function`, `eval`, or `self`.
