FROM golang:1.26-bookworm AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/adasenda-go .

FROM debian:bookworm-slim

# libccl is fetched from a GitHub release on first use and cached under HOME, so
# the container needs a writable home and the certificates to reach it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --home-dir /home/adasenda adasenda

COPY --from=build /out/adasenda-go /usr/local/bin/adasenda-go

# The service reads ../../wallets and ../../data, so it runs from the same place
# in the tree as it does on a developer machine.
WORKDIR /app/services/go
RUN mkdir -p /app/wallets /app/data && chown -R adasenda /app

USER adasenda
VOLUME ["/app/wallets", "/app/data"]

EXPOSE 3003
CMD ["adasenda-go"]


# Links the image to the repository, so the package page shows its README.
LABEL org.opencontainers.image.source="https://github.com/itsFahham/ADASENDA"
LABEL org.opencontainers.image.description="Send ADA with an on-chain message. Go service."
LABEL org.opencontainers.image.licenses="MIT"
