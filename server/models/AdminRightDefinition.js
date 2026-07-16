const { createModel } = require("./postgresModel");

module.exports = createModel("AdminRightDefinition", {
  key: "",
  label: "",
  detail: "",
  createdBy: null,
}, { createdBy: "User" });
