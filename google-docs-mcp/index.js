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

  transport = new SSEServerTransport("/messages", res);
  await connectionServer.connect(transport);
  console.log("SSE 연결 성공");

  req.on('close', () => {
    console.log("SSE 연결 종료");
    connectionServer.close();
  });
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
