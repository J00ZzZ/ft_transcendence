#!/bin/sh
echo "🔍 Checking backend health..."
for i in $(seq 1 10); do
  if curl -sf http://backend:3000/health > /dev/null 2>&1; then
    echo "✅ Build healthy and successful: backend is responding"
    break
  fi
  echo "   Waiting for backend... attempt $i/10"
  sleep 3
done
if ! curl -sf http://backend:3000/health > /dev/null 2>&1; then
  echo "⚠️  Backend not reachable: nginx will still start"
fi
exec nginx -g "daemon off;"