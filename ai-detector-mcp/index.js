const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

let pipeline;
let classifier;

async function initModel() {
  console.log("로컬 AI 모델 로드 중...");
  try {
    const { pipeline: hfPipeline, env } = await import("@huggingface/transformers");
    env.remoteHost = "https://hf-mirror.com";
    env.allowRemoteModels = false;
    env.localModelPath = "/app/.cache";
    pipeline = hfPipeline;
    classifier = await pipeline("text-classification", "onnx-community/roberta-base-openai-detector-ONNX");
    console.log("모델 로드 완료!");
  } catch (error) {
    console.error("모델 로딩 에러:", error);
  }
}
initModel();

function chunkText(text, maxLength = 1500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

const app = express();
// app.use(express.json()); // 제거: MCP SDK와 충돌 방지

// 세션별 트랜스포트 보관함
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId; // SDK가 생성한 세션 ID
  transports.set(sessionId, transport);
  
  const connectionServer = new Server(
    { name: "ai-detector", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "check_ai_probability",
      description: "텍스트가 AI에 의해 작성되었을 확률을 분석합니다.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      }
    }]
  }));

  connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "check_ai_probability") {
      const text = request.params.arguments.text;
      if (!classifier) return { content: [{ type: "text", text: "모델 준비 중..." }], isError: true };
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
      return { content: [{ type: "text", text: `분석 결과: AI 확률 ${finalScore}%` }] };
    }
    throw new Error("Tool not found");
  });

  await connectionServer.connect(transport);
  console.log(`SSE 연결 성공 (Session: ${sessionId})`);

  req.on('close', () => {
    console.log(`SSE 연결 종료 (Session: ${sessionId})`);
    transports.delete(sessionId);
    connectionServer.close();
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("Session not found");
  }
});

const PORT = 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Detector MCP server running at http://0.0.0.0:${PORT}/sse`);
});
