const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");
const { google } = require("googleapis");

// Google Auth 설정 (기존 로직 유지)
const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/documents"],
});
const docs = google.docs({ version: "v1", auth });

const app = express();

app.get("/sse", async (req, res) => {
  console.log("새로운 SSE 연결 시도...");
  
  const connectionServer = new Server(
    { name: "google-docs", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  connectionServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "save_to_google_docs",
        description: "작성된 글을 Google Docs 문서로 저장합니다.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "문서 제목" },
            content: { type: "string", description: "문서 내용" }
          },
          required: ["title", "content"]
        }
      }
    ]
  }));

  connectionServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "save_to_google_docs") {
      const { title, content } = request.params.arguments;
      try {
        const doc = await docs.documents.create({ requestBody: { title } });
        const documentId = doc.data.documentId;
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{ insertText: { location: { index: 1 }, text: content } }]
          }
        });
        return { content: [{ type: "text", text: `성공! 문서 ID: ${documentId}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `에러: ${e.message}` }], isError: true };
      }
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
  res.status(200).end();
});

const PORT = 3002;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Google Docs MCP server running at http://0.0.0.0:${PORT}/sse`);
});
