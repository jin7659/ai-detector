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

// 전공자님의 공용 저장소 폴더 ID (이곳으로 모든 문서가 모입니다)
const TEAM_FOLDER_ID = "17X92aNaiBR1dDaf-6KAPoMDtSOvhFDrH";

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Google Docs MCP 심플 저장 모드 가동");

  const server = new Server(
    { name: "google-docs-mcp", version: "1.6.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_to_google_docs",
        description: "구글 문서로 내용을 저장합니다. 모든 문서는 팀 공용 폴더(docs-bot)에 자동으로 보관됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 본문 내용" }
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

    try {
      console.log(`[심플 저장] 문서 생성: ${title}`);
      
      const fileMetadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [TEAM_FOLDER_ID]
      };
      
      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      
      const documentId = file.data.id;

      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [{ insertText: { location: { index: 1 }, text: content } }],
        },
      });

      return {
        content: [{
          type: "text",
          text: `✅ 구글 문서 저장 완료!\n문서 제목: ${title}\n폴더: docs-bot\n링크: https://docs.google.com/document/d/${documentId}/edit`
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
