const { createModel } = require("./postgresModel");

module.exports = createModel("ActivityLog", {
  actorId: "",
  actorName: "System",
  actorRole: "",
  action: "",
  method: "",
  path: "",
  targetId: "",
  details: {},
  occurredAt: null,
});
