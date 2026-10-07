import fs from 'node:fs/promises'
import path from 'node:path'
import prettier from 'prettier'
import automator from 'miniprogram-automator'

const projectMap = {
  taroReact: {
    name: 'taroReact',
    root: path.resolve(__dirname, '../examples/taro-app'),
    get projectPath() {
      return path.resolve(this.root)
    },
    get cssPath() {
      return path.resolve(this.projectPath, 'dist/app.wxss')
    },
  },
  taroVue3: {
    name: 'taroVue3',
    root: path.resolve(__dirname, '../examples/taro-app-vue3'),
    get projectPath() {
      return path.resolve(this.root)
    },
    get cssPath() {
      return path.resolve(this.projectPath, 'dist/app.wxss')
    },
  },
  uniAppVue3: {
    name: 'uniAppVue3',
    root: path.resolve(__dirname, '../examples/uni-app-vue3'),
    get projectPath() {
      return path.resolve(this.root, 'dist/build/mp-weixin')
    },
    get cssPath() {
      return path.resolve(this.projectPath, 'app.wxss')
    },
  },
}

function formatWxml(wxml: string) {
  return prettier.format(wxml, {
    parser: 'html',
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    endOfLine: 'lf',
    trailingComma: 'none',
    bracketSameLine: true,
    htmlWhitespaceSensitivity: 'ignore',
  })
}

function formatWxss(wxss: string) {
  return prettier.format(wxss, {
    parser: 'css',
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    endOfLine: 'lf',
    trailingComma: 'none',
    bracketSameLine: true,
    htmlWhitespaceSensitivity: 'ignore',
  })
}

describe('e2e', () => {
  it.each(Object.values(projectMap))(
    '$name snapshot',
    async ({ cssPath, projectPath }) => {
      const miniProgram = await automator.launch({
        // cliPath: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
        projectPath,
      })
      const page = await miniProgram.reLaunch('/pages/index/index')
      if (page) {
        const pageEl = await page.$('page')
        const wxml = await pageEl?.wxml()
        if (wxml) {
          let wxmlRes: string
          try {
            wxmlRes = wxml // await formatWxml(wxml)
          }
          catch (error) {
            console.warn(error)
            wxmlRes = wxml
          }

          expect(wxmlRes).toMatchSnapshot('wxml')
        }

        const wxss = await formatWxss(await fs.readFile(cssPath, 'utf8'))
        expect(wxss).toMatchSnapshot('wxss')
        await page.waitFor(3000)
      }
      await miniProgram.close()

      // expect().toMatchSnapshot()
    },
  )
})
