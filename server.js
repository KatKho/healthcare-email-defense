const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// Parse JSON request bodies
app.use(express.json());

// API endpoint to get the OpenRouter API key
app.get('/api/config', (req, res) => {
    res.json({
        openrouterApiKey: process.env.OPENROUTER_API_KEY || ''
    });
});

// AWS Lambda proxy route
app.post('/api/analyze', async (req, res) => {
  try {
    console.log('📨 Received analysis request from frontend');
    
    const { emailContent, context } = req.body;
    
    // Validate input
    if (!emailContent) {
      return res.status(400).json({
        success: false,
        error: 'emailContent field cannot be empty'
      });
    }

    // AWS Lambda API Gateway URL
    const lambdaUrl = process.env.AWS_LAMBDA_ENDPOINT;
    
    if (!lambdaUrl || lambdaUrl === 'PLACEHOLDER_URL') {
      console.error('❌ AWS_LAMBDA_ENDPOINT not configured in .env file');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Missing AWS Lambda endpoint'
      });
    }

    console.log('🚀 Forwarding request to AWS Lambda:', lambdaUrl);

    // Forward request to AWS Lambda
    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        emailContent,
        context: context || 'general'
      }),
      timeout: 30000
    });

    // Check Lambda response status
    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda returned error:', lambdaResponse.status, errorText);
      return res.status(lambdaResponse.status).json({
        success: false,
        error: `AWS Lambda error: ${lambdaResponse.statusText}`,
        details: errorText
      });
    }

    // Parse Lambda response data
    const lambdaData = await lambdaResponse.json();
    console.log('✅ Lambda response successful');

    // Return Lambda response to frontend
    res.json({
      success: true,
      data: lambdaData
    });

  } catch (error) {
    console.error('❌ Proxy request failed:', error);
    
    if (error.name === 'FetchError') {
      return res.status(503).json({
        success: false,
        error: 'Unable to connect to AWS Lambda service',
        details: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lambdaConfigured: !!(process.env.AWS_LAMBDA_ENDPOINT && process.env.AWS_LAMBDA_ENDPOINT !== 'PLACEHOLDER_URL')
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`Healthcare Email Defense Demo running on http://0.0.0.0:${PORT}`);
    console.log(`Accessible at http://is-info492.ischool.uw.edu:${PORT}`);
    console.log(`📡 AWS Lambda endpoint: ${process.env.AWS_LAMBDA_ENDPOINT || 'Not configured'}`);
    console.log('Make sure to set OPENROUTER_API_KEY in your .env file');
});


