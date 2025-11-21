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

// Prefer explicit credentials from .env if present,
// otherwise fall back to default AWS provider chain (CLI profile, etc.).
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

// Lambda client for direct invocation of sender-intel-controller
const lambda = new AWS.Lambda();

// DynamoDB + S3 for HITL queue + log patching + metrics + feedback
const dynamo = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const HITL_TABLE = process.env.HITL_TABLE || "sender_intel_hitl_queue";

// These now exactly match your .env names
const DECISIONS_BUCKET =
  process.env.S3_DECISIONS_BUCKET ||
  "sc-intel-decisions-455185968614-us-east-2";
const DECISIONS_PREFIX = process.env.S3_DECISIONS_PREFIX || "runs";

const FEEDBACK_TABLE =
  process.env.FEEDBACK_TABLE || "sender_feedback_table";

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

// ----------------------
// EXPRESS MIDDLEWARE
// ----------------------

app.use(express.static("."));
app.use(express.json());

// ----------------------
// CONFIG ENDPOINT (OpenRouter)
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
// Enriches DDB items with S3 decision log data
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

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const enriched = { ...item };

        if (item.log_bucket && item.log_key) {
          try {
            const obj = await s3
              .getObject({
                Bucket: item.log_bucket,
                Key: item.log_key,
              })
              .promise();

            const bodyText = obj.Body.toString("utf8");
            const log = JSON.parse(bodyText);

            const summary = log.summary || {};
            const compact = log.compact || {};
            const decisionAgent = log.decision_agent || {};
            const signals = decisionAgent.signals || {};
            const hitl = log.hitl || {};
            const queueDoc = log.queue || {};

            enriched.summary = summary;
            enriched.compact = compact;
            enriched.decision = log.decision;
            enriched.decision_reasons = log.decision_reasons || [];
            enriched.hitl = hitl;
            enriched.queue_doc = queueDoc;
            enriched.decision_agent = decisionAgent;

            enriched.to_addr =
              item.to_addr ||
              compact.to ||
              signals.to_addr ||
              "unknown";

            enriched.classification =
              item.classification ||
              summary.classification ||
              signals.classification ||
              "unknown";

            if (typeof summary.confidence === "number") {
              enriched.confidence = summary.confidence;
            } else if (typeof signals.confidence === "number") {
              enriched.confidence = signals.confidence;
            }

            const riskFromSummary = summary.sender_risk;
            const riskFromAgent = decisionAgent.risk;
            enriched.sender_risk =
              typeof riskFromSummary === "number"
                ? riskFromSummary
                : typeof riskFromAgent === "number"
                ? riskFromAgent
                : item.risk ?? null;

            const phiFromAgent = decisionAgent.signals?.phi_entities;
            const phiFromSummary = summary.has_phi ? 1 : 0;
            const phiFromTopLevel =
              typeof log.phi_entities === "number" ? log.phi_entities : null;

            enriched.phi_entities =
              typeof phiFromAgent === "number"
                ? phiFromAgent
                : phiFromTopLevel !== null
                ? phiFromTopLevel
                : phiFromSummary;

            if (hitl.status && hitl.status !== item.status) {
              enriched.hitl_status = hitl.status;
            } else {
              enriched.hitl_status = "required";
            }
          } catch (err) {
            console.error(
              "[HITL] Failed to enrich item from S3 log:",
              item.log_bucket,
              item.log_key,
              err
            );
          }
        }

        return enriched;
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
// HITL API: APPLY VERDICT (ALLOW/BLOCK)
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
// Uses decision logs in S3_DECISIONS_BUCKET / S3_DECISIONS_PREFIX
// ----------------------

