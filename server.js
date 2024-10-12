require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Define a Trade schema
const tradeSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  direction: { type: String, required: true },
  expiryTime: { type: Number, required: true },  // Duration in seconds
  status: { type: String, default: 'live' },      // 'live' or 'completed'
  outcome: { type: String, default: null },       // 'won' or 'lost'
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date },                    // Store when the trade is completed
});

// Create the Trade model
const Trade = mongoose.model('Trade', tradeSchema);

// WebSocket setup
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Function to broadcast WebSocket messages
const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// POST route to place a new trade
app.post('/trades/new', async (req, res) => {
  try {
    const { amount, direction, expiryTime } = req.body;

    // Create a new trade
    const newTrade = new Trade({ amount, direction, expiryTime });
    await newTrade.save();

    // Broadcast the new trade to all connected clients
    broadcast({ type: 'NEW_TRADE', trade: newTrade });

    res.status(201).json({ message: 'Trade placed successfully', trade: newTrade });

    // Start processing the trade
    processTradeOutcome(newTrade._id, expiryTime);

  } catch (error) {
    console.error('Error placing trade:', error);
    res.status(500).json({ message: 'Failed to place trade', error });
  }
});

// Function to process trade outcome
const processTradeOutcome = async (tradeId, expiryTime) => {
  try {
    // Wait until the expiry time has passed
    await new Promise(resolve => setTimeout(resolve, expiryTime * 1000));

    // Simulate trade outcome (replace this with your business logic)
    const isWin = Math.random() < 0.5;
    const outcome = isWin ? 'won' : 'lost';

    // Update the trade with the outcome and mark it as completed
    const completedAt = new Date();
    const updatedTrade = await Trade.findByIdAndUpdate(tradeId, {
      status: 'completed',
      outcome,
      completedAt,
    }, { new: true });

    // Broadcast the trade completion to all connected clients
    broadcast({ type: 'TRADE_COMPLETED', trade: updatedTrade });

    console.log(`Trade ${tradeId} completed with outcome: ${outcome}`);
  } catch (error) {
    console.error('Error processing trade outcome:', error);
  }
};

// GET route to fetch the current live trade
app.get('/trades/live', async (req, res) => {
  try {
    const liveTrades = await Trade.find({ status: 'live' }).sort({ createdAt: -1 });

    if (liveTrades.length === 0) {
      return res.status(404).json({ message: 'No live trades found' });
    }

    res.json({ trades: liveTrades });
  } catch (error) {
    console.error('Error fetching live trades:', error);
    res.status(500).json({ message: 'Failed to fetch live trades', error });
  }
});

// GET route to fetch all completed trade logs
app.get('/trades/logs', async (req, res) => {
  try {
    const tradeLogs = await Trade.find({ status: 'completed' }).sort({ createdAt: -1 });
    res.json({ data: tradeLogs });
  } catch (error) {
    console.error('Error fetching trade logs:', error);
    res.status(500).json({ message: 'Failed to fetch trade logs', error });
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established.');

  ws.on('message', (message) => {
    console.log('Received from client:', message);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed.');
  });
});
