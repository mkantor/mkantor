/**
 * Generate markdown text with a listing of featured repositories.
 *
 * Featured repositories are those which are starred and added to a star list named "featured".
 *
 * Repositories are ordered by "activeness":
 * - First order by number of commits in last week.
 * - Then order by number of commits in the previous week.
 * - Then order by number of commits in the previous week.
 * - …etc for 52 weeks
 * - Then order by the most recent commit date.
 */

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

/**
 * Returns commits per week for the last 52 weeks, ordered from most recent week
 * to oldest week.
 */
const fetchCommitCounts = async (
  fullRepositoryName: string,
): Promise<number[]> => {
  // <https://docs.github.com/en/rest/metrics/statistics?apiVersion=2022-11-28#get-the-weekly-commit-count>
  const requestURL = new URL(
    `https://api.github.com/repos/${fullRepositoryName}/stats/participation`,
  )
  const response = await fetch(requestURL)

  const responseBody = await response.json()
  if (
    !(
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'all' in responseBody &&
      Array.isArray(responseBody.all)
    )
  ) {
    throw new Error(`Unexpected response body from ${requestURL.href}`, {
      cause: responseBody,
    })
  }

  return responseBody.all.reverse()
}

const fetchMostRecentCommitDate = async (
  fullRepositoryName: string,
): Promise<Date> => {
  // <https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-commits>
  const requestURL = new URL(
    `https://api.github.com/repos/${fullRepositoryName}/commits?per_page=1`,
  )
  const response = await fetch(requestURL)

  const responseBody = await response.json()
  if (
    !(
      Array.isArray(responseBody) &&
      responseBody[0] !== undefined &&
      typeof responseBody[0] === 'object' &&
      responseBody[0] !== null &&
      'commit' in responseBody[0] &&
      typeof responseBody[0].commit === 'object' &&
      responseBody[0].commit !== null &&
      'committer' in responseBody[0].commit &&
      typeof responseBody[0].commit.committer === 'object' &&
      responseBody[0].commit.committer !== null &&
      'date' in responseBody[0].commit.committer &&
      typeof responseBody[0].commit.committer.date === 'string'
    )
  ) {
    throw new Error(`Unexpected response body from ${requestURL.href}`, {
      cause: responseBody,
    })
  }

  return new Date(responseBody[0].commit.committer.date)
}

const featuredRepositories = await Promise.all(
  [...featuredRepositoryListItems.values()].map((repositoryListItem) => {
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

    const name = url.replace(`/${username}/`, '')

    const asyncOperations = Promise.all([
      fetchCommitCounts(`${username}/${name}`),

      // I thought about an optimization where I only make this request when
      // necessary (for repositories tying on commit counts for all 52 weeks),
      // but that would add complexity to this otherwise-simple script.
      fetchMostRecentCommitDate(`${username}/${name}`),
    ])

    return asyncOperations.then(
      ([commitCounts, mostRecentCommitDate]) =>
        ({
          name,
          url: new URL(url, 'https://github.com'),
          description: description.textContent.trim(),
          programmingLanguage: programmingLanguage.textContent.trim(),
          commitCounts,
          mostRecentCommitDate,
        }) satisfies Record<PropertyKey, string | URL | Date | number[]>,
    )
  }),
)

// Order by recent activity.
featuredRepositories.sort((repository1, repository2) => {
  for (let index = 0; index < repository1.commitCounts.length; index++) {
    const count1 = repository1.commitCounts[index] ?? 0
    const count2 = repository2.commitCounts[index] ?? 0
    if (count2 !== count1) {
      return count2 - count1
    }
  }
  return repository1.mostRecentCommitDate < repository2.mostRecentCommitDate
    ? 1
    : -1
})

const readmeContents = `## Projects
${featuredRepositories.reduce(
  // Whitespace is important here.
  (markdown, repository) => `${markdown}
**[${repository.name}](${repository.url.href})**  
${repository.description}  
<sup>${repository.programmingLanguage}</sup>
`,
  '',
)}
<!-- updated ${new Date().toISOString()} -->
`

process.stdout.write(readmeContents)

await browser.close()
