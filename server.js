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

app.listen(PORT, () => {
    console.log(`Healthcare Email Defense Demo running on http://localhost:${PORT}`);
    console.log('Make sure to set OPENROUTER_API_KEY in your .env file');
});


