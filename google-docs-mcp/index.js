const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { google } = require("googleapis");
const express = require("express");
const path = require("path");

const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const server = new Server(
  {
    name: "google-docs-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 구글 API 인증 설정
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "credentials.json"),
  scopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive"],
});

const docs = google.docs({ version: "v1", auth });

// 도구 정의: 구글 독스 저장
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "save_to_google_docs",
        description: "작성된 글을 구글 문서로 생성하고 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
    ],
  };
});

// 도구 실행 로직
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "save_to_google_docs") {
    const { title, content } = request.params.arguments;
    
    try {
      // 1. 새 문서 생성
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      const documentId = doc.data.documentId;

      // 2. 내용 삽입
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });

      return {
        content: [{ 
          type: "text", 
          text: `문서가 성공적으로 생성되었습니다. ID: ${documentId}\n링크: https://docs.google.com/document/d/${documentId}/edit` 
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `에러 발생: ${error.message}` }],
        isError: true,
      };
    }
  }
  throw new Error("Tool not found");
});

const app = express();
let transport;

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const transport = new SSEServerTransport("/messages", res);
  try {
    await server.connect(transport);
    console.log("SSE 연결 성공");
    req.on('close', () => {
      console.log("SSE 연결 종료");
      server.close();
    });
  } catch (error) {
    console.error("연결 중 에러:", error.message);
  }
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Google Docs MCP server running at http://${HOST}:${PORT}/sse`);
});
