import { pipeline, env } from "@xenova/transformers";

async function download() {
  console.log("모델 선행 다운로드 시작...");
  try {
    // 허깅페이스 차단을 우회하기 위해 미러 서버 설정
    env.remoteHost = "https://hf-mirror.com"; 
    env.localModelPath = "./.cache";
    env.allowRemoteModels = true; 
    
    await pipeline("text-classification", "onnx-community/roberta-base-openai-detector-ONNX");
    console.log("모델 다운로드 완료!");
    process.exit(0);
  } catch (e) {
    console.error("다운로드 실패:", e);
    process.exit(1);
  }
}

download();
