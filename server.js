// server.js (ESM)
import express from "express";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";
import AWS from "aws-sdk";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { fileURLToPath } from "url";

import {
  startEmitter,
  stopEmitter,
  isRunning as isEmitterRunning,
} from "./emit_email.js";

// Load .env BEFORE using process.env
dotenv.config();
dayjs.extend(utc);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// AWS SDK CONFIGURATION
// ----------------------

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  console.log("🔑 Using AWS credentials from environment variables");
  AWS.config.update({
    region: process.env.AWS_REGION || "us-east-2",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
} else {
  console.log(
    "🔑 Using AWS default credential provider chain (no explicit keys in .env)"
  );
  AWS.config.update({
    region: process.env.AWS_REGION || "us-east-2",
  });
}

const lambda = new AWS.Lambda();
const dynamo = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// ------------
// CONFIG
// ------------

const HITL_TABLE = process.env.HITL_TABLE || "sender_intel_hitl_queue";

const DECISIONS_BUCKET =
  process.env.METRICS_BUCKET ||
  process.env.S3_DECISIONS_BUCKET ||
  "sc-intel-decisions-455185968614-us-east-2";

const DECISIONS_PREFIX =
  process.env.METRICS_PREFIX ||
  process.env.S3_DECISIONS_PREFIX ||
  "runs";

const METRICS_BUCKET = DECISIONS_BUCKET;
const METRICS_PREFIX = DECISIONS_PREFIX;

const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE || "sender_feedback_table";

// ------------
// HELPERS
// ------------

function resolveControllerFunctionName() {
  return (
    process.env.SENDER_INTEL_CONTROLLER_FUNCTION ||
    process.env.SENDER_CONTROLLER_FN ||
    "sender-intel-controller"
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Pull a PHI-scrubbed body for UI display.
 */
function extractBodyPreview(doc) {
  if (!doc) return null;
  if (doc.compact && typeof doc.compact.body_preview === "string") {
    return doc.compact.body_preview;
  }
  if (typeof doc.body_preview === "string") {
    return doc.body_preview;
  }
  if (doc.compact && typeof doc.compact.body === "string") {
    return doc.compact.body;
  }
  return null;
}

/**
 * Pull the best-available reasoning text.
 */
function extractReasoning(doc) {
  if (!doc) return null;

  // 1. Content Analysis Reasoning (Highest Priority)
  if (doc.content && Array.isArray(doc.content.notes) && doc.content.notes.length > 0) {
    const primaryNote = doc.content.notes[0];
    if (Array.isArray(primaryNote.reasoning)) {
      return primaryNote.reasoning.join("\n\n");
    }
    if (typeof primaryNote.reasoning === "string") {
      return primaryNote.reasoning;
    }
  }

  // 2. Top-level explicit "reasoning"
  if (typeof doc.reasoning === "string") return doc.reasoning;
  if (Array.isArray(doc.reasoning)) return doc.reasoning.join("\n\n");

  // 3. Summary "reasoning"
  if (doc.summary && typeof doc.summary.reasoning === "string") {
    return doc.summary.reasoning;
  }

  // 4. Decision Agent
  if (doc.decision_agent) {
    if (typeof doc.decision_agent.reasoning === "string") {
      return doc.decision_agent.reasoning;
    }
    if (typeof doc.decision_agent.explanation === "string") {
      return doc.decision_agent.explanation;
    }
    if (Array.isArray(doc.decision_agent.reasons)) {
      return doc.decision_agent.reasons.join("\n\n");
    }
  }

  // 5. Top level "explanation"
  if (typeof doc.explanation === "string") return doc.explanation;

  // 6. Legacy / fallback
  if (Array.isArray(doc.decision_reasons)) {
    return doc.decision_reasons.join("\n\n");
  }

  return null;
}

// ----------------------
// EXPRESS MIDDLEWARE
// ----------------------

app.use(express.static("."));
app.use(express.json());

// ----------------------
// CONFIG ENDPOINT
// ----------------------

app.get("/api/config", (req, res) => {
  res.json({
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  });
});

// ----------------------
// DEMO EMITTER CONTROL
// ----------------------

app.post("/api/demo/start", async (req, res) => {
  try {
    await startEmitter();
    res.json({
      success: true,
      running: isEmitterRunning(),
      intervalMs: Number(process.env.DEMO_INTERVAL_MS || 15 * 60 * 1000),
      controllerFunction: resolveControllerFunctionName(),
    });
  } catch (error) {
    console.error("❌ [DEMO] Failed to start emitter:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start demo emitter",
      details: error.message,
    });
  }
});

app.post("/api/demo/stop", (req, res) => {
  try {
    stopEmitter();
    res.json({
      success: true,
      running: isEmitterRunning(),
    });
  } catch (error) {
    console.error("❌ [DEMO] Failed to stop emitter:", error);
    res.status(500).json({
      success: false,
      error: "Failed to stop demo emitter",
      details: error.message,
    });
  }
});

app.get("/api/demo/status", (req, res) => {
  res.json({
    running: isEmitterRunning(),
    intervalMs: Number(process.env.DEMO_INTERVAL_MS || 15 * 60 * 1000),
    controllerFunction: resolveControllerFunctionName(),
  });
});

// ----------------------
// HITL LEARNING HOOK
// ----------------------

async function applyLearningFromVerdict(item, verdict, actor, ts) {
  try {
    const fromAddr = item.from_addr || item.from || "";
    const fromDomain =
      item.from_domain ||
      (fromAddr.includes("@") ? fromAddr.split("@")[1] : "unknown");

    const pk = `domain#${fromDomain}`;
    const sk = `verdict#${ts}`;

    const feedbackItem = {
      pk,
      sk,
      verdict,
      actor,
      run_id: item.run_id || item.id || "",
      from_addr: fromAddr,
      from_domain: fromDomain,
      created_ts: ts,
      trust_tier: verdict === "allow" ? "trusted" : "blocked",
      log_bucket: item.log_bucket || null,
      log_key: item.log_key || null,
    };

    await dynamo
      .put({
        TableName: FEEDBACK_TABLE,
        Item: feedbackItem,
      })
      .promise();

    console.log("[HITL] Feedback recorded for learning:", feedbackItem);
  } catch (err) {
    console.error("[HITL] Feedback logging failed:", err);
  }
}

// ----------------------
// HITL API: LIST PENDING QUEUE ITEMS
// ----------------------

app.get("/api/hitl/pending", async (req, res) => {
  try {
    console.log("[HITL] Listing pending queue items");

    const params = {
      TableName: HITL_TABLE,
      FilterExpression: "#status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":pending": "pending" },
      Limit: 100,
    };

    const data = await dynamo.scan(params).promise();
    const items = data.Items || [];

    // Enrich each queue item with log details from S3
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const logBucket = item.log_bucket || METRICS_BUCKET;
        const logKey = item.log_key;

        if (!logBucket || !logKey) {
          return item;
        }

        try {
          const obj = await s3
            .getObject({ Bucket: logBucket, Key: logKey })
            .promise();
          const doc = JSON.parse(obj.Body.toString("utf8"));

          const bodyPreview = extractBodyPreview(doc);
          const reasoningText = extractReasoning(doc);

          const fromAddr =
            doc.compact?.from?.addr || item.from_addr || "unknown";
          const toAddr = doc.compact?.to || "unknown";
          const subject = doc.compact?.subject || item.subject || "(no subject)";

          const classification = doc.summary?.classification || "unknown";
          const confidence =
            typeof doc.summary?.confidence === "number"
              ? doc.summary.confidence
              : null;

          const hitlStatus =
            doc.hitl?.status || doc.decision_agent?.hitl?.status || item.status;

          return {
            ...item,
            sender: fromAddr,
            recipient: toAddr,
            subject,
            classification,
            confidence,
            hitl_status: hitlStatus,
            body_preview: bodyPreview,
            body_sanitized: bodyPreview,
            sanitizedBody: bodyPreview,
            reasoning: reasoningText,
            ai_notes: reasoningText,
            log_compact: doc.compact || null,
            log_summary: doc.summary || null,
            log_decision: doc.decision || null,
            log_hitl: doc.hitl || doc.decision_agent?.hitl || null,
            s3_bucket: logBucket,
            s3_key: logKey,
          };
        } catch (err) {
          console.error(
            "[HITL] Failed to enrich item from S3",
            item.id,
            item.log_key,
            err
          );
          return {
            ...item,
            s3_bucket: logBucket,
            s3_key: logKey,
          };
        }
      })
    );

    res.json({
      success: true,
      items: enrichedItems,
    });
  } catch (err) {
    console.error("[HITL] List pending failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to list pending HITL items",
      details: err.message,
    });
  }
});

