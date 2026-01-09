require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const User = require('./models/User');
const Leaderboard = require('./models/Leaderboard');
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');

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

app.get('/', (req, res) => {
  res.send('API running 🚀');
});

app.post('/users', async (req, res) => {
  try {
    const { name, email, age } = req.body;

    const user = await User.create({
      name,
      email,
      age,
    });

    res.status(201).json({
      message: 'User created successfully',
      user,
    });
  } catch (error) {
    res.status(400).json({
      message: 'Error creating user',
      error: error.message,
    });
  }
});

// route for insert/update leaderboard
app.post('/leaderboard', async (req, res) => {
  try {
    const { userId, userName, userImage, country, score } = req.body;

    // first find if any user data exists with the given userId
    const existingEntry = await Leaderboard.findOne({ userId });
    let leaderboardEntry;
    let message;

    if (!existingEntry) {
      // create new entry with score as highScore initially
      leaderboardEntry = await Leaderboard.create({
        userId,
        userName,
        userImage,
        score,
        country,
        highScore: score,
      });
      message = 'Leaderboard entry created successfully';
    } else {
      // if exists, update only if score is higher than highScore
      if (score > existingEntry.highScore) {
        existingEntry.score = score;
        existingEntry.highScore = score;
        leaderboardEntry = await existingEntry.save();
        message = 'Leaderboard updated successfully';
      } else {
        leaderboardEntry = existingEntry;
        message = 'Score not high enough to update leaderboard';
      }
    }

    res.status(200).json({
      message,
      leaderboard: leaderboardEntry,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      message: 'Error updating leaderboard',
      error: error.message,
    });
  }
});

// fetch leaderboard sorted by highScore (rank 1 first)
app.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await Leaderboard.find().sort({ highScore: -1 }).lean();

    // Add rank to each entry
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    res.status(200).json({
      message: 'Leaderboard fetched successfully',
      leaderboard: rankedLeaderboard,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error fetching leaderboard',
      error: error.message,
    });
  }
});

// Get user's leaderboard data and top 10 rankings
app.get('/leaderboard/user', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        message: 'userId is required',
      });
    }

    // Get user's own leaderboard data with populated user info
    const userLeaderboard = await Leaderboard.findOne({ userId })
      .populate('userId', 'name country')
      .lean();

    if (!userLeaderboard) {
      return res.status(404).json({
        message: 'User not found in leaderboard',
      });
    }

    // Get top 10 leaderboard entries with user info
    const topLeaderboard = await Leaderboard.find()
      .sort({ highScore: -1 })
      .limit(10)
      .populate('userId', 'name country')
      .lean();

    // Add rank to top 10 entries
    const rankedTopLeaderboard = topLeaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId._id,
      userName: entry.userName,
      userImage: entry.userImage,
      country: entry.userId.country,
      score: entry.score,
      highScore: entry.highScore,
    }));

    // Find user's rank in the overall leaderboard
    const allLeaderboard = await Leaderboard.find()
      .sort({ highScore: -1 })
      .lean();
    const userRank =
      allLeaderboard.findIndex((entry) => entry.userId.toString() === userId) +
      1;

    res.status(200).json({
      message: 'User leaderboard data fetched successfully',
      userData: {
        userId: userLeaderboard.userId._id,
        userName: userLeaderboard.userName,
        userImage: userLeaderboard.userImage,
        country: userLeaderboard.userId.country,
        score: userLeaderboard.score,
        highScore: userLeaderboard.highScore,
        rank: userRank,
      },
      top10: rankedTopLeaderboard,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error fetching user leaderboard data',
      error: error.message,
    });
  }
});

// TEMPORARY ROUTE: Delete all leaderboard data (for development/testing only)
app.delete('/leaderboard', async (req, res) => {
  try {
    const result = await Leaderboard.deleteMany({});

    res.status(200).json({
      message: 'All leaderboard data deleted successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error deleting leaderboard data',
      error: error.message,
    });
  }
});

