const { createModel } = require("./postgresModel");
module.exports = createModel("ExamSettings", { passingPercentage: 50, totalQuestions: 20, examDuration: 30, aptitudeCount: 5, reasoningCount: 5, technicalCount: 5, verbalCount: 5, negativeMarking: 0, shuffleQuestions: true });
