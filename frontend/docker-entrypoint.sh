#!/bin/sh
# frontend/docker-entrypoint.sh
# Railway exposes $PORT dynamically — swap the placeholder before nginx starts

PORT="${PORT:-80}"
sed -i "s/PORT_PLACEHOLDER/$PORT/g" /etc/nginx/conf.d/default.conf
exec "$@"
