import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import postcss from 'postcss'
// import parser from 'postcss-selector-parser'
import { cssRoot } from './util'
import postcssPlugin from '@/postcss'
import { useOptions } from '@/postcss/plugins'
describe('postcss', () => {
  it('default', async () => {
    const rawCss = await fs.readFile(resolve(cssRoot, 'default.css'), 'utf8')
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(rawCss)
    expect(css).toMatchSnapshot()
  })

  it('default removeNegationPseudoClass true', async () => {
    const rawCss = await fs.readFile(resolve(cssRoot, 'default.css'), 'utf8')
    const { css } = await postcss([postcssPlugin()]).process(rawCss)
    expect(css).toMatchSnapshot()
  })

  it('default without layer', async () => {
    const rawCss = await fs.readFile(
      resolve(cssRoot, 'default-without-layer.css'),
      'utf8'
    )
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(rawCss)
    expect(css).toMatchSnapshot()
  })

  it('default without layer removeNegationPseudoClass true', async () => {
    const rawCss = await fs.readFile(
      resolve(cssRoot, 'default-without-layer.css'),
      'utf8'
    )
    const { css } = await postcss([postcssPlugin()]).process(rawCss)
    expect(css).toMatchSnapshot()
  })

  it('simple universal selector', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`*{}`)
    expect(css).toMatchSnapshot()
  })

  it('simple universal selector removeNegationPseudoClass true', async () => {
    const { css } = await postcss([postcssPlugin()]).process(`*{}`)
    expect(css).toMatchSnapshot()
  })
  it('universal selector', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(` *, *::before, *::after, ::backdrop{}`)
    expect(css).toMatchSnapshot()
  })

  it(':root and :host pseudo', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`:root,:host{}`)
    expect(css).toMatchSnapshot()
  })

  it('only :root pseudo', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`:root{}`)
    expect(css).toMatchSnapshot()
  })

  it('is pseudo', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`.hovercbg_yellowd400:is(:hover,[data-hover]){}`)
    expect(css).toMatchSnapshot()
  })

  it('_peerHover case ', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(
      `.peer:hover:not(n):not(n):not(n):not(n)~.peerHovercbg_redd500,
      .peer[data-hover]:not(n):not(n):not(n):not(n)~.peerHovercbg_redd500 {}`
    )
    expect(css).toMatchSnapshot()
  })

  it('_peerHover no :not(n) case ', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`.peer~.peerHovercbg_redd500{}`)
    // 前面不能有伪元素和 [data-*]
    expect(css).toBe(`.peer~.peerHovercbg_redd500{}`)
  })

  it('_peerHover case disabled enable', async () => {
    const testCase = `.peer:hover:not(n):not(n):not(n):not(n)~.peerHovercbg_redd500,
    .peer[data-hover]:not(n):not(n):not(n):not(n)~.peerHovercbg_redd500 {}`
    const { css } = await postcss([
      postcssPlugin({
        disabled: true
      })
    ]).process(testCase)
    expect(css).toBe(testCase)
  })

  it('should not remove custom :not', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false
      })
    ]).process(`.peer:not(.aa):not(#\\#){}`)
    expect(css).toMatchSnapshot()
  })

  it('enable disabled', async () => {
    const testCase = `.peer:not(.aa):not(#\\#){}`
    const { css } = await postcss([
      postcssPlugin({
        disabled: true
      })
    ]).process(testCase)
    expect(css).toBe(testCase)
  })

  it('should not remove custom :not removeNegationPseudoClass true', async () => {
    const { css } = await postcss([postcssPlugin()]).process(
      `.peer:not(.aa):not(#\\#){}`
    )
    expect(css).toMatchSnapshot()
  })

  it('should not transform descendant combinator', async () => {
    const { css } = await postcss([postcssPlugin()]).process(
      `.custom-tabs .tabs__scroll { background: red; }`
    )
    expect(css).toBe('.custom-tabs .tabs__scroll { background: red; }')
  })

  it('universal selector string literal', async () => {
    const { css } = await postcss([
      postcssPlugin({
        removeNegationPseudoClass: false,
        selectorReplacement: {
          universal: 'view'
        }
      })
    ]).process(`*, *::before, *::after, ::backdrop{}`)
    expect(css).toBe('view,view::before,view::after,::backdrop{}')
  })

  it('useOptions default', () => {
    const { mergeOptions, optionsRef } = useOptions()
    expect(optionsRef).toMatchSnapshot()
    mergeOptions({
      disabled: true,
      cascadeLayersPluginOptions: {
        onConditionalRulesChangingLayerOrder: false
      },
      isPseudoClassPluginOptions: {
        onPseudoElement: 'warning'
      }
    })
    expect(optionsRef.value.disabled).toBe(true)
    expect(
      optionsRef.value.cascadeLayersPluginOptions
        .onConditionalRulesChangingLayerOrder
    ).toBe(false)
    expect(optionsRef.value.isPseudoClassPluginOptions.onPseudoElement).toBe(
      'warning'
    )
    expect(optionsRef).toMatchSnapshot()
  })

  it('... :where happy', async () => {
    const { css } = await postcss([postcssPlugin()]).process(
      `:where(:root, :host, :happy) {}`
    )
    expect(css).toBe('page,page,:happy {}')
  })

  it('optionsRef disabled option', async () => {
    const { css } = await postcss([
      postcssPlugin({
        disabled: true
      })
    ]).process(`:where(:root, :host, :happy) {}`)
    expect(css).toBe(`:where(:root, :host, :happy) {}`)
  })
})
