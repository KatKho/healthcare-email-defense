const fs = require('fs');
const path = require('path');

// Paths
const datasetPath = path.join(__dirname, 'data', 'synthetic_emails.json');
const emailsDir = path.join(__dirname, 'emails');

// Ensure emails folder exists
if (!fs.existsSync(emailsDir)) {
  fs.mkdirSync(emailsDir);
}

// Load JSON dataset
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

// Select random email
const randomEmail = dataset[Math.floor(Math.random() * dataset.length)];
const timestamp = Date.now();

// Add timestamp
const emailWithTimestamp = {
  ...randomEmail,
  received_at: new Date().toISOString(),
  id: timestamp
};

// Save email
const filePath = path.join(emailsDir, `${timestamp}.json`);
fs.writeFileSync(filePath, JSON.stringify(emailWithTimestamp, null, 2));

console.log(`[INFO] Selected random email: ${randomEmail.subject}`);
console.log(`[INFO] Saved to emails/${timestamp}.json`);
