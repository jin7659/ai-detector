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
// 서비스 계정 키를 명시적으로 로드하여 환경 변수 혼선을 방지합니다.
const auth = new google.auth.GoogleAuth({
  scopes: [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive"
  ],
});

const docs = google.docs({ version: "v1", auth });
const drive = google.drive({ version: "v3", auth });

// 전공자님의 공용 폴더 ID (docs-bot)
const TEAM_FOLDER_ID = "17X92aNaiBR1dDaf-6KAPoMDtSOvhFDrH";

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  console.log("Google Docs MCP [기존 방식 - 정밀 보정] 연결 요청");

  const server = new Server(
    { name: "google-docs-mcp", version: "1.9.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_to_google_docs",
        description: "구글 문서로 저장합니다. 지정된 폴더 ID가 없으면 기본 팀 폴더에 저장됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 본문 내용" },
            folderId: { type: "string", description: "저장할 폴더 ID (생략 가능)" }
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
    const targetFolder = folderId || TEAM_FOLDER_ID;

    try {
      console.log(`[시도] 문서 생성: ${title} -> 폴더: ${targetFolder}`);
      
      // 1. 드라이브 API를 통해 문서를 생성 (parents 옵션 사용)
      // 이 방식이 서비스 계정 권한 에러가 가장 적습니다.
      const createResponse = await drive.files.create({
        requestBody: {
          name: title,
          mimeType: 'application/vnd.google-apps.document',
          parents: [targetFolder]
        },
        fields: 'id',
      });
      
      const documentId = createResponse.data.id;
      console.log(`[성공] 문서 생성 완료 (ID: ${documentId})`);

      // 2. 문서 본문 내용 업데이트
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
          text: `✅ 구글 문서 저장 성공!\n제목: ${title}\n폴더: ${targetFolder}\n링크: https://docs.google.com/document/d/${documentId}/edit`
        }]
      };
    } catch (error) {
      console.error("저장 중 에러 발생:", JSON.stringify(error, null, 2));
      
      let errorMsg = error.message;
      if (errorMsg.includes("does not have permission")) {
        errorMsg = "구글이 접근을 거부했습니다. [체크리스트: 1.Google Drive API 활성화 여부, 2.서비스 계정이 폴더에 '편집자'로 초대되었는지 확인]";
      }
      
      return {
        content: [{ type: "text", text: `❌ 에러 발생: ${errorMsg}` }],
        isError: true
      };
    }
  });

  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  
  await server.connect(transport);
  console.log(`Docs 서버 준비 완료 (ID: ${sessionId})`);

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
