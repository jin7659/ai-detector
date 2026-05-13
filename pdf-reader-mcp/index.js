const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError } = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const pdf = require("pdf-parse");

const server = new Server({ name: "pdf-reader-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "read_pdf_file",
    description: "PDF 파일의 내용을 텍스트로 읽어옵니다.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "PDF 파일의 전체 경로" }
      },
      required: ["path"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "read_pdf_file") throw new McpError(ErrorCode.MethodNotFound, "Unknown tool");

  const pdfPath = request.params.arguments.path;
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return { content: [{ type: "text", text: data.text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `❌ PDF 읽기 실패: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
