#!/usr/bin/env sh
# Refuse a tree, or a build, that would put a service worker or a web manifest on the GitHub Pages
# origin.
#
# Why this is worth a gate at all: vite.config.ts disables the worker in `--mode demo` with a plain
# `disable`, not `selfDestroying`. That is only safe while nothing has ever registered a worker on
# that origin — a single deploy from a tree without the demo-mode handling would install one
# permanently, on an origin with no way to reach back and unregister it.
#
# Why it is a script and not two inline workflow steps: it has to run on the pull request, where the
# damage is still preventable, and at deploy time, where it is the last line. Two copies of a guard
# drift, and the copy that drifts is the one nobody watches.
#
# Usage:
#   scripts/check-demo-target.sh              # source guard only (safe before a build)
#   scripts/check-demo-target.sh dist         # source guard, then the built artifact
#
# Runs under `sh`: the only consumers are CI runners and a developer checking before pushing.

set -eu

status=0

fail() {
    # The `::error` prefix is a no-op outside Actions, so local runs read fine too.
    echo "::error::$1" >&2
    status=1
}

# ---------------------------------------------------------------------------------------------
# Source guard — reads intent, and can run before anything is installed or built.
# ---------------------------------------------------------------------------------------------
if [ ! -f vite.config.ts ]; then
    fail "vite.config.ts not found. Run this from the repository root."
    exit 1
fi

grep -q "mode === 'demo'" vite.config.ts ||
    fail "vite.config.ts does not discriminate the demo mode. Publishing this tree would put a service worker on the Pages origin, which cannot then be unregistered from here."

grep -q 'disable: isDemo' vite.config.ts ||
    fail "vite.config.ts does not disable the PWA in demo mode. Publishing this tree would put a service worker and a web manifest on the Pages origin."

# ---------------------------------------------------------------------------------------------
# Artifact guard — reads the bytes that would be uploaded. Only when a directory is given.
# ---------------------------------------------------------------------------------------------
dist=${1:-}
if [ -n "$dist" ]; then
    if [ ! -d "$dist" ]; then
        fail "$dist is not a directory. Build the demo target before checking its artifact."
        exit 1
    fi

    # 1. The default filenames. A fast, readable first pass — but only that: renaming an output
    #    would slip past it, which is why the two property checks below exist as well.
    offenders=$(find "$dist" -maxdepth 1 \
        \( -name 'sw.js' -o -name 'workbox-*.js' -o -name '*.webmanifest' -o -name 'registerSW.js' \) \
        -print)
    [ -z "$offenders" ] ||
        fail "The demo build produced service worker or manifest files, which must never reach the Pages origin: $(echo "$offenders" | tr '\n' ' ')"

    # 2. Nothing anywhere in the bundle may reach for the service worker API, whatever the file is
    #    called. A verified demo build contains this string zero times; the private build contains
    #    it in the app bundle and in workbox-window.
    registrars=$(grep -rl 'serviceWorker' "$dist" 2>/dev/null || true)
    [ -z "$registrars" ] ||
        fail "The demo build references the serviceWorker API, so something would register one on the Pages origin: $(echo "$registrars" | tr '\n' ' ')"

    # 3. No manifest link in the shell. This is what removes the install prompt, and it is a
    #    separate property from the manifest file existing — a link to a missing file is still a
    #    link the browser acts on.
    if [ -f "$dist/index.html" ] && grep -q 'rel="manifest"' "$dist/index.html"; then
        fail "$dist/index.html links a web manifest, which the demo target must not ship."
    fi
fi

if [ "$status" -ne 0 ]; then
    echo "Refusing the demo target. See docs/how-to/deployment.md." >&2
    exit 1
fi

echo "demo target OK${dist:+ (source + $dist)}"
