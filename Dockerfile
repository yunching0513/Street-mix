# Streetmix+ Innovation — web app image
#
# Build:  docker build -t streetmix .
# Run:    docker run -p 8000:8000 streetmix
# Open:   http://localhost:8000
#
# Runs in OFFLINE_MODE (no Auth0/Postgres needed) — same behavior as
# the packaged Mac app. Works on any Docker host: local machine,
# Zeabur, Fly.io, Railway, Google Cloud Run, a VPS, etc. Hosts that
# inject their own PORT env var are respected automatically.

# If Docker Hub rate-limits you, pass a mirror, e.g.:
#   docker build --build-arg BASE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim .
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

WORKDIR /streetmix

ENV CYPRESS_INSTALL_BINARY=0

# The lockfile pins @electron/node-gyp (an electron-builder dev dep)
# to a git+ssh URL. The slim image has no git and the build has no
# ssh keys, so install git and rewrite ssh github URLs to https.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

COPY . .

RUN npm ci --include=dev --no-audit --no-fund

# Build workspaces + client bundle, then pre-generate the SVG sprites
# (same trick as the Electron prebuild) so the server doesn't have to
# compile them on every container start. Finally drop devDependencies
# — they exist only to run the build and roughly halve the image.
RUN npm run build:prod \
  && OFFLINE_MODE=true node --experimental-strip-types -e "import('./app.ts').then(()=>process.exit(0))" \
  && (npm prune --omit=dev --no-audit --no-fund || echo "prune skipped") \
  && rm -rf .parcel-cache /root/.npm

ENV NODE_ENV=production \
    OFFLINE_MODE=true \
    PORT=8000

EXPOSE 8000

CMD ["node", "--experimental-strip-types", "index.ts"]
