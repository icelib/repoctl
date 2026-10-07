// 同时兼容 `yarn clean` and `yarn clean xxx yyy zzz`
;(async () => {
  const { deleteAsync } = await import('del')
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    dirs.push('dist')
    dirs.push('types')
  }
  const deletedDirectoryPaths = await deleteAsync(dirs)
  console.log('Deleted directories:')
  console.log(deletedDirectoryPaths.join('\n'))
})()
