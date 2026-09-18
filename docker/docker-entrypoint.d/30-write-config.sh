#!/bin/sh
#
# Write the app's runtime configuration file from the environment (KD2/KTD5).
#
# The image's documented template mechanism renders into a single output directory meant for
# nginx configuration (/etc/nginx/conf.d), and that directory is already in use for
# default.conf. Redirecting it at a web-root asset would give up nginx templating entirely, so
# the web-root asset is written here instead, by a script in /docker-entrypoint.d/.
#
# Ordering: /docker-entrypoint.sh runs this directory through `sort -V`, and "30-write-config"
# sorts after the image's own "30-tune-worker-processes" (and after 10-, 15-, 20-), so the
# nginx templates have already been rendered by the time this runs. The file must stay
# executable and keep its .sh suffix, or the entrypoint skips it with only a log line.
#
# The mechanism runs only when the container command is nginx — do not override the command.

set -eu

ME=$(basename "$0")

entrypoint_log() {
    if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
        echo "$ME: $*"
    fi
}

# Same variable that fills connect-src in the nginx template. Unset or empty is a valid,
# supported state: it means "this deployment has no backend", which the app reads as `absent`
# rather than as an error (src/sync/runtimeConfig.ts).
url="${TABLEMARKS_POCKETBASE_URL:-}"
output="${TABLEMARKS_CONFIG_PATH:-/usr/share/nginx/html/config.json}"

# Fail fast on a value that cannot be embedded safely. The file below is JSON and the nginx
# template above is a config file, so a quote, backslash, semicolon, space or newline in the
# value would silently produce a broken artifact rather than a visible error. The pattern also
# mirrors the app's own rule: an http:// origin is only accepted for loopback.
if [ -n "$url" ]; then
    if ! printf '%s' "$url" | grep -Eq '^https?://[A-Za-z0-9._-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$'; then
        echo "$ME: ERROR: TABLEMARKS_POCKETBASE_URL is not a plain http(s) URL: $url" >&2
        exit 1
    fi
    # http:// is accepted only for loopback, and "loopback" has to mean exactly what the app means
    # by it (`isSecureOrLoopback`, src/sync/runtimeConfig.ts): literal localhost, or a 127.x.x.x
    # address. The `http://127.*` glob this replaces also matched `127.example.com` and
    # `127.0.0.1.evil.com` — ordinary hostnames somebody else owns. The container booted without
    # complaint, the app then rejected the value, and every visitor got "Server unreachable" with
    # nothing in the logs to explain it (review #7).
    case "$url" in
        https://*) ;;
        *)
            if ! printf '%s' "$url" | grep -Eq '^http://(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+)(:[0-9]+)?(/.*)?$'; then
                echo "$ME: ERROR: TABLEMARKS_POCKETBASE_URL must use https:// unless the host is loopback: $url" >&2
                exit 1
            fi
            ;;
    esac
fi

# A here-document rather than envsubst on a template file: envsubst is present in this image
# (/usr/bin/envsubst) and is what renders the nginx template, but this file has exactly one
# field and shipping a second template just to hold it buys nothing.
#
# This file is world-readable by construction — it is served to every visitor. It carries the
# backend URL and nothing else; never add a secret here, or to the variable that fills it.
cat > "$output" <<EOF
{
  "pocketbaseUrl": "$url"
}
EOF

if [ -n "$url" ]; then
    entrypoint_log "wrote $output with pocketbaseUrl=$url"
else
    entrypoint_log "wrote $output with an empty pocketbaseUrl (no backend configured)"
fi
