const base = require('../../electron-builder.config.cjs')

module.exports = {
  ...base,
  files: [
    ...base.files,
    '!.codegraph{,/**/*}',
    '!test-results{,/**/*}',
    '!playwright-report{,/**/*}'
  ]
}
