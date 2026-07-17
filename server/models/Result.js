const { createModel } = require("./postgresModel");
module.exports = createModel("Result", { candidateUserId: "", testName: "", answers: [], score: 0, totalMarks: 0, correctAnswers: 0, totalQuestions: 0, categoryResults: [], submittedAt: null, timeTakenSeconds: null, project: "General", designation: "", passed: false }, { suiteId: "TestSuite", "answers.questionId": "Question" });
