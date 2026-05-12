const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ErrorCode,
  McpError
} = require("@modelcontextprotocol/sdk/types.js");
const express = require("express");
const { google } = require("googleapis");

// --- Google API 초기화 ---
const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive"],
});
const docs = google.docs({ version: "v1", auth });

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Google Docs MCP 표준 연결 요청");

  const server = new Server(
    {
      name: "google-docs-mcp",
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
        name: "save_to_google_docs",
        description: "주어진 제목과 내용으로 새로운 구글 문서를 생성하고 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "문서 제목"
            },
            content: {
              type: "string",
              description: "문서 본문 내용"
            }
          },
          required: ["title", "content"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "save_to_google_docs") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const { title, content } = request.params.arguments;
    if (!title || !content) {
      throw new McpError(ErrorCode.InvalidParams, "제목과 본문 내용이 모두 필요합니다.");
    }

    try {
      console.log(`문서 생성 시작: ${title}`);
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      const documentId = doc.data.documentId;

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
          text: `구글 문서가 성공적으로 저장되었습니다.\n문서 제목: ${title}\nID: ${documentId}\n링크: https://docs.google.com/document/d/${documentId}/edit`
        }]
      };
    } catch (error) {
      console.error("구글 문서 저장 에러:", error.message);
      return {
        content: [{ 
          type: "text", 
          text: `저장 실패: ${error.message}. 구글 클라우드 콘솔에서 Docs API 및 Drive API 활성화 여부와 서비스 계정 권한(Editor)을 확인해 주세요.` 
        }],
        isError: true
      };
    }
  });

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  console.log(`Docs 서버 연결 성공 (ID: ${sessionId})`);

  req.on('close', () => {
    console.log(`Docs 서버 연결 종료 (ID: ${sessionId})`);
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

const PORT = 3002;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Google Docs MCP server listening at http://0.0.0.0:${PORT}/sse`);
});
