#!/usr/bin/env bash
# Export the Expo mobile app as the /m web app (the no-TestFlight pseudo-app:
# save the URL to the home screen). Run from the repo root; commit web-m after.
#
#   bash scripts/export-mobile-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."

(cd mobile && npx expo export --platform web)
rm -rf web-m
cp -r mobile/dist web-m

python3 - <<'PYEOF'
p = 'web-m/index.html'
h = open(p).read()

# Full-bleed standalone mode needs viewport-fit=cover for safe-area insets.
h = h.replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"')

# Home-screen icon + standalone chrome + dark background (no white flash) +
# Dynamic Type mirroring (scale text to the iOS system text size, like native).
h = h.replace('<link rel="icon" href="/m/favicon.ico" /></head>', '''<link rel="icon" href="/m/favicon.ico" />
  <link rel="apple-touch-icon" href="/m/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="ForecastRange" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#0f1117" />
  <style>body { background:#0f1117; }</style>
  <script>
  (function(){
    try {
      var probe = document.createElement('div');
      probe.style.cssText = 'font:-apple-system-body;position:absolute;visibility:hidden';
      document.documentElement.appendChild(probe);
      var px = parseFloat(getComputedStyle(probe).fontSize) || 17;
      probe.parentNode.removeChild(probe);
      var pct = Math.round(px / 17 * 100);
      if (pct > 102) document.documentElement.style.webkitTextSizeAdjust = pct + '%';
    } catch (e) {}
  })();
  </script>
  </head>''')

open(p, 'w').write(h)
print('patched', p)
PYEOF

# 180px apple-touch-icon from the app icon
python3 - <<'PYEOF'
from PIL import Image
Image.open('mobile/assets/icon.png').resize((180, 180), Image.LANCZOS).save('web-m/apple-touch-icon.png')
print('icon ok')
PYEOF

echo "done — review 'git status' and commit web-m"
