// server.js (ESM)
import express from "express";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";
import AWS from "aws-sdk";
import { fileURLToPath } from "url";

import {
  startEmitter,
  stopEmitter,
  isRunning as isEmitterRunning,
} from "./emit_email.js";

// Load .env BEFORE using process.env
dotenv.config();

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

// Helper: resolve controller function name from env
function resolveControllerFunctionName() {
  return (
    process.env.SENDER_INTEL_CONTROLLER_FUNCTION ||
    process.env.SENDER_CONTROLLER_FN ||
    "sender-intel-controller"
  );
}

// ----------------------
// EXPRESS MIDDLEWARE
// ----------------------

// Serve static files (index.html, JS, CSS, etc.)
app.use(express.static("."));

// Parse JSON request bodies
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
// FULL BACKEND ENDPOINT
// Uses sender-intel-controller Lambda directly
// ----------------------

app.post("/api/email/analyze-full", async (req, res) => {
  try {
    console.log("📨 [FULL] Received full email analysis request");

    const { mime_raw, mime_b64 } = req.body;

    // Basic validation
    if (!mime_raw && !mime_b64) {
      return res.status(400).json({
        success: false,
        error: "Either mime_raw or mime_b64 is required",
      });
    }

    const functionName = resolveControllerFunctionName();

    console.log("🚀 [FULL] Invoking Lambda:", functionName);
    console.log("    Region:", process.env.AWS_REGION || "us-east-2");

    // Build payload for the controller Lambda
    const payload = {};
    if (mime_raw) {
      payload.mime_raw = mime_raw;
    } else if (mime_b64) {
      payload.mime_b64 = mime_b64;
    }

    // Invoke Lambda synchronously
    const lambdaResponse = await lambda
      .invoke({
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(payload),
      })
      .promise();

    // Parse Lambda response payload
    const responsePayload = JSON.parse(lambdaResponse.Payload || "{}");

    console.log("✅ [FULL] Lambda response received");
    console.log("    Decision:", responsePayload.decision);
    console.log("    Risk:", responsePayload.risk);
    console.log("    PHI entities:", responsePayload.phi_entities);

    // Check for function-level error
    if (lambdaResponse.FunctionError) {
      console.error("❌ [FULL] Lambda function error:", responsePayload);
      return res.status(500).json({
        success: false,
        error: "Lambda function error",
        details: responsePayload,
      });
    }

    // Return the Lambda’s decision envelope to the frontend
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

    // Validate input
    if (!emailContent) {
      return res.status(400).json({
        success: false,
        error: "emailContent field cannot be empty",
      });
    }

    // AWS Lambda API Gateway URL
    const lambdaUrl = process.env.AWS_LAMBDA_ENDPOINT;

    if (!lambdaUrl || lambdaUrl === "PLACEHOLDER_URL") {
      console.error("❌ AWS_LAMBDA_ENDPOINT not configured in .env file");
      return res.status(500).json({
        success: false,
        error: "Server configuration error: Missing AWS Lambda endpoint",
      });
    }

    console.log("🚀 [SIMPLE] Forwarding request to AWS Lambda:", lambdaUrl);

    // Forward request to AWS Lambda
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

    // Check Lambda response status
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

    // Parse Lambda response data
    const lambdaData = await lambdaResponse.json();
    console.log("✅ [SIMPLE] Lambda response successful");

    // Return Lambda response to frontend
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
  console.log(
    "Make sure to set OPENROUTER_API_KEY in your .env file if you use OpenRouter features."
  );
});
