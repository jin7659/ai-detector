const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const app = express();
// app.use(express.json());

const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  const connectionServer = new Server(
    { name: "gemini-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "write_gemini_article",
      description: "Gemini를 사용하여 고품질 글을 작성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          style: { type: "string" }
        },
        required: ["topic", "style"]
      }
    }]
  }));

  connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "write_gemini_article") {
      const { topic, style } = request.params.arguments;
      return { content: [{ type: "text", text: `${topic}에 대한 ${style} 스타일의 글을 생성했습니다.` }] };
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

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini MCP server running at http://0.0.0.0:${PORT}/sse`);
});
