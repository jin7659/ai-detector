const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError } = require("@modelcontextprotocol/sdk/types.js");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// --- 설정 파일 경로 ---
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

// 5TB 전용 폴더 ID
const MY_5TB_FOLDER_ID = "17X92aNaiBR1dDaf-6KAPoMDtSOvhFDrH";

// --- 구글 인증 클라이언트 설정 ---
async function getAuthClient() {
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  } catch (err) {
    throw new Error("credentials.json 파일이 없습니다. Google Cloud Console에서 Desktop App용 키를 다운받아주세요.");
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // 기존 토큰이 있는지 확인
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // 토큰이 없으면 로그인 프로세스 진행 (최초 1회)
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file"],
    });

    console.log("이 주소로 들어가서 로그인을 완료해 주세요:", authUrl);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("브라우저에 표시된 코드를 여기에 입력하세요: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return reject("인증 코드 오류: " + err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log("인증 성공! token.json이 저장되었습니다.");
        resolve(oAuth2Client);
      });
    });
  });
}

// --- MCP 서버 로직 ---
const server = new Server({ name: "macbook-google-docs", version: "3.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "save_to_my_google_docs",
    description: "내 개인 구글 드라이브(5TB)에 문서를 저장합니다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" }
      },
      required: ["title", "content"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const auth = await getAuthClient();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const { title, content } = request.params.arguments;
  
  try {
    const file = await drive.files.create({
      requestBody: { name: title, mimeType: 'application/vnd.google-apps.document', parents: [MY_5TB_FOLDER_ID] },
      fields: 'id',
    });
    
    await docs.documents.batchUpdate({
      documentId: file.data.id,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] },
    });

    return { content: [{ type: "text", text: `✅ 저장 완료! 링크: https://docs.google.com/document/d/${file.data.id}/edit` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `❌ 에러: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