// ----------------------
// HITL API: APPLY VERDICT
// ----------------------

app.post("/api/hitl/:id/verdict", async (req, res) => {
  const { id } = req.params;
  const { verdict, actor, notes } = req.body || {};

  if (!verdict || !["allow", "block"].includes(verdict)) {
    return res.status(400).json({
      success: false,
      error: 'verdict must be "allow" or "block"',
    });
  }

  const actorName = actor || "unknown";
  const ts = new Date().toISOString();

  try {
    const getResp = await dynamo
      .get({
        TableName: HITL_TABLE,
        Key: { id },
      })
      .promise();

    const item = getResp.Item;
    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Queue item not found",
      });
    }

    await dynamo
      .update({
        TableName: HITL_TABLE,
        Key: { id },
        UpdateExpression:
          "SET #status = :resolved, verdict = :verdict, actor = :actor, notes = :notes, resolved_ts = :ts",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":resolved": "resolved",
          ":verdict": verdict,
          ":actor": actorName,
          ":notes": notes || "",
          ":ts": ts,
        },
      })
      .promise();

    let s3Location = null;
    if (item.log_bucket && item.log_key) {
      const obj = await s3
        .getObject({
          Bucket: item.log_bucket,
          Key: item.log_key,
        })
        .promise();

      const bodyText = obj.Body.toString("utf8");
      let doc = JSON.parse(bodyText);

      const newHitl = {
        status: "resolved",
        actor: actorName,
        verdict,
        notes: notes || "",
        ts,
      };

      doc.hitl = newHitl;

      if (doc.decision_agent && doc.decision_agent.hitl) {
        doc.decision_agent.hitl = newHitl;
      }

      doc.queue = doc.queue || {};
      doc.queue.status = "resolved";
      doc.queue.resolved_ts = ts;

      await s3
        .putObject({
          Bucket: item.log_bucket,
          Key: item.log_key,
          Body: JSON.stringify(doc),
          ContentType: "application/json",
        })
        .promise();

      s3Location = { bucket: item.log_bucket, key: item.log_key };
    }

    await applyLearningFromVerdict(item, verdict, actorName, ts);

    res.json({
      success: true,
      id,
      status: "resolved",
      verdict,
      actor: actorName,
      s3Updated: !!s3Location,
      s3Location,
    });
  } catch (err) {
    console.error("[HITL] Verdict update failed:", err);
    res.status(500).json({
      success: false,
      error: "Failed to apply verdict",
      details: err.message,
    });
  }
});

