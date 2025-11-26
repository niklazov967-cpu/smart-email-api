const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Email API',
    status: 'running',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Email endpoint (placeholder)
app.post('/api/email/send', (req, res) => {
  const { to, subject, body } = req.body;
  
  if (!to || !subject || !body) {
    return res.status(400).json({
      error: 'Missing required fields: to, subject, body'
    });
  }

  // Placeholder response
  res.json({
    message: 'Email endpoint ready',
    data: { to, subject, body },
    note: 'Email sending functionality to be implemented'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Smart Email API running on http://localhost:${PORT}`);
  console.log(`📧 API endpoint: http://localhost:${PORT}/api/email/send`);
});

