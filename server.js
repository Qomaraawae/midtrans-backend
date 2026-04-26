require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://storecashier.netlify.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

if (!process.env.MIDTRANS_SERVER_KEY) {
  console.error("❌ MIDTRANS_SERVER_KEY tidak ditemukan");
  process.exit(1);
}

const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";
const MIDTRANS_API = IS_PRODUCTION
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

console.log(`🚀 Server mode: ${IS_PRODUCTION ? "PRODUCTION" : "SANDBOX"}`);

// Helper function untuk format waktu WIB
function getWIBExpiryTime(minutesFromNow) {
  const now = new Date();
  const expiry = new Date(now.getTime() + minutesFromNow * 60 * 1000);

  // Manual offset ke WIB (UTC+7)
  const utc = expiry.getTime() + expiry.getTimezoneOffset() * 60000;
  const wibTime = new Date(utc + 3600000 * 7);

  const yyyy = wibTime.getFullYear();
  const mm = String(wibTime.getMonth() + 1).padStart(2, "0");
  const dd = String(wibTime.getDate()).padStart(2, "0");
  const hh = String(wibTime.getHours()).padStart(2, "0");
  const min = String(wibTime.getMinutes()).padStart(2, "0");
  const ss = String(wibTime.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} +0700`;
}

// ENDPOINT UTAMA
app.post("/create-transaction", async (req, res) => {
  try {
    const { amount, orderId, customer } = req.body;

    if (!amount || !orderId) {
      return res.status(400).json({
        success: false,
        error: "amount dan orderId wajib",
      });
    }

    console.log(`📝 Creating: ${orderId} - Rp ${amount}`);

    const auth = Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString(
      "base64"
    );

    // Buat expiry time dengan buffer
    const startTime = getWIBExpiryTime(3); 

    console.log(`⏰ Start time: ${startTime}`);

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
        expiry: {
          start_time: startTime,
          unit: "minutes",
          duration: 15,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );

    const { token, redirect_url } = snapResponse.data;

    console.log(`✅ Token created: ${orderId}`);

    res.json({
      success: true,
      snap_token: token,
      redirect_url: redirect_url,
      order_id: orderId,
      amount: amount,
    });
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error_messages?.[0] || err.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    mode: IS_PRODUCTION ? "PRODUCTION" : "SANDBOX",
    timestamp: new Date().toISOString(),
    wibTime: getWIBExpiryTime(0),
  });
});

app.post("/webhook", async (req, res) => {
  try {
    const notification = req.body;
    console.log("📩 Webhook:", notification);
    const { order_id, transaction_status } = notification;
    console.log(`📋 Order ${order_id}: ${transaction_status}`);
    res.json({ status: "OK" });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} tidak ditemukan`,
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`📡 Mode: ${IS_PRODUCTION ? "PRODUCTION" : "SANDBOX"}`);
  console.log(`🌐 CORS: https://storecashier.netlify.app`);
});
