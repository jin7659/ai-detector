FROM node:20-slim

WORKDIR /app

# 빌드 도구 및 캐시 디렉토리 설정
ENV TRANSFORMERS_CACHE=/app/.cache
RUN mkdir -p /app/.cache && chmod -R 777 /app/.cache

COPY package*.json ./
RUN npm install

# 모델 사전 다운로드 (빌드 시점에 수행)
COPY download-model.js ./
RUN node download-model.js

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
