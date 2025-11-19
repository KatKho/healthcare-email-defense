import fs from "fs";
import path from "path";

const EMAIL_DIR = "./data/dataset_emails";

function pickRandomEmail() {
  const files = fs.readdirSync(EMAIL_DIR)
    .filter(f => f.endsWith(".eml"));

  const random = files[Math.floor(Math.random() * files.length)];
  const fullPath = path.join(EMAIL_DIR, random);

  const mimeContent = fs.readFileSync(fullPath, "utf8");

  return { file: random, mime: mimeContent };
}

function emitEmail() {
  const { file, mime } = pickRandomEmail();

  const timestamp = Date.now();
  const outputDir = "./emails";
  const outPath = path.join(outputDir, `${timestamp}.eml`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outPath, mime, "utf8");

  console.log(`Emitted: ${outPath} (source: ${file})`);
}

emitEmail();
