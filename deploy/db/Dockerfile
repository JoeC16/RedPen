# Red Pen's database on Fly.io: the official PostgreSQL 16 image, plus a
# first-start script that creates the two roles the app needs (see init.sh).
FROM postgres:16-bookworm
COPY init.sh /docker-entrypoint-initdb.d/10-redpen.sh
