require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "https://storecashier.netlify.app",
    "https://midtrans-backend-ashy.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json());

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    mode: process.env.MIDTRANS_IS_PRODUCTION === "true" ? "PRODUCTION" : "SANDBOX",
    timestamp: new Date().toISOString(),
    message: "Backend is running on Vercel"
  });
});

// Create transaction endpoint
app.post("/create-transaction", async (req, res) => {
  console.log("MIDTRANS_SERVER_KEY exists:", !!process.env.MIDTRANS_SERVER_KEY);
  console.log("Request body:", req.body);
  
  try {
    const { amount, orderId, customer } = req.body;

    if (!amount || !orderId) {
      return res.status(400).json({
        success: false,
        error: "amount dan orderId wajib",
      });
    }

    const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";
    const MIDTRANS_API = IS_PRODUCTION
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";

    const auth = Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64");

    const snapResponse = await axios.post(
      `${MIDTRANS_API}/snap/v1/transactions`,
      {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: {
          first_name: customer?.name || "Pembeli",
          email: customer?.email || "customer@example.com",
          phone: customer?.phone || "081234567890",
        },
        enabled_payments: ["qris", "gopay", "shopeepay", "other_qris"],
        callbacks: {
          finish: "https://storecashier.netlify.app/payment-success",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    const { token, redirect_url } = snapResponse.data;

    res.json({
      success: true,
      snap_token: token,
      redirect_url: redirect_url,
      order_id: orderId,
      amount: amount,
    });
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error_messages?.[0] || err.message,
    });
  }
});

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const notification = req.body;
    const { order_id, transaction_status } = notification;
    console.log(`Webhook: Order ${order_id} - ${transaction_status}`);
    res.json({ status: "OK" });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} tidak ditemukan`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Export untuk Vercel
module.exports = app;

// Untuk running lokal
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}