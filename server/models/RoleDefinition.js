const { createModel } = require("./postgresModel");
module.exports = createModel("RoleDefinition", { name: "", baseRole: "candidate", description: "", disabled: false });
