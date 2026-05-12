# MCP AI Writing & Optimization System

이 프로젝트는 Gemini를 이용한 글쓰기, AI 탐지 최적화(30% 미만), 그리고 구글 독스 저장을 자동화하는 MCP(Model Context Protocol) 기반 시스템입니다.

## 1. 서버 요구사항 (Linux/Oracle Cloud)

- **OS**: Ubuntu 22.04 LTS 권장
- **도구**: Docker, Docker Compose
- **네트워크**: 3000, 3001, 3002 포트 개방 필요

## 2. 인스턴스 초기 설정

### Docker 설치 (권장 방식)
```bash
# 1. 기존 충돌 패키지 제거
sudo apt-get remove -y containerd runc

# 2. 공식 스크립트로 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. Docker Compose 설치
sudo apt-get update
sudo apt-get install -y docker-compose-plugin docker-compose

# 4. 권한 설정
sudo usermod -aG docker $USER
newgrp docker
```

## 3. 프로젝트 설치 및 실행

### 저장소 클론
```bash
git clone https://github.com/jin7659/ai-detector.git mcp-system
cd mcp-system
```

### 구글 독스 인증 설정 (credentials.json 발급 방법)

1. [Google Cloud Console](https://console.cloud.google.com/) 접속 및 프로젝트 생성
2. **API 및 서비스 > 라이브러리** 메뉴에서 다음 두 API를 검색하여 '사용' 설정:
   - **Google Docs API**
   - **Google Drive API**
3. **API 및 서비스 > 사용자 인증 정보** 메뉴로 이동
4. **[+ 사용자 인증 정보 만들기] > 서비스 계정** 선택
   - 이름 입력 후 '만들기 및 계속하기' 클릭 (역할 설정은 생략 가능)
5. 생성된 서비스 계정을 클릭하여 상세 페이지 진입 -> **[키(Keys)]** 탭 선택
6. **[키 추가] > [새 키 만들기] > JSON** 선택 후 만들기 클릭
7. 다운로드된 파일의 이름을 `credentials.json`으로 변경하여 `google-docs-mcp/` 폴더에 업로드

### 시스템 실행
```bash
chmod +x deploy.sh
./deploy.sh
```

## 4. 오라클 클라우드 방화벽 설정 (중요)

오라클 클라우드 콘솔에서 다음 두 곳의 방화벽을 열어야 외부 통신이 가능합니다.

1. **Ingress Rules (보안 리스트)**:
   - 전용 서브넷의 Security List에서 `3000`, `3001`, `3002` 포트(TCP)를 `0.0.0.0/0`에 대해 허용합니다.
2. **OS 방화벽 (Ubuntu)**:
   ```bash
   sudo ufw allow 3000/tcp
   sudo ufw allow 3001/tcp
   sudo ufw allow 3002/tcp
   sudo ufw reload
   ```

## 5. 업데이트 방법

로컬에서 코드를 수정하여 GitHub에 푸시하면, 서버에서는 다음 명령어만 실행하면 됩니다:
```bash
./deploy.sh
```

---
문의 사항은 프로젝트 관리자에게 연락하세요.
