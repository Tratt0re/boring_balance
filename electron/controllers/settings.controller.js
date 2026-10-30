const path = require('node:path');
const { acknowledgeSettingsProblem, getSettingsProblem } = require('../utils/settings-store');

/** Describes a damaged settings.json found at start-up, or null. The full path stays in the main process. */
function getProblem() {
  const problem = getSettingsProblem();
  if (!problem) {
    return null;
  }

  return {
    at: problem.at,
    keptFileName: problem.corruptCopyPath ? path.basename(problem.corruptCopyPath) : null,
    reason: problem.reason,
  };
}

function acknowledgeProblem() {
  acknowledgeSettingsProblem();
}

module.exports = {
  acknowledgeProblem,
  getProblem,
};
