const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ErrorCode,
  McpError
} = require("@modelcontextprotocol/sdk/types.js");
const express = require("express");

// --- AI 모델 초기화 로직 (기존 유지) ---
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
    console.log("모델 로드 완료! (표준 모드 가동)");
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

// --- Express 서버 설정 ---
const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("새로운 표준 SSE 연결 요청 수신");

  // 1. 서버 인스턴스 생성 (명확한 도구 명세 포함)
  const server = new Server(
    {
      name: "ai-detector-mcp",
      version: "1.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 2. 도구 목록 정의 (가장 표준적인 JSON Schema 적용)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "check_ai_probability",
        description: "텍스트가 AI에 의해 작성되었을 확률을 0%에서 100% 사이의 수치로 분석합니다.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "AI 작성 여부를 분석할 본문 텍스트"
            }
          },
          required: ["text"]
        }
      }
    ]
  }));

  // 3. 도구 실행 핸들러
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "check_ai_probability") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const { text } = request.params.arguments;
    if (!text) {
      throw new McpError(ErrorCode.InvalidParams, "텍스트 내용이 누락되었습니다.");
    }

    if (!classifier) {
      return {
        content: [{ type: "text", text: "서버에서 AI 모델을 아직 로드 중입니다. 잠시 후 다시 시도해 주세요." }],
        isError: true
      };
    }

    try {
      console.log(`분석 시작: ${text.substring(0, 50)}...`);
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
      
      return {
        content: [{
          type: "text",
          text: `분석 결과, 이 텍스트가 AI에 의해 작성되었을 확률은 약 ${finalScore}% 입니다.`
        }]
      };
    } catch (error) {
      console.error("분석 중 에러:", error);
      return {
        content: [{ type: "text", text: `분석 중 기술적 에러가 발생했습니다: ${error.message}` }],
        isError: true
      };
    }
  });

  // 4. 트랜스포트 연결 및 세션 관리
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  console.log(`표준 연결 성공 (ID: ${sessionId})`);

  req.on('close', () => {
    console.log(`연결 종료 (ID: ${sessionId})`);
    transports.delete(sessionId);
    server.close();
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
  console.log(`AI Detector MCP server listening at http://0.0.0.0:${PORT}/sse`);
});