// ----------------------
// PERFORMANCE METRICS API
// ----------------------

app.get("/api/metrics", async (req, res) => {
  const windowDays = parseInt(req.query.windowDays || "7", 10);
  const now = dayjs().utc();

  const metrics = {
    total: 0,
    quarantined: 0,
    it_review: 0,
    allow: 0,
    errors: 0,
    avgElapsed: 0,
    phiDetected: 0,
    classificationDist: {},
    trend: [] // Array of { date: 'YYYY-MM-DD', count: N }
  };

  let elapsedSum = 0;
  const dailyCounts = {}; // Map date -> count

  // Initialize daily counts for the window
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = now.subtract(i, "day").format("YYYY-MM-DD");
    dailyCounts[d] = 0;
  }

  try {
    const prefixes = [];
    for (let i = 0; i < windowDays; i++) {
      const d = now.subtract(i, "day");
      const year = d.year();
      const month = pad2(d.month() + 1);
      const day = pad2(d.date());
      prefixes.push(`${METRICS_PREFIX}/${year}/${month}/${day}/`);
    }

    for (const prefix of prefixes) {
      let continuationToken;

      do {
        const listResp = await s3
          .listObjectsV2({
            Bucket: METRICS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
          .promise();

        for (const obj of listResp.Contents || []) {
          if (!obj.Key.endsWith(".json")) continue;

          // Fetch minimal body if possible, or full body
          const data = await s3
            .getObject({ Bucket: METRICS_BUCKET, Key: obj.Key })
            .promise();
          const body = JSON.parse(data.Body.toString("utf8"));

          metrics.total++;
          if (body.elapsed_ms != null) {
            elapsedSum += body.elapsed_ms;
          }

          const dCode = body.decision;
          if (dCode === "ALLOW") metrics.allow++;
          else if (dCode === "IT_REVIEW") metrics.it_review++;
          else if (dCode === "QUARANTINE") metrics.quarantined++;

          if (body.phi?.entities_detected > 0) metrics.phiDetected++;

          const cls = body.summary?.classification || "unknown";
          metrics.classificationDist[cls] =
            (metrics.classificationDist[cls] || 0) + 1;

          if (body.statusCode && body.statusCode !== 200) {
            metrics.errors++;
          }

          // Trend Logic
          const tsStr = body.timestamp || body.compact?.date_iso || obj.LastModified;
          if (tsStr) {
            const dateKey = dayjs(tsStr).utc().format("YYYY-MM-DD");
            if (dailyCounts.hasOwnProperty(dateKey)) {
              dailyCounts[dateKey]++;
            }
          }
        }

        continuationToken = listResp.IsTruncated
          ? listResp.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }

    metrics.avgElapsed = metrics.total ? elapsedSum / metrics.total : 0;

    // Flatten dailyCounts to array
    metrics.trend = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count
    }));

    res.json({ success: true, metrics });
  } catch (err) {
    console.error("Error aggregating metrics:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ----------------------
// HISTORY / ACTIVITY LOG API
// ----------------------

app.get("/api/history", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'from and to (YYYY-MM-DD) are required query parameters',
      });
    }

    const start = dayjs.utc(from, "YYYY-MM-DD").startOf("day");
    const end = dayjs.utc(to, "YYYY-MM-DD").endOf("day");

    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
      });
    }

    const prefixes = [];
    for (let d = start.clone(); !d.isAfter(end); d = d.add(1, "day")) {
      const year = d.year();
      const month = pad2(d.month() + 1);
      const day = pad2(d.date());
      prefixes.push(`${METRICS_PREFIX}/${year}/${month}/${day}/`);
    }

    const history = [];

    for (const prefix of prefixes) {
      let continuationToken;
      do {
        const listResp = await s3
          .listObjectsV2({
            Bucket: METRICS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
          .promise();

        for (const obj of listResp.Contents || []) {
          if (!obj.Key.endsWith(".json")) continue;

          const data = await s3
            .getObject({ Bucket: METRICS_BUCKET, Key: obj.Key })
            .promise();
          const body = JSON.parse(data.Body.toString("utf8"));

          const tsRaw =
            body.timestamp ||
            body.compact?.date_iso ||
            obj.LastModified?.toISOString();
          const ts = dayjs.utc(tsRaw);
          if (!ts.isValid()) continue;
          if (ts.isBefore(start) || ts.isAfter(end)) continue;

          const fromAddr =
            body.compact?.from?.addr ||
            body.decision_agent?.signals?.from_addr ||
            "unknown";
          const toAddr =
            body.compact?.to ||
            body.decision_agent?.signals?.to_addr ||
            "unknown";
          const subject = body.compact?.subject || "(no subject)";
          const classification = body.summary?.classification || "unknown";
          const confidence =
            typeof body.summary?.confidence === "number"
              ? body.summary.confidence
              : null;
          const risk = body.summary?.sender_risk || 0;
          const phiEntities = body.phi?.entities_detected || 0;
          const hitlStatus = body.hitl?.status || "none";
          const hitlVerdict = body.hitl?.verdict || null;

          const decisionCode = body.decision;
          let aiDecisionText = "Unknown";
          if (decisionCode === "ALLOW") aiDecisionText = "Allowed";
          else if (decisionCode === "IT_REVIEW")
            aiDecisionText = "Requires HITL review";
          else if (decisionCode === "QUARANTINE")
            aiDecisionText = "Quarantined";

          let itDecisionText = "—";
          if (hitlVerdict === "allow") itDecisionText = "Sent";
          else if (hitlVerdict === "block") itDecisionText = "Quarantined";

          let latencyText = "–";
          if (body.elapsed_ms != null) {
            if (body.elapsed_ms >= 1000) {
              latencyText = (body.elapsed_ms / 1000).toFixed(1) + "s";
            } else {
              latencyText = body.elapsed_ms + "ms";
            }
          }

          const runId =
            body.sender_intel?.raw?.ids?.message_id ||
            body.compact?.message_id ||
            obj.Key;

          const bodyPreview = extractBodyPreview(body);
          const reasoningText = extractReasoning(body);

          history.push({
            id: runId,
            timestamp: ts.toISOString(),
            sender: fromAddr,
            recipient: toAddr,
            subject,
            classification,
            confidence,
            aiDecision: aiDecisionText,
            itDecision: itDecisionText,
            latency: latencyText,
            decisionCode,
            hitl_status: hitlStatus,
            hitl_verdict: hitlVerdict,
            risk,
            phi_entities: phiEntities,
            s3_bucket: METRICS_BUCKET,
            s3_key: obj.Key,
            body_preview: bodyPreview,
            body_sanitized: bodyPreview,
            sanitizedBody: bodyPreview,
            reasoning: reasoningText,
            ai_notes: reasoningText,
          });
        }

        continuationToken = listResp.IsTruncated
          ? listResp.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ----------------------
// LOG DETAIL API (for modals)
// ----------------------

app.get("/api/log/detail", async (req, res) => {
  try {
    const bucket = req.query.bucket || METRICS_BUCKET;
    const key = req.query.key;

    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        message: "bucket and key are required query parameters",
      });
    }

    const obj = await s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();

    const doc = JSON.parse(obj.Body.toString("utf8"));
    const bodyPreview = extractBodyPreview(doc);
    const reasoningText = extractReasoning(doc);

    res.json({
      success: true,
      headers: {
        from: doc.compact?.from?.addr || null,
        to: doc.compact?.to || null,
        subject: doc.compact?.subject || null,
        timestamp: doc.timestamp || doc.compact?.date_iso || null,
      },
      body_preview: bodyPreview,
      reasoning: reasoningText,
      raw: doc,
    });
  } catch (err) {
    console.error("[LOG] detail fetch failed:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load log detail",
      details: err.message,
    });
  }
});

