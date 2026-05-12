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
  console.log("Google Docs MCP [심플 저장] 모드 가동");

  const server = new Server(
    { name: "google-docs-mcp", version: "1.8.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_to_google_docs",
        description: "구글 문서를 생성하고 지정된 폴더에 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 본문 내용" },
            folderId: { type: "string", description: "문서를 저장할 구글 드라이브 폴더 ID" }
          },
          required: ["title", "content", "folderId"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "save_to_google_docs") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const { title, content, folderId } = request.params.arguments;

    try {
      console.log(`[심플 저장] 문서 생성 시작: ${title} -> 폴더 ID: ${folderId}`);
      
      // 1. 드라이브 API를 통해 특정 폴더 내에 문서 생성
      const fileMetadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [folderId]
      };
      
      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      
      const documentId = file.data.id;

      // 2. 문서 내용 삽입
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [{ insertText: { location: { index: 1 }, text: content } }],
        },
      });

      return {
        content: [{
          type: "text",
          text: `✅ 구글 문서 저장 완료!\n제목: ${title}\n폴더 ID: ${folderId}\n링크: https://docs.google.com/document/d/${documentId}/edit`
        }]
      };
    } catch (error) {
      console.error("저장 에러:", error.message);
      return {
        content: [{ type: "text", text: `❌ 저장 실패: ${error.message}` }],
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
