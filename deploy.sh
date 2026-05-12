#!/bin/bash

# 1. 최신 코드 가져오기
echo "Updating source code from GitHub..."
git pull origin main

# 2. 서비스 빌드 및 가동
echo "Building and starting MCP services..."
# --build 옵션을 넣어 수정된 코드가 즉시 반영되도록 합니다.
docker compose up -d --build

# 3. 상태 확인
echo "Checking service status..."
docker ps

echo "MCP Services updated and restarted successfully!"
echo "Check logs with: docker compose logs -f ai-detector-mcp"
