const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");

const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const app = express();
let transport;

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  const connectionServer = new Server(
    { name: "gemini-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "write_gemini_article",
        description: "Gemini를 사용하여 고품질 글을 작성합니다.",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "글의 주제" },
            style: { type: "string", description: "글의 스타일 (예: 블로그, 뉴스, 수필)" }
          },
          required: ["topic", "style"]
        }
      }
    ]
  }));

  connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "write_gemini_article") {
      const { topic, style } = request.params.arguments;
      // 글쓰기 로직...
      return { content: [{ type: "text", text: `${topic}에 대한 ${style} 스타일의 글을 작성했습니다.` }] };
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

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // 핵심: 0.0.0.0으로 바인딩하여 외부 접근 허용

app.listen(PORT, HOST, () => {
  console.log(`Gemini MCP server running at http://${HOST}:${PORT}/sse`);
});
