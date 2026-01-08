require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const User = require("./models/User");
const Leaderboard = require("./models/Leaderboard");

const app = express();

// Middleware
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
