import { describe, expect, it } from 'vitest'
import { mysqlCallsWithoutPasswordPrompt } from './server-files-command-template'

describe('mysqlCallsWithoutPasswordPrompt', () => {
  it('flags a mysql call that never asks for the password', () => {
    expect(mysqlCallsWithoutPasswordPrompt('sudo mysql -u root -e "SHOW DATABASES;"')).toBe(true)
  })

  it('accepts -p, -pSecret and --password', () => {
    expect(mysqlCallsWithoutPasswordPrompt('sudo mysql -u root -p -e "SHOW DATABASES;"')).toBe(
      false
    )
    expect(mysqlCallsWithoutPasswordPrompt('mysql -uroot -pSecret')).toBe(false)
    expect(mysqlCallsWithoutPasswordPrompt('/usr/bin/mysql --password -u root')).toBe(false)
  })

  it('judges each command on its own, so mkdir -p beside mysqldump does not count', () => {
    expect(
      mysqlCallsWithoutPasswordPrompt(
        'mkdir -p ~/backupdb/x && sudo mysqldump -u root db > ~/backupdb/x/db.sql'
      )
    ).toBe(true)
    expect(
      mysqlCallsWithoutPasswordPrompt(
        'mkdir -p ~/backupdb/x && sudo mysqldump -u root -p db > ~/backupdb/x/db.sql'
      )
    ).toBe(false)
    expect(mysqlCallsWithoutPasswordPrompt('sudo systemctl restart mysql')).toBe(false)
  })
})
