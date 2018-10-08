const fs = require('fs')
const expect = require('chai').expect

let test_settings = null

const OSTypes = require('../../out/src/enums').OsType
const PragmaUtil = require('../../out/src/pragmaUtil').default

describe('Process before upload', function () {
  this.beforeAll(() => {
    test_settings = fs.readFileSync(__dirname + '/testSettings.json', 'utf8')       
  })

  it('should remove @sync-ignore and @sync ignore lines', () => {
    expect(PragmaUtil.removeIgnoreBlocks(test_settings)).to.not.contains('@sync-ignore').and.not.contains('@sync ignore')
  })

  it('should trim os, host and env', () => {
    expect(PragmaUtil.processBeforeUpload(test_settings)).to.match(/@sync os=linux host=trim env=TEST_ENV/)
  })
  
  it('should comment line after linebreak', () => {
    const line = '// @sync host=mac1 os=_mac_\n\t"mac": 3,'
    expect(PragmaUtil.commentLineAfterBreak(line)).to.match(/\/\/\s"mac"/)
  })

  it('should uncomment line after linebreak', () => {
    const line = '// @sync host=mac1 os=_mac_\n\t//"mac": 3,'
    expect(PragmaUtil.uncommentLineAfterBreak(line)).to.match(/\t"mac"/)
  })

  it('should get eight @sync pragma valid lines', () => {
    const processed = PragmaUtil.processBeforeUpload(test_settings)
    expect(PragmaUtil.matchPragmaSettings(processed).length).to.be.equals(8)
  })

  it('should uncomment all lines', () => {
    const commentedSettings = `
      // @sync os=linux
      // "window": 1,
      // @sync os=mac
      // "mac": 1
    `

    expect(PragmaUtil.processBeforeUpload(commentedSettings)).to.match(/\s+"window"/).and.to.match(/\s+"mac"/)
  })

  it('should not comment os=linux settings lines', () => {
    let processed = PragmaUtil.processBeforeUpload(test_settings)
    processed = PragmaUtil.processBeforeWrite(processed, OSTypes['Linux'], null)
    expect(processed).to.match(/\s+"not_commented"/)

  })


  it('should leave only settings that matches with os=mac host=mac2 env=TEST_ENV', () => {  
    const processed = PragmaUtil.processBeforeUpload(test_settings)
    process.env["TEST_ENV"] = true
    expect(PragmaUtil.processBeforeWrite(processed, OSTypes['Mac'], 'mac2')).to.match(/\n\s+"mac2"/).and.match(/\n\s+"mactest"/)
  })
})