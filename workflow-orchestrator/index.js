const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

// 접속 대기 및 재시도 함수
async function connectWithRetry(client, transport, name, maxRetries = 5) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`[${name}] 연결 시도 중 (${i}/${maxRetries})...`);
      await client.connect(transport);
      console.log(`[${name}] 연결 성공!`);
      return;
    } catch (err) {
      if (i === maxRetries) throw err;
      console.log(`[${name}] 연결 실패, 3초 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

async function runWorkflow(reference, guidelines, title) {
  const geminiClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
  const detectorClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
  const docsClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });

  const geminiTransport = new SSEClientTransport(new URL(process.env.GEMINI_MCP_URL || "http://gemini-mcp:3000/sse"));
  const detectorTransport = new SSEClientTransport(new URL(process.env.DETECTOR_MCP_URL || "http://ai-detector-mcp:3001/sse"));
  const docsTransport = new SSEClientTransport(new URL(process.env.GOOGLE_DOCS_MCP_URL || "http://google-docs-mcp:3002/sse"));

  // 순차적으로 안정적인 연결 시도
  await connectWithRetry(geminiClient, geminiTransport, "Gemini");
  await connectWithRetry(detectorClient, detectorTransport, "Detector");
  await connectWithRetry(docsClient, docsTransport, "Docs");

  console.log(">>> 모든 MCP 시스템 준비 완료. 워크플로우를 시작합니다.");

  // 1. 글 작성
  console.log("글 작성을 요청합니다...");
  const initialResult = await geminiClient.callTool({
    name: "write_gemini_article",
    arguments: { topic: reference, style: guidelines }
  });
  let currentContent = initialResult.content[0].text;
  console.log("글 작성 완료.");

  // 2. AI 탐지율 체크
  console.log("AI 탐지율을 분석합니다...");
  const checkResult = await detectorClient.callTool({
    name: "check_ai_probability",
    arguments: { text: currentContent }
  });
  console.log("분석 결과:", checkResult.content[0].text);

  // 3. 구글 독스 저장
  console.log("구글 독스 저장을 시작합니다...");
  const saveResult = await docsClient.callTool({
    name: "save_to_google_docs",
    arguments: { title, content: currentContent }
  });
  console.log("최종 결과:", saveResult.content[0].text);

  // 종료
  await Promise.all([
    geminiTransport.close(),
    detectorTransport.close(),
    docsTransport.close()
  ]);
}

// 오라클 서버에서 컨테이너 실행 시 자동 시작되도록 함
const ref = process.env.TOPIC || "MCP 프로토콜과 AI 자동화의 미래";
const guide = process.env.STYLE || "기술 블로그 스타일";
const docTitle = process.env.DOC_TITLE || "MCP 워크플로우 결과물";

console.log("워크플로우 오케스트레이터 가동...");
// 서버들이 뜰 때까지 약간의 여유를 둠
setTimeout(() => {
  runWorkflow(ref, guide, docTitle).catch(error => {
    console.error("워크플로우 실행 중 치명적 에러:", error);
  });
}, 5000);
