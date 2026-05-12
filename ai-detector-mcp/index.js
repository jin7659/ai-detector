const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

let pipeline;
let classifier;

// Transformers.js 초기화
async function initModel() {
  console.log("로컬 AI 모델(RoBERTa) 로드 중...");
  try {
    const { pipeline: hfPipeline, env } = await import("@huggingface/transformers");
    env.remoteHost = "https://hf-mirror.com";
    env.allowRemoteModels = false;
    env.localModelPath = "/app/.cache";
    
    pipeline = hfPipeline;
    classifier = await pipeline("text-classification", "onnx-community/roberta-base-openai-detector-ONNX");
    console.log("모델 로드 완료! (오프라인 모드)");
  } catch (error) {
    console.error("모델 로딩 중 에러 발생:", error);
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

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  const connectionServer = new Server(
    { name: "ai-detector", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "check_ai_probability",
        description: "텍스트가 AI에 의해 작성되었을 확률을 분석합니다.",
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

  const transport = new SSEServerTransport("/messages", res);
  await connectionServer.connect(transport);
  console.log("SSE 연결 성공");

  req.on('close', () => {
    console.log("SSE 연결 종료");
    connectionServer.close();
  });
});

app.post("/messages", async (req, res) => {
  // SSEServerTransport가 내부적으로 POST 요청을 처리할 수 있도록 구현되어야 함
  // 여기서는 간단히 에러 방지만 함
  res.status(200).end();
});

const PORT = 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Detector MCP server running at http://0.0.0.0:${PORT}/sse`);
});