// TEMPORARY ROUTE: Populate leaderboard with dummy data (for development/testing only)
app.post('/leaderboard/populate', async (req, res) => {
  try {
    const countries = [
      'USA',
      'UK',
      'Canada',
      'Australia',
      'Germany',
      'France',
      'Japan',
      'India',
      'Brazil',
      'South Korea',
    ];

    const dummyUsers = [
      { name: 'Alice Johnson', email: 'alice@example.com', age: 25 },
      { name: 'Bob Smith', email: 'bob@example.com', age: 30 },
      { name: 'Charlie Brown', email: 'charlie@example.com', age: 22 },
      { name: 'Diana Prince', email: 'diana@example.com', age: 28 },
      { name: 'Ethan Hunt', email: 'ethan@example.com', age: 35 },
    ];

    const createdUsers = [];
    const leaderboardEntries = [];

    for (let i = 0; i < dummyUsers.length; i++) {
      const user = dummyUsers[i];
      const randomCountry =
        countries[Math.floor(Math.random() * countries.length)];
      const randomScore = Math.floor(Math.random() * (250 - 150 + 1)) + 150;

      // Create user with random country
      const createdUser = await User.create({
        ...user,
        country: randomCountry,
      });

      // Create leaderboard entry
      const leaderboardEntry = await Leaderboard.create({
        userId: createdUser._id,
        userName: user.name,
        userImage: `https://example.com/images/${
          user.name.toLowerCase().split(' ')[0]
        }.jpg`,
        score: randomScore,
        highScore: randomScore,
      });

      createdUsers.push({
        userId: createdUser._id,
        name: user.name,
        email: user.email,
        country: randomCountry,
      });

      leaderboardEntries.push({
        userId: leaderboardEntry.userId,
        userName: leaderboardEntry.userName,
        userImage: leaderboardEntry.userImage,
        score: leaderboardEntry.score,
        highScore: leaderboardEntry.highScore,
      });
    }

    res.status(201).json({
      message: 'Leaderboard populated with dummy data successfully',
      usersCreated: createdUsers.length,
      leaderboardEntries: leaderboardEntries.length,
      data: {
        users: createdUsers,
        leaderboard: leaderboardEntries,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error populating leaderboard with dummy data',
      error: error.message,
    });
  }
});

// AI Chat route with conversation history support
app.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        message: 'Message is required',
      });
    }

    // Build contents array with history and new message
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      ...(history || []),
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
    });

    res.status(200).json({
      text: response.text,
      role: 'model',
    });
  } catch (error) {
    console.error('Gemini Error:', error);
    res.status(500).json({
      text: 'Sorry, I encountered an error.',
      role: 'model',
    });
  }
});

// OpenAI Chat route with conversation history support
app.post('/chat-openai', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        message: 'Message is required',
      });
    }

    // Build messages array with system prompt, history, and new message
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(history || []),
      { role: 'user', content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
    });

    res.status(200).json({
      text: completion.choices[0].message.content,
      role: 'assistant',
    });
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({
      text: 'Sorry, I encountered an error.',
      role: 'assistant',
    });
  }
});

