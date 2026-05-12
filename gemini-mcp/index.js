const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ErrorCode,
  McpError
} = require("@modelcontextprotocol/sdk/types.js");
const express = require("express");

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Gemini MCP 표준 연결 요청");

  const server = new Server(
    {
      name: "gemini-mcp",
      version: "1.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "write_gemini_article",
        description: "제미나이 AI를 활용하여 특정 주제에 대해 전문적이고 고품질인 글을 작성합니다.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "작성할 글의 주제 또는 핵심 키워드"
            },
            style: {
              type: "string",
              description: "글의 어조나 스타일 (예: 블로그, 뉴스기사, 전문학술지 등)"
            }
          },
          required: ["topic", "style"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "write_gemini_article") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const { topic, style } = request.params.arguments;
    console.log(`글 작성 요청: 주제(${topic}), 스타일(${style})`);

    // 실제 생성 로직은 오케스트레이터나 제미나이가 처리하므로 결과 형식만 반환
    return {
      content: [{
        type: "text",
        text: `주제 '${topic}'에 대해 ${style} 스타일로 작성된 글의 초안입니다.\n\n[글 내용 생략 - 제미나이가 이어서 작성할 예정]`
      }]
    };
  });

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  console.log(`Gemini 연결 성공 (ID: ${sessionId})`);

  req.on('close', () => {
    console.log(`Gemini 연결 종료 (ID: ${sessionId})`);
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

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini MCP server listening at http://0.0.0.0:${PORT}/sse`);
});
