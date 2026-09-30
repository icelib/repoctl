interface SearchResult {
  url: string
  meta: { title?: string }
}

interface Pagefind {
  init: () => Promise<void>
  search: (query: string) => Promise<{ results: { data: () => Promise<SearchResult> }[] }>
}

// Pagefind is emitted by the Nimbus production build, not bundled by Vite.
export function mountSearch(root: HTMLElement) {
  const form = root.querySelector('form')!
  const input = root.querySelector('input')!
  const status = root.querySelector<HTMLElement>('[role="status"]')!
  const results = root.querySelector('ul')!
  let api: Promise<Pagefind> | undefined
  let request = 0

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const current = ++request
    results.replaceChildren()
    const query = input.value.trim()
    if (!query) {
      status.textContent = ''
      return
    }
    status.textContent = root.dataset.loading ?? ''
    try {
      const base = (root.dataset.base ?? '/').replace(/\/$/, '')
      api ??= import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`).then(async (module: Pagefind) => {
        await module.init()
        return module
      })
      const response = await (await api).search(query)
      const pages = await Promise.all(response.results.slice(0, 10).map(result => result.data()))
      if (current !== request) {
        return
      }
      status.textContent = pages.length ? '' : root.dataset.empty ?? ''
      for (const page of pages) {
        const url = new URL(page.url, window.location.origin)
        if (url.origin !== window.location.origin) {
          continue
        }
        const item = document.createElement('li')
        const link = document.createElement('a')
        link.href = url.href
        link.textContent = page.meta.title ?? page.url
        item.append(link)
        results.append(item)
      }
    }
    catch {
      api = undefined
      if (current === request) {
        status.textContent = root.dataset.unavailable ?? ''
      }
    }
  })
}
