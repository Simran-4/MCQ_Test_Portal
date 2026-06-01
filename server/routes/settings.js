const express = require("express");
const router = express.Router();

const ExamSettings = require("../models/ExamSettings");

router.post("/save", async (req, res) => {

  try {

    const settings =
      await ExamSettings.findOneAndUpdate(
        {},
        req.body,
        {
          upsert: true,
          new: true,
        }
      );

    res.json(settings);

  } catch (err) {

    res.status(500).json({
      message: "Error saving settings",
    });
  }
});

router.get("/", async (req, res) => {

  try {

    const settings =
      await ExamSettings.findOne();

    res.json(settings);

  } catch (err) {

    res.status(500).json({
      message: "Error fetching settings",
    });
  }
});

module.exports = router;