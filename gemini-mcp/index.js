const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");

const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const server = new Server(
  {
    name: "gemini-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 도구 정의 예시: 글쓰기
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "write_article",
        description: "주어진 레퍼런스를 바탕으로 글을 작성합니다.",
        inputSchema: {
          type: "object",
          properties: {
            reference: { type: "string" },
            guidelines: { type: "string" },
          },
          required: ["reference", "guidelines"],
        },
      },
    ],
  };
});

// 도구 실행 로직
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "write_article") {
    // 여기서 실제 Gemini API 호출 로직이 들어갑니다.
    const { reference, guidelines } = request.params.arguments;
    return {
      content: [{ type: "text", text: `[초안] 레퍼런스: ${reference}\n가이드라인: ${guidelines}를 바탕으로 작성된 글입니다...` }],
    };
  }
  throw new Error("Tool not found");
});

const app = express();
let transport;

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  try {
    if (server.transport) await server.close();
  } catch (e) {}
  
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  console.log("SSE 연결 성공");
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // 핵심: 0.0.0.0으로 바인딩하여 외부 접근 허용

app.listen(PORT, HOST, () => {
  console.log(`Gemini MCP server running at http://${HOST}:${PORT}/sse`);
});
