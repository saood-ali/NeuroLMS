import express from 'express';

const app = express();

app.get('/api/v1/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
