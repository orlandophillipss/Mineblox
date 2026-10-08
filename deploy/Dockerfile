FROM node:24-bookworm-slim AS node
FROM eclipse-temurin:21-jre-jammy
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 mineblox && useradd --uid 10001 --gid mineblox --create-home mineblox
WORKDIR /app
COPY --chown=mineblox:mineblox . .
RUN npm ci --ignore-scripts && mkdir -p .local && chown mineblox:mineblox .local
USER mineblox
ENV MINEBLOX_DEPLOYMENT=true
VOLUME ["/app/.local"]
CMD ["node", "tools/launcher.js", "--no-studio"]
