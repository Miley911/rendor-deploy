FROM node:20-slim

# Playwright / Chromium system deps
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-color-emoji \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium — no extra 300MB download
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# shots dir
RUN mkdir -p shots

EXPOSE 3000
CMD ["node", "dist/server.js"]
