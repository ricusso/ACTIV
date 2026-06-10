#!/bin/bash

sudo apt update && sudo apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your_secure_password';"
sudo -u postgres createdb ludo_db

sudo apt install -y nginx certbot python3-certbot-nginx

cat <<EOF | sudo tee /etc/nginx/sites-available/bicepscoin.net
server {
    server_name bicepscoin.net www.bicepscoin.net;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/bicepscoin.net /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

sudo npm install -g pm2

echo "✅ Сервер настроен! Теперь залейте файлы, настройте .env и запустите: pm2 start server.js"
