FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY package.json ./
RUN npm install -g pnpm && pnpm install --prod || npm install --omit=dev
COPY dist ./dist
COPY ../../prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/index.js"]
