const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");

let pipeline;
let classifier;

// Transformers.js 초기화 (서버 시작 시 모델 로드)
// Transformers.js 초기화
async function initModel() {
  console.log("로컬 AI 모델(RoBERTa) 로드 중...");
  try {
    const { pipeline: hfPipeline, env } = await import("@huggingface/transformers");
    
    // 로컬 전용 모드 강제 활성화 및 미러 설정
    env.remoteHost = "https://hf-mirror.com"; // 허깅페이스 차단 우회용 미러
    env.allowRemoteModels = false; // 외부 접속 차단
    env.localModelPath = "/app/.cache"; // 로컬 경로 지정
    
    pipeline = hfPipeline;
    // 전공자님께서 요청하신 모델로 적용
    classifier = await pipeline("text-classification", "onnx-community/roberta-base-openai-detector-ONNX");
    console.log("모델 로드 완료! (오프라인 모드)");
  } catch (error) {
    console.error("모델 로딩 중 에러 발생:", error);
  }
}

/**
 * 텍스트를 모델의 제한(512 토큰)에 맞게 청크로 나누는 함수
 * 약 1500자 단위로 나누어 토큰 제한을 초과하지 않도록 합니다.
 */
function chunkText(text, maxLength = 1500) {
  const chunks = [];
  let currentPos = 0;
  while (currentPos < text.length) {
    chunks.push(text.substring(currentPos, currentPos + maxLength));
    currentPos += maxLength;
  }
  return chunks;
}

const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const server = new Server(
  {
    name: "ai-detector-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
const app = express();
let transport;

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  // 매 연결마다 새로운 서버 인스턴스 생성 (충돌 방지 정석)
  const connectionServer = new Server(
    { name: "ai-detector", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // 도구 핸들러 등록 (매번 등록)
  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "check_ai_probability",
        description: "텍스트가 AI에 의해 작성되었을 확률을 분석합니다. (512 토큰 제한 자동 처리)",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "분석할 본문 텍스트" }
          },
          required: ["text"]
        }
      }
    ]
  }));

  connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "check_ai_probability") {
      const text = request.params.arguments.text;
      if (!classifier) return { content: [{ type: "text", text: "모델이 아직 준비되지 않았습니다." }], isError: true };
      
      const chunks = chunkText(text);
      let totalScore = 0;
      for (const chunk of chunks) {
        const result = await classifier(chunk);
        if (result && result[0]) {
          const aiScore = result[0].label === 'LABEL_1' ? result[0].score : (1 - result[0].score);
          totalScore += aiScore;
        }
      }
      const finalScore = (totalScore / chunks.length * 100).toFixed(2);
      return { content: [{ type: "text", text: `분석 결과, 이 텍스트가 AI에 의해 작성되었을 확률은 약 ${finalScore}% 입니다.` }] };
    }
    throw new Error("Tool not found");
  });

  const transport = new SSEServerTransport("/messages", res);
  await connectionServer.connect(transport);
  console.log("SSE 연결 성공");

  req.on('close', () => {
    console.log("SSE 연결 종료");
    connectionServer.close();
  });
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, async () => {
  console.log(`Optimized AI Detector MCP server running at http://${HOST}:${PORT}/sse`);
  await initModel();
});
