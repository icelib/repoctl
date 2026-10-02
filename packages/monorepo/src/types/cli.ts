/**
 * CLI 公用参数，保证各命令对外暴露一致的行为。
 */
export interface CliOpts {
  /**
   * 是否开启交互模式，开启后每一步都会提示用户确认。
   * @default false
   */
  interactive?: boolean
  /**
   * 是否使用 core 版资产，只同步最精简的文件集合。
   * @default false
   */
  core?: boolean
  /**
   * 输出目录（相对 `cwd`），用于放置生成或拷贝出来的文件。
   * @default ''
   */
  outDir?: string
  /**
   * 命令执行的工作目录。
   * @default process.cwd()
   */
  cwd?: string
  /**
   * 是否跳过已有文件的覆写；开启后保留旧文件不做对比。
   * @default false
   */
  skipOverwrite?: boolean
  /**
   * 跳过交互并接受默认写入策略。upgrade 中等价于覆盖 drifted 标准资产。
   * @default false
   */
  yes?: boolean
  /**
   * 显式覆盖已有文件。
   * @default false
   */
  overwrite?: boolean
  /**
   * 显式不覆盖已有文件。
   * @default false
   */
  noOverwrite?: boolean
  /** Include a bounded unified text diff in upgrade previews. */
  diff?: boolean
  /**
   * 是否允许覆盖未标记的自定义 release workflow。
   * @default false
   */
  overwriteRelease?: boolean
}
