const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// API endpoint to get the OpenRouter API key
app.get('/api/config', (req, res) => {
    res.json({
        openrouterApiKey: process.env.OPENROUTER_API_KEY || ''
    });
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Healthcare Email Defense Demo running on http://0.0.0.0:${PORT}`);
    console.log(`Accessible at http://is-info492.ischool.uw.edu:${PORT}`);
    console.log('Make sure to set OPENROUTER_API_KEY in your .env file');
});


