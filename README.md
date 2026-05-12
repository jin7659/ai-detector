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

## 3. 설치 및 실행 가이드

### 1단계: GitHub에서 소스 코드 가져오기
서버의 원하는 디렉토리에서 아래 명령어를 실행하여 프로젝트를 클론합니다.
```bash
git clone https://github.com/jin7659/ai-detector.git mcp-system
cd mcp-system
```

### 2단계: 최신 상태 유지 (업데이트 시)
이미 설치된 상태에서 최신 기능이나 패치를 적용하려면 아래 명령어를 실행하세요.
```bash
git pull origin main
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

## 7. 로컬 클라이언트 연동 (Gemini CLI / Desktop App)

로컬 컴퓨터에서 제미나이가 오라클 서버의 도구를 사용하도록 설정하는 방법입니다.

### 1단계: 설정 파일 수정
로컬 PC의 `~/.gemini/settings.json` 파일을 열고 아래 내용을 추가합니다.

```json
{
  "mcpServers": {
    "ai-detector": {
      "url": "http://158.179.20.33:3001/sse"
    },
    "google-docs": {
      "url": "http://158.179.20.33:3002/sse"
    }
  }
}
```

### 2단계: 연동 확인
설정 저장 후 `gemini-cli` 또는 제미나이 앱을 재시작하면, `check_ai_probability`와 `save_to_google_docs` 도구가 자동으로 활성화됩니다.

---
## 8. 배포 후 정상 작동 확인 방법

배포가 끝난 뒤 아래 명령어로 시스템 상태를 점검할 수 있습니다.

### 1) 서비스 가동 상태 확인
```bash
docker compose ps
```
모든 서비스의 STATUS가 `Up` 또는 `running`이어야 합니다.

### 2) 실시간 로그 모니터링 (서비스 상태 점검)

**전체 서비스 로그 한꺼번에 보기:**
```bash
docker compose logs -f
```
위 명령어를 실행하면 모든 서비스의 로그가 섞여서 나오며, 각 서비스가 포트를 정상적으로 열었는지(`listening on port...`) 확인할 수 있습니다.

**특정 서비스만 골라서 보기:**
- **AI 디텍터**: `docker compose logs -f ai-detector-mcp` (모델 로드 완료 여부 확인 필수)
- **제미나이 서버**: `docker compose logs -f gemini-mcp`
- **구글 문서 서버**: `docker compose logs -f google-docs-mcp`

### 3) 서버 응답 테스트
로컬 터미널에서 서버 포트가 열려 있는지 확인합니다.
```bash
curl -I http://158.179.20.33:3001/sse
```
`HTTP/1.1 200 OK` (또는 SSE 특성상 연결 유지) 응답이 오면 네트워크 설정이 완벽한 것입니다.

---
## 8. 기술 업데이트 및 최적화 내역 (Changelog)

이 프로젝트는 개발 과정에서 다음과 같은 기술적 문제들을 해결하고 최적화되었습니다.

- **[성능] ONNX Runtime 가속 적용**: 오라클 ARM CPU 환경에서 추론 속도를 2~3배 높이기 위해 ONNX 포맷의 양자화 모델(`int8`)을 적용했습니다.
- **[성능] 텍스트 청킹(Chunking) 로직**: 512 토큰 제한을 극복하기 위해 긴 문서를 자동으로 분할하여 검사하고 평균 점수를 산출하는 기능을 추가했습니다.
- **[안정성] 라이브러리 및 모델 최신화**: 구형 `@xenova/transformers` 대신 최신 표준인 `@huggingface/transformers`를 도입하고, 최신 ONNX 포맷을 지원하는 `onnx-community`의 탐지 모델을 적용하여 호환성 문제를 완벽히 해결했습니다.
- **[안정성] 컨테이너 기반 모델 내장(Pre-baking)**: Hugging Face 서버 접속 문제를 근본적으로 해결하기 위해 빌드 시점에 모델을 다운로드하여 이미지에 포함했습니다. 오라클 클라우드 등 특정 IP 대역 차단 시에는 미러 서버(`hf-mirror.com`)를 통해 안정적으로 수급하도록 설계되었습니다.
- **[안정성] 자동 연결 복구 로직**: 다중 클라이언트 접속이나 네트워크 재연결 시 발생하던 세션 충돌 문제를 해결하기 위해 SSE 핸들러의 예외 처리와 연결 관리 로직을 고도화했습니다.
- **[성능] 즉각 가동(Zero-latency Loading)**: 서버 실행 시 모델 다운로드 과정을 생략하여, 컨테이너가 뜨자마자 즉시 탐지 도구를 사용할 수 있습니다.
- **[편의성] 통합 배포 스크립트**: `git pull`, `docker build`, `restart` 과정을 하나로 합친 `deploy.sh`를 통해 유지보수 편의성을 높였습니다.

---
**프로젝트 관리자**: [jin7659](https://github.com/jin7659)
