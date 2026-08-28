FROM oven/bun:1-debian

# The native library is a GraalVM build and expects glibc, so this stays on
# Debian rather than Alpine.

WORKDIR /app/services/js

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Wallets and the shared history live above the service and are mounted in.
VOLUME ["/app/wallets", "/app/data"]

EXPOSE 3001
CMD ["bun", "run", "server.ts"]


# Links the image to the repository, so the package page shows its README.
LABEL org.opencontainers.image.source="https://github.com/itsFahham/ADASENDA"
LABEL org.opencontainers.image.description="Send ADA with an on-chain message. JavaScript service, built on Bun."
LABEL org.opencontainers.image.licenses="MIT"