// Sentence Analysis route - Enhanced for Grammar Learning
app.post('/analyze-sentence', async (req, res) => {
  try {
    const { sentence } = req.body;

    if (!sentence) {
      return res.status(400).json({
        message: 'Sentence is required',
      });
    }

    const ANALYSIS_PROMPT = `Analyze this sentence for AS/O/A-Level grammar learning. Return ONLY valid JSON, no markdown.

Structure:
{
  "original": "input text",
  "corrected": "fixed version or same",
  "hasErrors": bool,
  "basicInfo": {"sentenceType": "declarative|interrogative|imperative|exclamatory", "structure": "simple|compound|complex|compound-complex", "mood": "indicative|subjunctive|conditional|imperative", "voice": "active|passive", "tense": "full tense with aspect", "wordCount": num, "complexityScore": "beginner|intermediate|advanced"},
  "transformations": {"simple": "str|null", "compound": "str|null", "complex": "str|null", "passive": "str|null", "active": "str|null", "negative": "str", "question": "str"},
  "grammaticalComponents": {"subject": {"text": "str", "type": "str"}, "predicate": {"text": "str", "mainVerb": "str", "verbPhrase": "str"}, "object": "str|null", "complement": "str|null", "modifiers": ["arr"]},
 "type": "noun|adjective|adverb", "function": "str"}]},
  "phrases": {"noun": ["arr"], "verb": ["arr"], "prepositional": ["arr"], "participial": ["arr"], "infinitive": ["arr"], "gerund": ["arr"]},
  "wordsAnalysis": {"nouns": ["arr"], "verbs": ["arr"], "adjectives": {"positive": ["arr"], "comparative": ["arr"], "superlative": ["arr"]}, "adverbs": ["arr"], "pronouns": ["arr"], "prepositions": ["arr"], "conjunctions": {"coordinating": ["arr"], "subordinating": ["arr"], "correlative": ["arr"]}},
  "punctuation": {"marks": ["arr"], "correctness": "correct|needs improvement", "suggestions": ["arr"]},
  "errors": [{"type": "grammar|spelling|punctuation|structure", "issue": "str", "suggestion": "str"}],
  "improvements": ["arr"],
  "learningTips": ["arr"],
  "keyGrammarConcepts": ["arr"],
  "difficultyRating": {"score": "1-10", "reasoning": "str"}
}

Sentence: "${sentence}"

Be comprehensive, educational, accurate.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert educational grammar analysis API for Cambridge AS/O/A-Level students. Return only valid JSON with comprehensive grammatical analysis.',
        },
        { role: 'user', content: ANALYSIS_PROMPT },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent, factual analysis
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Sentence Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing sentence',
      error: error.message,
    });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching users ❌',
      error: error.message,
    });
  }
});

// Evaluate written text using OpenAI
app.post('/evaluate', async (req, res) => {
  try {
    const { written_text, point, question } = req.body;

    if (!written_text) {
      return res.status(400).json({
        message: 'written_text is required',
      });
    }

    if (!question) {
      return res.status(400).json({
        message: 'question is required',
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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an educational evaluator. Always respond with valid JSON only, no markdown formatting.',
        },
        { role: 'user', content: evaluationPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const evaluationResult = JSON.parse(completion.choices[0].message.content);

    // Ensure mark doesn't exceed the maximum points
    if (evaluationResult.mark > maxPoints) {
      evaluationResult.mark = maxPoints;
    }
    console.log('Evaluation Result:', evaluationResult);
    res.status(200).json({
      status: 'success',
      maxPoints: maxPoints,
      mark: evaluationResult.mark,
      mistakes: evaluationResult.mistakes,
      feedback: evaluationResult.feedback,
    });
  } catch (error) {
    console.error('Evaluation Error:', error);
    res.status(500).json({
      message: 'Error evaluating text',
      error: error.message,
    });
  }
});

// Evaluate written text using OpenAI
app.post('/evaluate', async (req, res) => {
  try {
    const { written_text, point, question } = req.body;

    if (!written_text) {
      return res.status(400).json({
        message: 'written_text is required',
      });
    }

    if (!question) {
      return res.status(400).json({
        message: 'question is required',
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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an educational evaluator. Always respond with valid JSON only, no markdown formatting.',
        },
        { role: 'user', content: evaluationPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const evaluationResult = JSON.parse(completion.choices[0].message.content);

    // Ensure mark doesn't exceed the maximum points
    if (evaluationResult.mark > maxPoints) {
      evaluationResult.mark = maxPoints;
    }
    console.log('Evaluation Result:', evaluationResult);
    res.status(200).json({
      status: 'success',
      maxPoints: maxPoints,
      mark: evaluationResult.mark,
      mistakes: evaluationResult.mistakes,
      feedback: evaluationResult.feedback,
    });
  } catch (error) {
    console.error('Evaluation Error:', error);
    res.status(500).json({
      message: 'Error evaluating text',
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
