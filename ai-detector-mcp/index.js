const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");

let pipeline;
let classifier;

// Transformers.js 초기화 (서버 시작 시 모델 로드)
async function initModel() {
  console.log("로컬 AI 모델(ONNX 최적화 버전) 로드 중...");
  const { pipeline: hfPipeline, env } = await import("@xenova/transformers");
  
  // ONNX Runtime 설정 최적화
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  
  pipeline = hfPipeline;
  // Xenova 모델은 이미 ONNX로 변환 및 양자화되어 있어 오라클 CPU 환경에서 최적의 성능을 냅니다.
  classifier = await pipeline("text-classification", "Xenova/chatgpt-detector-roberta");
  console.log("모델 로드 완료! (ONNX 가속 활성화됨)");
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
      tools: {},
    },
  }
);

// 도구 정의
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "check_ai_probability",
        description: "텍스트의 AI 생성 확률을 체크합니다. (긴 문서 자동 분할 및 ONNX 가속 적용)",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
        },
      },
    ],
  };
});

// 도구 실행 로직
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "check_ai_probability") {
    const { text } = request.params.arguments;
    
    if (!classifier) {
      return {
        content: [{ type: "text", text: "모델이 아직 로드되지 않았습니다." }],
        isError: true
      };
    }

    try {
      // 성능 최적화: 텍스트가 길 경우 청크로 나누어 처리
      const chunks = chunkText(text);
      let totalProbability = 0;

      console.log(`총 ${chunks.length}개의 청크로 분할하여 검사를 시작합니다...`);

      for (const chunk of chunks) {
        const results = await classifier(chunk);
        const aiResult = results.find(r => r.label === 'ChatGPT' || r.label === 'LABEL_1');
        totalProbability += aiResult.score;
      }

      // 모든 청크의 평균 확률 계산
      const averageProbability = Math.floor((totalProbability / chunks.length) * 100);

      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            probability: averageProbability, 
            chunks_processed: chunks.length,
            status: "success",
            message: `ONNX 가속 및 청크 분할 검사 완료: ${averageProbability}%` 
          }) 
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `추론 에러: ${error.message}` }],
        isError: true
      };
    }
  }
  throw new Error("Tool not found");
});

const app = express();
let transport;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
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
