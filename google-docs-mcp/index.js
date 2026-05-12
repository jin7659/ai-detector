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

// 기본 폴더 (지정되지 않았을 때의 대비책)
const DEFAULT_FOLDER_ID = "17X92aNaiBR1dDaf-6KAPoMDtSOvhFDrH";

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Google Docs MCP 개인별 폴더 저장 지원 모드");

  const server = new Server(
    { name: "google-docs-mcp", version: "1.4.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_to_google_docs",
        description: "지정된 폴더에 새로운 문서를 생성하고 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 본문 내용" },
            folderId: { 
              type: "string", 
              description: "저장할 구글 드라이브 폴더의 ID (각 사용자의 개인 폴더 ID)" 
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

    const { title, content, folderId } = request.params.arguments;
    const targetFolder = folderId || DEFAULT_FOLDER_ID;

    try {
      console.log(`[맞춤형 저장] 문서 생성 시작: ${title} -> 폴더: ${targetFolder}`);
      
      const fileMetadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [targetFolder]
      };
      
      const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });
      
      const documentId = file.data.id;

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
          text: `✅ 지정하신 폴더(${targetFolder})에 저장이 완료되었습니다!\n문서 제목: ${title}\n링크: https://docs.google.com/document/d/${documentId}/edit`
        }]
      };
    } catch (error) {
      console.error("저장 에러:", error.message);
      return {
        content: [{ 
          type: "text", 
          text: `❌ 저장 실패: ${error.message}\n(도움말: 폴더 ID가 정확한지, 그리고 서비스 계정이 해당 폴더에 '편집자'로 초대되었는지 확인해 주세요.)` 
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