app.get("/api/metrics", async (req, res) => {
  const windowDays = parseInt(req.query.windowDays || "7", 10);
  const now = dayjs().utc();

  const metrics = {
    total: 0,
    quarantined: 0,
    phiDetected: 0,
    errors: 0, // IT overrides ↓
    avgElapsed: 0,
  };

  let elapsedSum = 0;
  let elapsedCount = 0;

  try {
    const prefixes = [];
    for (let i = 0; i < windowDays; i++) {
      const d = now.subtract(i, "day");
      const year = d.year();
      const month = pad2(d.month() + 1);
      const day = pad2(d.date());
      prefixes.push(`${DECISIONS_PREFIX}/${year}/${month}/${day}/`);
    }

    for (const prefix of prefixes) {
      let continuationToken;

      do {
        const listResp = await s3
          .listObjectsV2({
            Bucket: DECISIONS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
          .promise();

        for (const obj of listResp.Contents || []) {
          if (!obj.Key.endsWith(".json")) continue;

          const data = await s3
            .getObject({ Bucket: DECISIONS_BUCKET, Key: obj.Key })
            .promise();
          const body = JSON.parse(data.Body.toString("utf8"));

          metrics.total++;

          if (body.decision === "QUARANTINE") {
            metrics.quarantined++;
          }

          const hasPhiSummary = body.summary?.has_phi === true;
          const phiFromAgent = body.decision_agent?.signals?.phi_entities;
          const phiFromTop = body.phi_entities;

          if (
            hasPhiSummary ||
            (typeof phiFromAgent === "number" && phiFromAgent > 0) ||
            (typeof phiFromTop === "number" && phiFromTop > 0)
          ) {
            metrics.phiDetected++;
          }

          let elapsedMs = null;
          if (typeof body.elapsed_ms === "number") {
            elapsedMs = body.elapsed_ms;
          } else if (typeof body.timings?.elapsed_ms === "number") {
            elapsedMs = body.timings.elapsed_ms;
          } else if (
            typeof body.sender_intel?.raw?.features?.["osint.elapsed_ms"] ===
            "number"
          ) {
            elapsedMs =
              body.sender_intel.raw.features["osint.elapsed_ms"];
          }

          if (elapsedMs != null) {
            elapsedSum += elapsedMs;
            elapsedCount++;
          }

          const aiDecision = body.decision_agent?.decision || body.decision;
          const hitlVerdict = body.hitl?.verdict;

          if (
            hitlVerdict &&
            aiDecision &&
            hitlVerdict.toUpperCase() !== aiDecision.toUpperCase()
          ) {
            metrics.errors++;
          }
        }

        continuationToken = listResp.IsTruncated
          ? listResp.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }

    metrics.avgElapsed =
      elapsedCount > 0 ? elapsedSum / elapsedCount : 0;

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
      prefixes.push(`${DECISIONS_PREFIX}/${year}/${month}/${day}/`);
    }

    const history = [];

    for (const prefix of prefixes) {
      let continuationToken;
      do {
        const listResp = await s3
          .listObjectsV2({
            Bucket: DECISIONS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
          .promise();

        for (const obj of listResp.Contents || []) {
          if (!obj.Key.endsWith(".json")) continue;

          const data = await s3
            .getObject({ Bucket: DECISIONS_BUCKET, Key: obj.Key })
            .promise();
          const body = JSON.parse(data.Body.toString("utf8"));

          const tsRaw =
            body.timestamp ||
            body.compact?.date_iso ||
            (obj.LastModified ? obj.LastModified.toISOString() : null);
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
          const classification =
            body.summary?.classification ||
            body.decision_agent?.signals?.classification ||
            "unknown";
          const confidence =
            typeof body.summary?.confidence === "number"
              ? body.summary.confidence
              : typeof body.decision_agent?.signals?.confidence === "number"
              ? body.decision_agent.signals.confidence
              : null;
          const risk =
            typeof body.summary?.sender_risk === "number"
              ? body.summary.sender_risk
              : typeof body.decision_agent?.risk === "number"
              ? body.decision_agent.risk
              : 0;

          const phiFromAgent =
            body.decision_agent?.signals?.phi_entities;
          const phiFromTop =
            typeof body.phi_entities === "number"
              ? body.phi_entities
              : null;
          const phiFromSummary = body.summary?.has_phi ? 1 : 0;

          const phiEntities =
            typeof phiFromAgent === "number"
              ? phiFromAgent
              : phiFromTop !== null
              ? phiFromTop
              : phiFromSummary;

          const hitlStatus = body.hitl?.status || "none";
          const hitlVerdict = body.hitl?.verdict || null;

          const aiDecision =
            body.decision_agent?.decision || body.decision;
          let aiDecisionText = "Unknown";
          if (aiDecision === "ALLOW") aiDecisionText = "Allowed";
          else if (aiDecision === "QUARANTINE")
            aiDecisionText = "Quarantined";

          let itDecisionText = "—";
          if (hitlVerdict === "allow") itDecisionText = "Sent";
          else if (hitlVerdict === "block") itDecisionText = "Quarantined";

          let elapsedMs = null;
          if (typeof body.elapsed_ms === "number") {
            elapsedMs = body.elapsed_ms;
          } else if (typeof body.timings?.elapsed_ms === "number") {
            elapsedMs = body.timings.elapsed_ms;
          } else if (
            typeof body.sender_intel?.raw?.features?.[
              "osint.elapsed_ms"
            ] === "number"
          ) {
            elapsedMs =
              body.sender_intel.raw.features["osint.elapsed_ms"];
          }

          let latencyText = "–";
          if (elapsedMs != null) {
            if (elapsedMs >= 1000) {
              latencyText = (elapsedMs / 1000).toFixed(1) + "s";
            } else {
              latencyText = `${elapsedMs}ms`;
            }
          }

          const runId =
            body.sender_intel?.raw?.ids?.message_id ||
            body.compact?.message_id ||
            obj.Key;

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
            decisionCode: body.decision,
            hitl_status: hitlStatus,
            hitl_verdict: hitlVerdict,
            risk,
            phi_entities: phiEntities,
            s3_bucket: DECISIONS_BUCKET,
            s3_key: obj.Key,
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
// FULL BACKEND ENDPOINT
// Uses sender-intel-controller Lambda directly
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
    if (mime_raw) {
      payload.mime_raw = mime_raw;
    } else if (mime_b64) {
      payload.mime_b64 = mime_b64;
    }

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
// (Proxy to API Gateway Lambda URL)
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
    decisionsBucket: DECISIONS_BUCKET,
    decisionsPrefix: DECISIONS_PREFIX,
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
    `📊 Decisions bucket: ${DECISIONS_BUCKET} (prefix: ${DECISIONS_PREFIX}/...)`
  );
  console.log(`🧠 Feedback table: ${FEEDBACK_TABLE}`);
  console.log(
    "Make sure to set OPENROUTER_API_KEY in your .env file if you use OpenRouter features."
  );
});
