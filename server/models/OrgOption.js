const { createModel } = require("./postgresModel");
module.exports = createModel("OrgOption", { key: "default", projects: [] });