// ----------------------
// FULL BACKEND ENDPOINT
// ----------------------

app.post("/api/email/analyze-full", async (req, res) => {
  try {
    console.log("📨 [FULL] Received full email analysis request");

    const { mime_raw, mime_b64 } = req.body;

    if (!mime_raw && !mime_b64) {
      return res.status(400).json({
        success: false,
        error: "Either mime_raw or mime_b64 is required",
      });
    }

    const functionName = resolveControllerFunctionName();

    console.log("🚀 [FULL] Invoking Lambda:", functionName);
    console.log("    Region:", process.env.AWS_REGION || "us-east-2");

    const payload = {};
    if (mime_raw) payload.mime_raw = mime_raw;
    else if (mime_b64) payload.mime_b64 = mime_b64;

    const lambdaResponse = await lambda
      .invoke({
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const responsePayload = JSON.parse(lambdaResponse.Payload || "{}");

    console.log("✅ [FULL] Lambda response received");
    console.log("    Decision:", responsePayload.decision);
    console.log("    Risk:", responsePayload.risk);
    console.log("    PHI entities:", responsePayload.phi_entities);

    if (lambdaResponse.FunctionError) {
      console.error("❌ [FULL] Lambda function error:", responsePayload);
      return res.status(500).json({
        success: false,
        error: "Lambda function error",
        details: responsePayload,
      });
    }

    res.json({
      success: true,
      data: responsePayload,
    });
  } catch (error) {
    console.error("❌ [FULL] Email analysis failed:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});

// ----------------------
// SIMPLE /api/analyze ROUTE
// ----------------------

app.post("/api/analyze", async (req, res) => {
  try {
    console.log("📨 [SIMPLE] Received analysis request from frontend");

    const { emailContent, context } = req.body;

    if (!emailContent) {
      return res.status(400).json({
        success: false,
        error: "emailContent field cannot be empty",
      });
    }

    const lambdaUrl = process.env.AWS_LAMBDA_ENDPOINT;

    if (!lambdaUrl || lambdaUrl === "PLACEHOLDER_URL") {
      console.error("❌ AWS_LAMBDA_ENDPOINT not configured in .env file");
      return res.status(500).json({
        success: false,
        error: "Server configuration error: Missing AWS Lambda endpoint",
      });
    }

    console.log("🚀 [SIMPLE] Forwarding request to AWS Lambda:", lambdaUrl);

    const lambdaResponse = await fetch(lambdaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emailContent,
        context: context || "general",
      }),
      timeout: 30000,
    });

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error(
        "❌ [SIMPLE] Lambda returned error:",
        lambdaResponse.status,
        errorText
      );
      return res.status(lambdaResponse.status).json({
        success: false,
        error: `AWS Lambda error: ${lambdaResponse.statusText}`,
        details: errorText,
      });
    }

    const lambdaData = await lambdaResponse.json();
    console.log("✅ [SIMPLE] Lambda response successful");

    res.json({
      success: true,
      data: lambdaData,
    });
  } catch (error) {
    console.error("❌ [SIMPLE] Proxy request failed:", error);

    if (error.name === "FetchError") {
      return res.status(503).json({
        success: false,
        error: "Unable to connect to AWS Lambda service",
        details: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});

// ----------------------
// HEALTH CHECK
// ----------------------

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    lambdaConfigured:
      !!(
        process.env.AWS_LAMBDA_ENDPOINT &&
        process.env.AWS_LAMBDA_ENDPOINT !== "PLACEHOLDER_URL"
      ),
    senderIntelConfigured:
      !!(
        process.env.SENDER_INTEL_CONTROLLER_FUNCTION ||
        process.env.SENDER_CONTROLLER_FN
      ),
    awsRegion: process.env.AWS_REGION || "us-east-2",
    demoEmitterRunning: isEmitterRunning(),
    hitlTable: HITL_TABLE,
    metricsBucket: METRICS_BUCKET,
    metricsPrefix: METRICS_PREFIX,
    feedbackTable: FEEDBACK_TABLE,
  });
});

// ----------------------
// ROOT ROUTE
// ----------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// ----------------------
// HITL DASHBOARD METRICS (Cards)
// ----------------------
app.get("/api/hitl/stats", async (req, res) => {
  try {
    const now = dayjs().utc();
    const todayStr = now.format("YYYY-MM-DD");

    // Scan DDB (ok for demo scale, for prod use GSIs)
    let items = [];
    let lastEval;
    do {
      const result = await dynamo.scan({
        TableName: HITL_TABLE,
        ExclusiveStartKey: lastEval
      }).promise();
      items = items.concat(result.Items || []);
      lastEval = result.LastEvaluatedKey;
    } while (lastEval);

    let pending = 0;
    let reviewedToday = 0;
    let totalResolved = 0;
    let agreements = 0;
    let totalDurationSec = 0;

    for (const item of items) {
      const status = item.status || "";
      
      // 1. Pending Count
      if (status === "pending") {
        pending++;
        continue;
      }

      // 2. Filter for Resolved
      if (status !== "resolved") continue;
      
      totalResolved++;

      // 3. Reviewed Today
      // resolved_ts format: "2025-11-21T01:33:25Z"
      const resolvedTs = item.resolved_ts ? dayjs(item.resolved_ts) : null;
      if (resolvedTs && resolvedTs.isValid()) {
        if (resolvedTs.format("YYYY-MM-DD") === todayStr) {
          reviewedToday++;
        }

        // 4. Avg Review Time
        const createdTs = item.created_ts ? dayjs(item.created_ts) : null;
        if (createdTs && createdTs.isValid()) {
          const diff = resolvedTs.diff(createdTs, "second");
          if (diff > 0) totalDurationSec += diff;
        }
      }

      // 5. Accuracy (AI Decision vs Human Verdict)
      // item.decision = "ALLOW" | "QUARANTINE"
      // item.verdict = "allow" | "block"
      const aiDec = (item.decision || "").toUpperCase();
      const humDec = (item.verdict || "").toLowerCase();

      let agreed = false;
      if (aiDec === "ALLOW" && humDec === "allow") agreed = true;
      else if (aiDec === "QUARANTINE" && humDec === "block") agreed = true;
      
      // Note: If AI said "IT_REVIEW", we generally don't count that against accuracy
      // as it correctly asked for help.
      if (agreed) agreements++;
    }

    const accuracy = totalResolved > 0 ? (agreements / totalResolved) : 0;
    const avgTime = totalResolved > 0 ? (totalDurationSec / totalResolved) : 0;

    res.json({
      success: true,
      pending,
      reviewedToday,
      accuracy,      // 0.0 to 1.0
      avgTimeSeconds: avgTime
    });

  } catch (err) {
    console.error("[HITL] Stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------
// SERVER START
// ----------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(
    `Healthcare Email Defense Demo running on http://0.0.0.0:${PORT}`
  );
  console.log(
    `Accessible at http://is-info492.ischool.uw.edu:${PORT}`
  );
  console.log(
    `📡 Simple classifier endpoint (AWS_LAMBDA_ENDPOINT): ${
      process.env.AWS_LAMBDA_ENDPOINT || "Not configured"
    }`
  );
  console.log(
    `📡 Full pipeline Lambda (SENDER_INTEL_CONTROLLER_FUNCTION / SENDER_CONTROLLER_FN): ${resolveControllerFunctionName()}`
  );
  console.log(`📂 HITL queue table: ${HITL_TABLE}`);
  console.log(
    `📊 Decisions / metrics bucket: ${METRICS_BUCKET} (prefix: ${METRICS_PREFIX})`
  );
  console.log(`🧠 Feedback table: ${FEEDBACK_TABLE}`);
  console.log(
    "Make sure to set OPENROUTER_API_KEY in your .env file if you use OpenRouter features."
  );
});