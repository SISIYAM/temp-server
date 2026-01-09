const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    age: {
      type: Number,
    },
    country: {
      type: String,
      default: 'Unknown',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
