import { Browser } from 'happy-dom'

const username = 'mkantor'
const listName = 'featured'

const url = `https://github.com/stars/${username}/lists/${listName}`

const browser = new Browser()
const page = browser.newPage()

page.url = url
page.content = await (await fetch(url)).text()

const featuredRepositoryListItems = page.mainFrame.document.querySelectorAll(
  '#user-list-repositories > *',
)

const featuredRepositories = [...featuredRepositoryListItems.values()].map(
  (repositoryListItem) => {
    // The first anchor in `repositoryListItem` links to the repository.
    const anchor = repositoryListItem.querySelector(`a[href^="/${username}/"]`)
    const url = anchor?.getAttribute('href') ?? null

    const description = repositoryListItem.querySelector(
      '[itemprop="description"]',
    )

    const programmingLanguage = repositoryListItem.querySelector(
      '[itemprop="programmingLanguage"]',
    )

    if (url === null || description === null || programmingLanguage === null) {
      throw new Error(
        'Could not find expected element(s); did GitHub alter the HTML?',
      )
    }

    return {
      url,
      name: url.replace(`/${username}/`, ''),
      description: description.textContent.trim(),
      programmingLanguage: programmingLanguage.textContent.trim(),
    } satisfies Record<PropertyKey, string>
  },
)

const readmeContents = `## Projects
${featuredRepositories.reduce(
  // Whitespace is important here.
  (markdown, repository) => `${markdown}
**[${repository.name}](${repository.url})**  
${repository.description}  
<sup>${repository.programmingLanguage}</sup>
`,
  '',
)}
<!-- updated ${new Date().toISOString()} -->
`

process.stdout.write(readmeContents)

await browser.close()
