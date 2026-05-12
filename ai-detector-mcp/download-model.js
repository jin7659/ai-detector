import { pipeline } from "@xenova/transformers";

async function download() {
  console.log("모델 선행 다운로드 시작...");
  try {
    await pipeline("text-classification", "Xenova/roberta-base-openai-detector");
    console.log("모델 다운로드 완료!");
    process.exit(0);
  } catch (e) {
    console.error("다운로드 실패:", e);
    process.exit(1);
  }
}

download();
