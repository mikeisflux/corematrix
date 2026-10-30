# Deploying on a VPS

`scripts/deploy.sh` builds and reloads the app under pm2 on port 3000. What sits in front of it decides most of what a
visitor feels: the hall is a 3D game that pulls a hundred small files on arrival and streams a film, and a Node process
behind a bare port is the slowest way to serve those. This is the setup the app is tuned for.

## nginx in front (HTTP/2, static files served directly, streams unbuffered)

Install nginx and certbot, point the domain at the server, then use this as `/etc/nginx/sites-available/forevercomiccon`
(symlink it into `sites-enabled`, remove `default`, `nginx -t`, `systemctl reload nginx`). Adjust the paths if the app
lives somewhere other than `/srv/fcc/app`.

```nginx
# cache the upstream's compressed responses? no: the app already gzips; nginx adds brotli/gzip for static files below
gzip on;
gzip_types text/plain text/css application/javascript application/json application/vnd.apple.mpegurl model/gltf-binary image/svg+xml;
gzip_min_length 1024;
gzip_vary on;

upstream fcc { server 127.0.0.1:3000; keepalive 32; }

server {
  listen 80;
  server_name forevercomiccon.com www.forevercomiccon.com;
  return 301 https://forevercomiccon.com$request_uri;
}

server {
  listen 443 ssl;
  http2 on;
  server_name forevercomiccon.com;
  # certbot fills these in: certbot --nginx -d forevercomiccon.com -d www.forevercomiccon.com
  ssl_certificate     /etc/letsencrypt/live/forevercomiccon.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/forevercomiccon.com/privkey.pem;

  client_max_body_size 64m;     # theater uploads arrive in 8 MB chunks; everything else is small
  root /srv/fcc/app/public;

  # Built assets: content-hashed, so a year is safe. Served by nginx straight from disk, never by Node.
  location /_next/static/ {
    alias /srv/fcc/app/.next/static/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    access_log off;
  }
  # Models, lighting map, marketing art, icons: a day, then refreshed in the background.
  location ~ ^/(models|hdri|marketing)/ {
    add_header Cache-Control "public, max-age=86400, stale-while-revalidate=2592000";
    types { model/gltf-binary glb; image/vnd.radiance hdr; }
    access_log off;
  }

  # Live events and the film: pass bytes through as they come. Buffering here turns a stream into a stall.
  location ~ ^/api/(live|theater/) {
    proxy_pass http://fcc;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;       # /api/live is a long-lived server-sent-events stream
  }

  location / {
    proxy_pass http://fcc;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Why each part matters:

- **HTTP/2** lets the browser fetch the hall's hundred files over one connection instead of six at a time. On a
  transatlantic link that alone cuts the arrival time by seconds.
- **Static files from nginx** (`/_next/static`, `/models`, `/hdri`, `/marketing`) skip Node entirely: `sendfile`, proper
  `Last-Modified`/`ETag`, and no event-loop time spent pumping bytes.
- **`proxy_buffering off` on `/api/live` and `/api/theater/`**: with buffering on, nginx holds the upstream response until
  it has a buffer's worth or the response ends. For the live stream that delays every event; for a film it means the
  player waits for whole chunks and the screen moves in jerks.
- **`client_max_body_size`**: uploads are chunked, so 64 MB is plenty. Without this nginx answers 413 on the first chunk.

## A CDN in front of nginx

The server is in Germany. A visitor in the US pays about 100 ms each way for every request, and the hall makes many.
Putting Cloudflare (free tier) in front caches the static files at a location near the visitor: change the domain's
nameservers to Cloudflare's, keep "Full (strict)" TLS, and leave the proxy on. Nothing in the app needs to change; the
cache headers above tell Cloudflare what it may keep. Two settings to check in the Cloudflare dashboard:

- **Caching → Browser Cache TTL: Respect Existing Headers.**
- Do not enable "Rocket Loader" or auto-minify for JavaScript: the hall's scripts are already minified, and rewriting
  them breaks the module loader.

The film segments (`/api/theater/hls/...`) are marked immutable and will be cached at the edge too; the playlist is
refreshed every five minutes.

## The theater

Films need `ffmpeg` on the server (`sudo apt install ffmpeg`). After an upload the app encodes each film into an HLS
stream (4-second segments, 360p ≈ 600 kbps and 720p ≈ 2 Mbps; the player picks the rung a viewer's connection can
carry and steps up or down as it changes) plus a fallback MP4 for browsers without Media Source Extensions. Films
uploaded before this existed show no **HLS** badge on Admin → Theater; press **Downsample** on each to encode them.
Without ffmpeg, films play as uploaded, as one progressive MP4.

## Checks after a deploy

```bash
sudo -u fcc pm2 list                  # restarts should only climb on deploys
tail -n 50 /srv/fcc/logs/err.log      # should be quiet
curl -sI https://forevercomiccon.com/models/robot.glb | grep -i "cache-control\|server"   # nginx, a day's cache
curl -sI https://forevercomiccon.com/_next/static/chunks/ 2>/dev/null | head -1
```
