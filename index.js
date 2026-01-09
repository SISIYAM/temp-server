require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const User = require("./models/User");
const Leaderboard = require("./models/Leaderboard");
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");

const app = express();

// Initialize Google Gen AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// System prompt for AI
const SYSTEM_PROMPT = `
  System Prompt: "You are an educational assistant for Chorcha, a specialized self-practice platform for AS, O, and A-Level students. Your goal is to foster independent mastery of Cambridge and Edexcel curricula.

Guidelines:

Scaffolded Learning: When a user asks a question, don't just provide the final answer. Break down the logic or provide a hint first to encourage self-correction.

Syllabus Precision: Align all explanations with AS/O/A-Level marking schemes. Use specific terminology (e.g., 'enthalpy change' instead of 'heat difference').

Step-by-Step Clarity: Use Markdown (bolding, bullet points) and LaTeX for all mathematical or scientific formulas to ensure readability.

Tone: Encouraging, intellectually honest, and professional.

Correction: If a student makes a conceptual error, gently explain why it is incorrect before providing the right path."
  `;

// Middleware
app.use(cors());
app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.send("API running 🚀");
});

app.post("/users", async (req, res) => {
  try {
    const { name, email, age } = req.body;

    const user = await User.create({
      name,
      email,
      age,
    });

    res.status(201).json({
      message: "User created successfully",
      user,
    });
  } catch (error) {
    res.status(400).json({
      message: "Error creating user",
      error: error.message,
    });
  }
});

// route for insert/update leaderboard
app.post("/leaderboard", async (req, res) => {
  try {
    const { userId, userName, userImage, score } = req.body;

    // first find if any user data exists with the given userId
    const existingEntry = await Leaderboard.findOne({ userId });
    let leaderboardEntry;

    if (!existingEntry) {
      // create new entry with score as highScore initially
      leaderboardEntry = await Leaderboard.create({
        userId,
        userName,
        userImage,
        score,
        highScore: score,
      });
    } else {
      // if exists, update the score
      existingEntry.score = score;

      // update highScore only if current score is greater than existing highScore
      if (score > existingEntry.highScore) {
        existingEntry.highScore = score;
      }

      leaderboardEntry = await existingEntry.save();
    }

    res.status(200).json({
      message: existingEntry
        ? "Leaderboard updated successfully"
        : "Leaderboard entry created successfully",
      leaderboard: leaderboardEntry,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      message: "Error updating leaderboard",
      error: error.message,
    });
  }
});

// fetch leaderboard sorted by highScore (rank 1 first)
app.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await Leaderboard.find().sort({ highScore: -1 }).lean();

    // Add rank to each entry
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    res.status(200).json({
      message: "Leaderboard fetched successfully",
      leaderboard: rankedLeaderboard,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error fetching leaderboard",
      error: error.message,
    });
  }
});

// AI Chat route with conversation history support
app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    // Build contents array with history and new message
    const contents = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      ...(history || []),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    res.status(200).json({
      text: response.text,
      role: "model",
    });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({
      text: "Sorry, I encountered an error.",
      role: "model",
    });
  }
});

// OpenAI Chat route with conversation history support
app.post("/chat-openai", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    // Build messages array with system prompt, history, and new message
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
    });

    res.status(200).json({
      text: completion.choices[0].message.content,
      role: "assistant",
    });
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({
      text: "Sorry, I encountered an error.",
      role: "assistant",
    });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching users ❌",
      error: error.message,
    });
  }
});

// Evaluate written text using OpenAI
app.post("/evaluate", async (req, res) => {
  try {
    const { written_text, point, question } = req.body;

    if (!written_text) {
      return res.status(400).json({
        message: "written_text is required",
      });
    }

    if (!question) {
      return res.status(400).json({
        message: "question is required",
      });
    }

    // Build the evaluation prompt based on whether point is provided
    const maxPoints = point ? point : 10;
    const evaluationPrompt = `
You are an expert evaluator for AS, O, and A-Level students' written work. Evaluate the student's answer based on the given question.

Question:
"""
${question}
"""

Student's Answer:
"""
${written_text}
"""

Please evaluate and provide:
1. A mark out of ${maxPoints} (must be <= ${maxPoints}) based on how well the answer addresses the question
2. A list of mistakes found (factual errors, missing key points, grammar, spelling, etc.)
3. Constructive feedback for improvement

Respond in the following JSON format only (no markdown code blocks):
{
  "mark": <number>,
  "mistakes": [<list of mistake strings>],
  "feedback": "<constructive feedback string>"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an educational evaluator. Always respond with valid JSON only, no markdown formatting.",
        },
        { role: "user", content: evaluationPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const evaluationResult = JSON.parse(completion.choices[0].message.content);

    // Ensure mark doesn't exceed the maximum points
    if (evaluationResult.mark > maxPoints) {
      evaluationResult.mark = maxPoints;
    }
    console.log("Evaluation Result:", evaluationResult);
    res.status(200).json({
      status: "success",
      maxPoints: maxPoints,
      mark: evaluationResult.mark,
      mistakes: evaluationResult.mistakes,
      feedback: evaluationResult.feedback,
    });
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({
      message: "Error evaluating text",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
