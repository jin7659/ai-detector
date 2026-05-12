#!/bin/bash

# .env 파일 로드 (API 키 등)
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# 최신 이미지 풀
docker compose pull

# 서비스 재시작
docker compose up -d

echo "MCP Services updated and restarted successfully!"
