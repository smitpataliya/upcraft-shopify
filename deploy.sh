#!/usr/bin/env bash
# ==============================================================================
# Upcraft Shopify — One-Click VPS Production Deployment Script
# Target: Ubuntu 22.04 / 24.04 LTS
# Domain: shopify.upcraft.tech
# Server IP: 130.210.15.24
# ==============================================================================

set -e

DOMAIN="shopify.upcraft.tech"
APP_DIR="/var/www/upcraft-shopify"
REPO_URL="https://github.com/smitpataliya/upcraft-shopify.git"
BRANCH="feat/development"
EMAIL="smit@zqhost.in"
APP_PORT=4000

echo "=========================================================="
echo "🚀 Starting Upcraft Shopify Deployment for $DOMAIN"
echo "=========================================================="

# 1. Update system & install prerequisites
echo "📦 [1/6] Updating system & installing dependencies..."
apt update -y
apt install -y curl git ufw nginx certbot python3-certbot-nginx

# 2. Install Node.js 22 LTS if not installed
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 20 ]]; then
    echo "📦 [2/6] Installing Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi
echo "✓ Node.js version: $(node -v)"
echo "✓ npm version: $(npm -v)"

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 process manager..."
    npm install -g pm2
fi

# 3. Clone or pull repository
echo "📂 [3/6] Setting up application repository..."
mkdir -p /var/www
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd "$APP_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "Cloning repository..."
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 4. Install dependencies & build client bundle
echo "🔨 [4/6] Installing packages & compiling client bundle..."
npm install
node build.js

# Ensure data directory exists for SQLite
mkdir -p "$APP_DIR/data"

# Setup production .env if not exists
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Creating production .env configuration..."
    cat <<EOF > "$APP_DIR/.env"
PORT=4000
HOST=127.0.0.1
CLIENT_ORIGIN=https://$DOMAIN
SESSION_SECRET=$(openssl rand -hex 32)
SHOPIFY_STORE=b5nyri-eu.myshopify.com
SHOPIFY_API_VERSION=2026-10
MOCK_MODE=false
EOF
fi

# 5. Start/Restart app with PM2
echo "⚡ [5/6] Starting application via PM2..."
pm2 delete upcraft-shopify 2>/dev/null || true
pm2 start src/server/index.js --name "upcraft-shopify"
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root || true

# 6. Configure Nginx Reverse Proxy
echo "🌐 [6/6] Configuring Nginx reverse proxy..."
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cat <<EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t
systemctl restart nginx

# 7. Configure Firewall
echo "🛡️ Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 8. Obtain SSL certificate via Let's Encrypt Certbot
echo "🔒 Requesting SSL Certificate for https://$DOMAIN..."
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
    echo "✓ SSL Certificate successfully installed and HTTPS redirect enabled!"
else
    echo "⚠️ Certbot could not verify DNS for $DOMAIN yet."
    echo "👉 Ensure your DNS A Record for '$DOMAIN' points to 130.210.15.24, then run: certbot --nginx -d $DOMAIN"
fi

echo "=========================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "App running at: https://$DOMAIN"
echo "PM2 Status: pm2 status"
echo "Logs: pm2 logs upcraft-shopify"
echo "=========================================================="
