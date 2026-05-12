const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

async function runWorkflow(reference, guidelines, title) {
  console.log(">>> 워크플로우를 시작합니다.");
  
  let geminiClient, detectorClient, docsClient;
  let geminiTransport, detectorTransport, docsTransport;

  // 1. 모든 서버에 연결될 때까지 무한 재시도 (안정성 극대화)
  while (true) {
    try {
      console.log("모든 MCP 서버 연결 시도 중...");
      
      geminiTransport = new SSEClientTransport(new URL(process.env.GEMINI_MCP_URL || "http://gemini-mcp:3000/sse"));
      detectorTransport = new SSEClientTransport(new URL(process.env.DETECTOR_MCP_URL || "http://ai-detector-mcp:3001/sse"));
      docsTransport = new SSEClientTransport(new URL(process.env.GOOGLE_DOCS_MCP_URL || "http://google-docs-mcp:3002/sse"));

      geminiClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
      detectorClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });
      docsClient = new Client({ name: "orchestrator", version: "1.0.0" }, { capabilities: {} });

      await Promise.all([
        geminiClient.connect(geminiTransport),
        detectorClient.connect(detectorTransport),
        docsClient.connect(docsTransport)
      ]);

      console.log(">>> 모든 MCP 서버 연결 성공!");
      break; // 성공 시 루프 탈출
    } catch (err) {
      console.log(`연결 실패: ${err.message}. 5초 후 다시 시도합니다...`);
      // 기존 연결 시도 청소
      try { geminiTransport?.close(); detectorTransport?.close(); docsTransport?.close(); } catch(e) {}
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // 2. 글 작성
  try {
    console.log("1단계: 글 작성을 요청합니다...");
    const initialResult = await geminiClient.callTool({
      name: "write_gemini_article",
      arguments: { topic: reference, style: guidelines }
    });
    let currentContent = initialResult.content[0].text;
    console.log("글 작성 완료.");

    // 3. AI 탐지율 체크
    console.log("2단계: AI 탐지율을 분석합니다...");
    const checkResult = await detectorClient.callTool({
      name: "check_ai_probability",
      arguments: { text: currentContent }
    });
    console.log("탐지 결과:", checkResult.content[0].text);

    // 4. 구글 독스 저장
    console.log("3단계: 구글 독스 저장을 시작합니다...");
    const saveResult = await docsClient.callTool({
      name: "save_to_google_docs",
      arguments: { title, content: currentContent }
    });
    console.log("최종 결과:", saveResult.content[0].text);
  } catch (err) {
    console.error("워크플로우 실행 중 에러 발생:", err.message);
  } finally {
    // 종료
    console.log("연결을 정리합니다.");
    try {
      await geminiTransport.close();
      await detectorTransport.close();
      await docsTransport.close();
    } catch (e) {}
  }
}

const ref = process.env.TOPIC || "MCP와 오라클 클라우드의 결합";
const guide = process.env.STYLE || "IT 뉴스 스타일";
const docTitle = process.env.DOC_TITLE || "MCP 자동화 테스트 결과";

console.log("오케스트레이터 가동 시작...");
runWorkflow(ref, guide, docTitle).then(() => {
  console.log("워크플로우 완료. 프로세스를 종료합니다.");
}).catch(err => {
  console.error("치명적 에러:", err);
});
