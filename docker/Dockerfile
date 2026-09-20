# syntax=docker/dockerfile:1

# Tablemarks — private deployment target: nginx serving the SPA at the site root.
#
# The backend location is NOT a build argument (KD2/R3). A build-time value would ship the
# private hostname inside the image and inside every public build log; the operator supplies it
# when the container starts, via TABLEMARKS_POCKETBASE_URL.
#
# Build from the repository root:
#   docker build -f docker/Dockerfile -t tablemarks-app .

# ---------------------------------------------------------------------------
# Build stage
#
# The major is an ARG rather than a literal in the FROM line. `.nvmrc` is what pins it for local
# development and for both workflows, but a Dockerfile cannot read that file — so the one copy
# this repository cannot avoid lives where its other pinned version already does, next to
# Dockerfile.pocketbase's POCKETBASE_VERSION. Bumping the major means editing `.nvmrc`,
# `package.json`'s `engines` and the default below together.
#
# Pinned to the *build* platform, not the target. The multi-arch publish builds this Dockerfile
# once per target architecture, and without this the whole Node build -- `npm ci` plus the
# bundler -- would be replayed under QEMU emulation for arm64 to produce byte-identical output:
# the bundle is static JS/CSS with no native dependency. Only the nginx stage below, which is a
# COPY and a chmod, is worth emulating. Same reasoning as GrooveMark's app image.
#
# This requires BuildKit, which predefines BUILDPLATFORM. The legacy builder does not, and
# fails here with an empty-platform error -- install the buildx component to build locally.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build

WORKDIR /app

# The husky `prepare` script has no job inside an image built from a context with no .git.
ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` (tsc --noEmit && vite build) — the private target. No `--mode demo`, no
# `--base`: this build is served from the site root.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — only the built output crosses over.
# ---------------------------------------------------------------------------
FROM nginx:1.29-alpine AS runtime

# Restrict the image's template substitution to our own variables, so nginx's $uri / $host /
# $request_uri are never eaten by an unrelated variable in the operator's environment.
ENV NGINX_ENVSUBST_FILTER=^TABLEMARKS_

# Declared empty so the value always exists for substitution and the "no backend" state is the
# default. This is deliberately not a hostname — see KD2 above.
ENV TABLEMARKS_POCKETBASE_URL=""

# The stock server block is replaced by our template's output; remove it so nothing can serve
# from it if templating is ever disabled.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf /etc/nginx/templates/default.conf.template

# NOT a template, and deliberately not under /etc/nginx/conf.d/. The image's envsubst step
# renders /etc/nginx/templates/*.template into conf.d/, where the main config includes every
# *.conf at http level -- these headers would then apply to every server block and be sent
# twice. The one environment-dependent value reaches this file through $tablemarks_csp, which
# the template sets at server level.
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf

# The explicit chmod pins the executable bit into the layer regardless of the mode on the build
# host — and, unlike `COPY --chmod`, works on the legacy builder as well as BuildKit. A
# non-executable script in /docker-entrypoint.d/ is skipped with only a log line, which would
# leave the app with the committed empty config.json and no visible failure.
COPY docker/docker-entrypoint.d/30-write-config.sh /docker-entrypoint.d/30-write-config.sh
RUN chmod 0755 /docker-entrypoint.d/30-write-config.sh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Same endpoint the orchestrator polls (R10). busybox wget — the alpine image has no curl.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

# No CMD override: /docker-entrypoint.d/ only runs when the command is nginx, and the base
# image already sets `nginx -g "daemon off;"`.
