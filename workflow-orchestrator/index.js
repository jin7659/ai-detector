const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

async function runWorkflow(reference, guidelines, title) {
  // 1. MCP 클라이언트 설정
  const geminiClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
  const detectorClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
  const docsClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });

  // 트랜스포트 연결 (Docker Compose 서비스 이름 사용)
  const geminiTransport = new SSEClientTransport(new URL(process.env.GEMINI_MCP_URL));
  const detectorTransport = new SSEClientTransport(new URL(process.env.DETECTOR_MCP_URL));
  const docsTransport = new SSEClientTransport(new URL(process.env.GOOGLE_DOCS_MCP_URL));

  await Promise.all([
    geminiClient.connect(geminiTransport),
    detectorClient.connect(detectorTransport),
    docsClient.connect(docsTransport)
  ]);

  console.log("모든 MCP 서버에 연결되었습니다.");

  let currentContent = "";
  let probability = 100;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  // 2. 초기 글 작성
  console.log("글 작성을 시작합니다...");
  const initialResult = await geminiClient.callTool({
    name: "write_article",
    arguments: { reference, guidelines }
  });
  currentContent = initialResult.content[0].text;

  // 3. AI 탐지율 최적화 루프
  while (probability > 30 && attempts < MAX_ATTEMPTS) {
    attempts++;
    console.log(`[시도 ${attempts}] AI 탐지율 체크 중...`);
    
    const checkResult = await detectorClient.callTool({
      name: "check_ai_probability",
      arguments: { text: currentContent }
    });
    
    const resultData = JSON.parse(checkResult.content[0].text);
    probability = resultData.probability;
    console.log(`현재 탐지율: ${probability}%`);

    if (probability > 30) {
      console.log("탐지율이 높습니다. 인간적인 어조로 재작성을 요청합니다...");
      const rewriteResult = await geminiClient.callTool({
        name: "write_article",
        arguments: { 
          reference: `기존 내용: ${currentContent}\n\n위 내용을 바탕으로 다시 작성해주세요.`,
          guidelines: `${guidelines}\n\n**중요**: AI 탐지기를 피하기 위해 더 인간적이고 자연스러운 문체(Active voice, Burstiness)를 사용하세요.`
        }
      });
      currentContent = rewriteResult.content[0].text;
    }
  }

  // 4. 구글 독스 저장
  if (probability <= 30 || attempts >= MAX_ATTEMPTS) {
    console.log("최적화 완료. 구글 독스에 저장을 시작합니다...");
    const saveResult = await docsClient.callTool({
      name: "save_to_google_docs",
      arguments: { title, content: currentContent }
    });
    console.log("결과:", saveResult.content[0].text);
  }

  // 연결 종료
  await Promise.all([
    geminiTransport.close(),
    detectorTransport.close(),
    docsTransport.close()
  ]);
}

// 실행 예시 (환경 변수 또는 인자값으로 받을 수 있음)
const ref = "MCP 프로토콜의 미래와 AI 생태계";
const guide = "IT 기술 블로그 형식, 전문적이면서도 친근한 말투";
const docTitle = "AI와 MCP의 결합";

runWorkflow(ref, guide, docTitle).catch(console.error);
