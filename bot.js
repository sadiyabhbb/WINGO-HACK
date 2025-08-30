// bot.js
require('dotenv').config();
const TelegramBot = require("node-telegram-bot-api");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// 🔑 Bot token (.env ফাইল থেকে)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN .env ফাইলে সেট করুন");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// --- OCR Extract ---
async function ocrExtract(filePath) {
  const { data: { text } } = await Tesseract.recognize(filePath, "eng");
  let matches = text.match(/\b[0-9]\b/g);
  return matches ? matches.slice(-10) : [];
}

// --- External API Call ---
async function analyzeWithAPI(prompt) {
  try {
    const url = `https://apis-top.vercel.app/aryan/gpt-4?ask=${encodeURIComponent(prompt)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API failed: " + res.status);
    const data = await res.text(); // API response plain text
    return data;
  } catch (err) {
    console.error("API error:", err);
    return "❌ AI API error.";
  }
}

// --- Bot Handlers ---
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Send a screenshot of last game numbers, I'll predict the next signal (Small/Big).");
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
    const buffer = await response.buffer();
    fs.writeFileSync(localPath, buffer);

    // OCR extract numbers
    let nums = await ocrExtract(localPath);
    fs.unlinkSync(localPath); // cleanup

    if (nums.length < 5) {
      bot.sendMessage(chatId, "⚠️ Couldn't read enough numbers. Please send a clearer screenshot.");
      return;
    }

    // Strict prompt: Only Small/Big
    const prompt = `Last 10 game numbers: ${nums.join(", ")}.
Predict the next signal.
Reply ONLY with "Small" or "Big". No explanation, no extra text.`;

    let analysis = await analyzeWithAPI(prompt);

    // Extract Small/Big from response
    let match = analysis.match(/\b(Small|Big)\b/i);
    let signal = match ? match[0] : "❌ Could not determine signal";

    // Reply to user
    bot.sendMessage(chatId, `🔮 Signal → *${signal}*`, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("Error details:", err);
    bot.sendMessage(chatId, "❌ Error processing the screenshot.");
  }
});
