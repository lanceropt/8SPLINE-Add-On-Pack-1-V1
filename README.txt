================================================================
 POWER TOOLS COMPANION for 8SPINE - INSTALL GUIDE
================================================================

This build is a companion module. It requires the public Parasy8 loader
because ordinary source modules do not expose the app Settings page or
internal module registry.

LEGITIMATE SCOPE
  - Adds a Power Tools row to Settings when the loader can find the app page.
  - Provides a normalization control when a compatible state store is found.
  - Does not bypass Premium, remove ads, alter DRM, or modify streams.

INSTALL ORDER
  1. Add the Parasy8 source first:
     https://raw.githubusercontent.com/lvwmwm/8spine/main/source.json
  2. Install and open the Parasy8 loader module.
  3. Add this package source using the URL supplied with this release.
  4. Install Power Tools Companion.
  5. Fully close and reopen 8SPINE, then open the normal Settings page.
  6. Look for a Power Tools row. Tap it to toggle normalization.

IMPORTANT
  The companion only activates when Parasy8 exposes SPINE.metro and SPINE.ui.
  If the row does not appear, the loader did not initialize or the current
  8SPINE build changed its internal Settings component.

================================================================
