// bot.js
require('dotenv').config();
const TelegramBot = require("node-telegram-bot-api");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // node-fetch v2 ব্যবহার
const http = require("http"); // Render-এর জন্য dummy server

// 🔑 Bot token (.env ফাইল থেকে)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN .env ফাইলে সেট করুন");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// --- Helper: number → Small/Big ---
function numToLabel(n) {
  return n <= 4 ? "Small" : "Big";
}

// --- Prediction Algorithm ---
function predict(nums) {
  let labels = nums.map(num => numToLabel(parseInt(num)));

  let smallCount = labels.filter(x => x === "Small").length;
  let bigCount = labels.filter(x => x === "Big").length;

  let last = labels[labels.length - 1];
  let secondLast = labels[labels.length - 2];

  let probSmall = smallCount / labels.length;
  let probBig = bigCount / labels.length;

  if (last === secondLast) {
    if (last === "Small") probSmall *= 0.8;
    if (last === "Big") probBig *= 0.8;
  }

  let pred = probSmall > probBig ? "Small" : "Big";
  let confidence = Math.max(probSmall, probBig);

  return { pred, confidence, labels };
}

// --- OCR Extract ---
async function ocrExtract(filePath) {
  const { data: { text } } = await Tesseract.recognize(filePath, "eng");
  let matches = text.match(/\b[0-9]\b/g);
  return matches ? matches.slice(-10) : [];
}

// --- Bot Handlers ---
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Send me a screenshot of the last 10 rounds, I'll predict the next Small/Big.");
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  try {
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;
    const url = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    const localPath = path.join(__dirname, "temp.jpg");

    // Download image
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(buffer));

    // OCR
    let nums = await ocrExtract(localPath);

    if (nums.length < 5) {
      bot.sendMessage(chatId, "⚠️ Couldn't read enough numbers. Please send a clearer screenshot.");
      fs.unlinkSync(localPath);
      return;
    }

    // Prediction
    let result = predict(nums);

    // Reply
    bot.sendMessage(chatId, 
      `📊 Last Numbers: ${nums.join(", ")}\n` +
      `🔮 Next Signal → *${result.pred}*\n` +
      `📈 Confidence → ${(result.confidence * 100).toFixed(1)}%\n` +
      `📌 Reason → Based on last 10 rounds (anti-streak applied).`,
      { parse_mode: "Markdown" }
    );

    fs.unlinkSync(localPath); // cleanup
  } catch (err) {
    console.error("Error details:", err);
    bot.sendMessage(chatId, "❌ Error processing the screenshot.");
  }
});

// --- Dummy server for Render ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running!\n");
}).listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
