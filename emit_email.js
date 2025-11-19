// emit_email.js (ESM)
import fs from "fs";
import path from "path";
import AWS from "aws-sdk";

const EMAIL_DIR = process.env.EMAIL_DIR || "./data/dataset_emails";
const OUTPUT_DIR = process.env.EMITTED_OUTPUT_DIR || "./emails";
const INTERVAL_MS = Number(process.env.DEMO_INTERVAL_MS || 15 * 60 * 1000);

// Support both env names, prefer the more specific one
const CONTROLLER_FN_NAME =
  process.env.SENDER_INTEL_CONTROLLER_FUNCTION ||
  process.env.SENDER_CONTROLLER_FN ||
  "sender-intel-controller";

const REGION = process.env.AWS_REGION || "us-east-2";

const lambda = new AWS.Lambda({ region: REGION });

function pickRandomEmail() {
  const dirPath = path.resolve(EMAIL_DIR);

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".eml"));

  if (files.length === 0) {
    throw new Error(`No .eml files found in ${dirPath}`);
  }

  const random = files[Math.floor(Math.random() * files.length)];
  const fullPath = path.join(dirPath, random);
  const mimeContent = fs.readFileSync(fullPath, "utf8");

  return { file: random, mime: mimeContent };
}

async function emitOnce() {
  const timestamp = Date.now();
  const iso = new Date(timestamp).toISOString();

  try {
    const { file, mime } = pickRandomEmail();

    // 1) Optional: write a local copy for audit/debug
    const outDirPath = path.resolve(OUTPUT_DIR);
    if (!fs.existsSync(outDirPath)) {
      fs.mkdirSync(outDirPath, { recursive: true });
    }
    const outPath = path.join(outDirPath, `${timestamp}.eml`);
    fs.writeFileSync(outPath, mime, "utf8");

    // 2) Invoke the controller Lambda
    const event = {
      mime_raw: mime,
      demo_meta: {
        source: "emit_email.js",
        dataset_file: file,
        emitted_at_iso: iso,
      },
    };

    const resp = await lambda
      .invoke({
        FunctionName: CONTROLLER_FN_NAME,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(event),
      })
      .promise();

    let payload = null;
    if (resp.Payload) {
      const text = resp.Payload.toString("utf8");
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    const decision = payload?.decision;
    const risk = payload?.risk;
    const cls = payload?.content_classification;
    const conf = payload?.content_confidence;

    console.log(
      `[EMIT] ${iso} :: file=${file} -> ${outPath}`
    );
    console.log(
      `       Lambda=${CONTROLLER_FN_NAME} decision=${decision} risk=${risk} classification=${cls} confidence=${conf}`
    );
  } catch (err) {
    console.error(
      `[EMIT ERROR] ${iso} ::`,
      err?.message || err
    );
  }
}

// ---- Start / Stop control ----

let intervalId = null;
let running = false;

export async function startEmitter() {
  if (running) {
    console.log("[EMIT] Emitter already running; ignoring start.");
    return;
  }

  running = true;

  console.log(
    `[EMIT] Starting emitter: dir=${EMAIL_DIR}, fn=${CONTROLLER_FN_NAME}, interval=${INTERVAL_MS}ms`
  );

  // Fire once immediately
  await emitOnce();

  // Then schedule continuous emissions
  intervalId = setInterval(() => {
    emitOnce().catch((err) => {
      console.error(
        "[EMIT ERROR] Failure during scheduled emit:",
        err?.message || err
      );
    });
  }, INTERVAL_MS);

  console.log("[EMIT] Emitter is now running.");
}

export function stopEmitter() {
  if (!running) {
    console.log("[EMIT] Emitter not running; nothing to stop.");
    return;
  }
  clearInterval(intervalId);
  intervalId = null;
  running = false;
  console.log("[EMIT] Emitter stopped.");
}

export function isRunning() {
  return running;
}
