FROM oven/bun:1-debian AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80


# Links the image to the repository, so the package page shows its README.
LABEL org.opencontainers.image.source="https://github.com/itsFahham/ADASENDA"
LABEL org.opencontainers.image.description="Dashboard for ADASENDA. Pick a language service and send a postcard on Cardano preprod."
LABEL org.opencontainers.image.licenses="MIT"
