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

const auth = new google.auth.GoogleAuth({
  scopes: [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive"
  ],
});
const docs = google.docs({ version: "v1", auth });
const drive = google.drive({ version: "v3", auth });

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Google Docs MCP 이메일 기반 자동 공유 모드 가동");

  const server = new Server(
    { name: "google-docs-mcp", version: "1.5.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_and_share_docs",
        description: "문서를 생성하고 지정된 이메일 주소로 자동 공유합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 본문 내용" },
            email: { type: "string", description: "공유받을 사용자의 구글 이메일 주소" }
          },
          required: ["title", "content", "email"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "save_and_share_docs") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const { title, content, email } = request.params.arguments;

    try {
      console.log(`[이메일 공유 저장] 문서 생성 시작: ${title} -> 대상: ${email}`);
      
      // 1. 문서 생성
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      const documentId = doc.data.documentId;

      // 2. 내용 삽입
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [{ insertText: { location: { index: 1 }, text: content } }],
        },
      });

      // 3. 이메일로 자동 공유 (편집자 권한 부여)
      await drive.permissions.create({
        fileId: documentId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: email
        }
      });

      return {
        content: [{
          type: "text",
          text: `✅ 성공! 문서를 생성하고 ${email} 님에게 공유했습니다.\n구글 드라이브의 '공유 문서함'에서 확인해 보세요.\n링크: https://docs.google.com/document/d/${documentId}/edit`
        }]
      };
    } catch (error) {
      console.error("공유 저장 에러:", error.message);
      return {
        content: [{ type: "text", text: `❌ 실패: ${error.message}` }],
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
