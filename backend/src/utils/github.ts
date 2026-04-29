import dotenv from 'dotenv'
import path from 'path'

const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
dotenv.config({ path: ENV_PATH })

const GH_TOKEN    = () => process.env.GITHUB_TOKEN    || ''
const GH_USERNAME = () => process.env.GITHUB_USERNAME  || ''
const REPO_NAME   = 'centralmillwork-reports'

function ghHeaders() {
  return {
    Authorization: `token ${GH_TOKEN()}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function ghFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...ghHeaders(), ...(options.headers ?? {}) },
  })
  return res
}

// Creates the repo + enables GitHub Pages if they don't exist yet. Idempotent.
async function ensureRepoAndPages(): Promise<void> {
  const token = GH_TOKEN()
  const user  = GH_USERNAME()
  if (!token || !user) throw new Error('GITHUB_TOKEN y GITHUB_USERNAME no están configurados en .env')

  // Check if repo exists
  const check = await ghFetch(`/repos/${user}/${REPO_NAME}`)
  if (check.status === 404) {
    // Create repo (auto_init creates a README so Pages can be enabled)
    const create = await ghFetch('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: REPO_NAME,
        description: 'Central Millwork procurement reports (auto-generated)',
        private: false,
        auto_init: true,
      }),
    })
    if (!create.ok) {
      const err = await create.json().catch(() => ({})) as Record<string, unknown>
      throw new Error(`Error al crear repo GitHub: ${JSON.stringify(err)}`)
    }
    // Give GitHub a moment to initialize the repo before enabling Pages
    await new Promise((r) => setTimeout(r, 3000))

    // Enable GitHub Pages on main branch
    await ghFetch(`/repos/${user}/${REPO_NAME}/pages`, {
      method: 'POST',
      body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
    })
    // Pages activation is async — we return the expected URL immediately
  } else if (!check.ok) {
    const err = await check.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(`Error verificando repo GitHub: ${JSON.stringify(err)}`)
  }
}

// Uploads (creates or updates) a file in the GitHub repo. Returns the Pages URL.
export async function uploadToGitHub(filename: string, htmlContent: string): Promise<string> {
  await ensureRepoAndPages()

  const user    = GH_USERNAME()
  const content = Buffer.from(htmlContent, 'utf-8').toString('base64')
  const apiPath = `/repos/${user}/${REPO_NAME}/contents/${filename}`

  // Check if file exists to get its SHA (required for updates)
  let sha: string | undefined
  const existing = await ghFetch(apiPath)
  if (existing.ok) {
    const data = await existing.json() as { sha?: string }
    sha = data.sha
  }

  const body: Record<string, unknown> = {
    message: `Update ${filename} — ${new Date().toISOString().slice(0, 10)}`,
    content,
  }
  if (sha) body.sha = sha

  const put = await ghFetch(apiPath, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!put.ok) {
    const err = await put.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(`Error subiendo archivo a GitHub: ${JSON.stringify(err)}`)
  }

  return `https://${user}.github.io/${REPO_NAME}/${filename}`
}
