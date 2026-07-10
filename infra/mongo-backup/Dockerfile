FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg ca-certificates awscli cron \
    && curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
    && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update && apt-get install -y --no-install-recommends mongodb-database-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backup.sh entrypoint.sh ./
RUN chmod +x backup.sh entrypoint.sh

CMD ["./entrypoint.sh"]
