const { createModel } = require("./postgresModel");
module.exports = createModel("Question", { questionText: "", imageUrl: "", videoUrl: "", questionType: "mcq", options: [], correctAnswer: [], optionScores: [], categoryCorrectAnswers: {}, explanation: "", marks: 1, language: "en", category: [] }, { testSuite: "TestSuite" });
