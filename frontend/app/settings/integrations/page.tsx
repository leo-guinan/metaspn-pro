'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { githubIntegrationsApi, twitterIntegrationsApi, authApi } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'
import AppNav from '@/components/navigation/AppNav'

type Repo = {
  id: string
  full_name: string
  repo_owner: string
  repo_name: string
  branch: string
  is_created_by_us: boolean
  last_push_at: string | null
  last_twitter_sync_at: string | null
  last_error: string | null
}

export default function IntegrationsPage() {
  const { user, accounts, linkAccount, unlinkAccount, refreshUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pushLoading, setPushLoading] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState<string | null>(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [archiveStatus, setArchiveStatus] = useState<{ available: boolean; username: string | null } | null>(null)
  const [archiveStatusLoading, setArchiveStatusLoading] = useState(false)
  const [mode, setMode] = useState<'choose' | 'create' | 'existing'>('choose')
  const [createName, setCreateName] = useState('metaspn-listening-log')
  const [createPrivate, setCreatePrivate] = useState(false)
  const [existingOwnerRepo, setExistingOwnerRepo] = useState('')
  const [pat, setPat] = useState('')
  const [usePat, setUsePat] = useState(false)
  const [oauthCode, setOauthCode] = useState<string | null>(null)

  useEffect(() => {
    const github = searchParams.get('github')
    const code = searchParams.get('code')
    const err = searchParams.get('error')
    if (github === 'complete' && code) {
      setOauthCode(code)
      setMode('choose')
      router.replace('/settings/integrations', { scroll: false })
    } else if (github === 'error' && err) {
      setError(decodeURIComponent(err))
      router.replace('/settings/integrations', { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    if (user) {
      loadStatus()
      loadArchiveStatus()
    }
  }, [user])

  async function loadStatus() {
    if (!user) return
    try {
      setError(null)
      const res = await githubIntegrationsApi.status(user.user_id)
      setRepos(res.repos || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }

  async function loadArchiveStatus() {
    if (!user) return
    setArchiveStatusLoading(true)
    try {
      const res = await twitterIntegrationsApi.archiveStatus()
      setArchiveStatus(res)
    } catch (e: any) {
      // Silently fail - user might not have Twitter connected
      setArchiveStatus({ available: false, username: null })
    } finally {
      setArchiveStatusLoading(false)
    }
  }

  async function handleSync(repoId: string) {
    if (!user) return
    setSyncLoading(repoId)
    setError(null)
    try {
      const result = await twitterIntegrationsApi.sync()
      if (result.success) {
        setSuccess(`Synced ${result.tweets_synced} tweet${result.tweets_synced === 1 ? '' : 's'}`)
      } else {
        setError(result.error || 'Sync failed')
      }
      await loadStatus()
    } catch (e: any) {
      setError(e.message || 'Sync failed')
    } finally {
      setSyncLoading(null)
    }
  }

  function startOAuth() {
    if (!user) return
    window.location.href = githubIntegrationsApi.authUrl(user.user_id)
  }

  async function handleConnect() {
    setConnectLoading(true)
    setError(null)
    setSuccess(null)
    try {
      if (!user) {
        setError('Please log in')
        setConnectLoading(false)
        return
      }

      const payload: Parameters<typeof githubIntegrationsApi.connect>[0] = {}
      if (usePat && pat) {
        payload.personal_access_token = pat
      } else if (oauthCode) {
        payload.code = oauthCode
      } else {
        setError('Complete OAuth first or provide a PAT')
        setConnectLoading(false)
        return
      }
      if (mode === 'create') {
        payload.create_new = true
        payload.repo_name = createName || 'metaspn-listening-log'
        payload.is_private = createPrivate
      } else if (mode === 'existing') {
        const parts = existingOwnerRepo.split('/').map((s) => s.trim()).filter(Boolean)
        if (parts.length !== 2) {
          setError('Enter owner/repo (e.g. myuser/myrepo)')
          setConnectLoading(false)
          return
        }
        payload.owner = parts[0]
        payload.repo = parts[1]
      } else {
        setError('Choose Create new or Use existing')
        setConnectLoading(false)
        return
      }
      const res = await githubIntegrationsApi.connect(payload)
      setSuccess(`Connected ${res.repo_owner}/${res.repo_name}`)
      setOauthCode(null)
      setPat('')
      setMode('choose')
      await loadStatus()
    } catch (e: any) {
      setError(e.message || 'Connect failed')
    } finally {
      setConnectLoading(false)
    }
  }

  async function handlePush(repoId: string) {
    if (!user) return
    setPushLoading(repoId)
    setError(null)
    try {
      await githubIntegrationsApi.push(user.user_id)
      await loadStatus()
    } catch (e: any) {
      setError(e.message || 'Push failed')
    } finally {
      setPushLoading(null)
    }
  }

  async function handleUnlinkAccount(provider: 'twitter' | 'github') {
    try {
      await authApi.unlinkAccount(provider)
      await refreshUser()
    } catch (e: any) {
      setError(e.message || 'Failed to unlink account')
    }
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {!user && (
          <div className="mb-8 p-4 question-card" style={{ background: 'rgba(212, 175, 55, 0.1)', borderColor: 'var(--gold)' }}>
            <p style={{ color: 'var(--gold)' }}>Please log in to manage integrations.</p>
          </div>
        )}

        {user && (
          <>
            <section className="mb-8">
              <h2 className="mb-4">Linked Accounts</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
                Connect your Twitter and GitHub accounts to verify ownership and enable data import.
              </p>

              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.account_id}
                    className="question-card p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">
                        {acc.provider === 'twitter' ? '🐦' : '🔷'} {acc.provider === 'twitter' ? 'Twitter' : 'GitHub'}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--fg-subtle)' }}>
                        @{acc.provider_username || 'unknown'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkAccount(acc.provider)}
                      className="button secondary"
                      style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                    >
                      Unlink
                    </button>
                  </div>
                ))}

                {accounts.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>No accounts linked yet.</p>
                )}

                <div className="button-group mt-4">
                  {!accounts.some((a) => a.provider === 'twitter') && (
                    <button
                      onClick={() => linkAccount('twitter')}
                      className="button secondary"
                    >
                      Link Twitter
                    </button>
                  )}
                  {!accounts.some((a) => a.provider === 'github') && (
                    <button
                      onClick={() => linkAccount('github')}
                      className="button secondary"
                    >
                      Link GitHub
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Twitter Archive Status - Show prominently if user has Twitter */}
            {accounts.some((a) => a.provider === 'twitter') && (
              <section className="mb-8">
                <h2 className="mb-4">Twitter Archive</h2>
                <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
                  Check if your Twitter archive is available in the community archive and sync it to your GitHub repository.
                </p>
                {archiveStatusLoading ? (
                  <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>Checking archive status…</p>
                ) : archiveStatus ? (
                  <div className="question-card p-4">
                    {archiveStatus.available ? (
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--gold)', fontSize: '1.2em' }}>✓</span>
                        <span className="text-sm">
                          Your Twitter archive is available in the community archive
                          {archiveStatus.username && ` (@${archiveStatus.username})`}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--fg-subtle)', fontSize: '1.2em' }}>⚠</span>
                          <span className="text-sm">
                            Your Twitter archive is not yet in the community archive
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--fg-subtle)' }}>
                          <a
                            href="https://community-archive.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--gold)', textDecoration: 'underline' }}
                          >
                            Learn more about the community archive →
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            )}

            <section className="mb-8">
              <h2 className="mb-4">GitHub repository</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--fg-dim)' }}>
            Connect a repo to push your listening log, fan summary, and preferences as an append-only log.
          </p>

          {error && (
            <div className="mb-4 error-message" style={{ padding: '0.75rem', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 success-message" style={{ padding: '0.75rem', border: '1px solid var(--gold)', borderRadius: 'var(--radius-lg)' }}>
              {success}
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--fg-subtle)' }}>Loading…</p>
          ) : (
            <>
              {repos.length > 0 && (
                <div className="mb-6 space-y-4">
                  <h3 className="font-medium">Connected repos</h3>
                  {repos.map((r) => (
                    <div
                      key={r.id}
                      className="question-card p-4"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <a
                          href={`https://github.com/${r.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm"
                          style={{ color: 'var(--gold)', textDecoration: 'none' }}
                          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                        >
                          {r.full_name}
                        </a>
                        <div className="flex gap-2">
                          {accounts.some((a) => a.provider === 'twitter') && (
                            <button
                              onClick={() => handleSync(r.id)}
                              disabled={!!syncLoading || !!pushLoading}
                              className="button secondary"
                            >
                              {syncLoading === r.id ? 'Syncing…' : 'Sync Twitter'}
                            </button>
                          )}
                          <button
                            onClick={() => handlePush(r.id)}
                            disabled={!!pushLoading || !!syncLoading}
                            className="button"
                          >
                            {pushLoading === r.id ? 'Pushing…' : 'Push now'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs space-y-1" style={{ color: 'var(--fg-subtle)' }}>
                        {r.last_push_at && (
                          <div>Last push: {new Date(r.last_push_at).toLocaleString()}</div>
                        )}
                        {r.last_twitter_sync_at && (
                          <div>Last Twitter sync: {new Date(r.last_twitter_sync_at).toLocaleString()}</div>
                        )}
                        {!r.last_push_at && !r.last_twitter_sync_at && (
                          <div>Not synced yet</div>
                        )}
                        {r.last_error && (
                          <span className="block error-message mt-1">Error: {r.last_error}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-medium">Connect a repo</h3>
                {!oauthCode && !usePat ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={startOAuth}
                      className="button"
                    >
                      Connect with GitHub
                    </button>
                    <button
                      onClick={() => setUsePat(true)}
                      className="button secondary"
                    >
                      Use Personal Access Token
                    </button>
                  </div>
                ) : (
                  <>
                    {usePat && (
                      <div>
                        <label>Personal Access Token</label>
                        <input
                          type="password"
                          value={pat}
                          onChange={(e) => setPat(e.target.value)}
                          placeholder="ghp_…"
                        />
                        <button
                          onClick={() => {
                            setUsePat(false)
                            setPat('')
                          }}
                          className="mt-1 text-xs"
                          style={{ color: 'var(--fg-subtle)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          Use OAuth instead
                        </button>
                      </div>
                    )}
                    {oauthCode && (
                      <p className="text-sm success-message">OAuth complete. Choose repo below.</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setMode('create')}
                        className={`button secondary ${mode === 'create' ? '' : ''}`}
                        style={mode === 'create' ? { borderColor: 'var(--gold)', background: 'rgba(212, 175, 55, 0.1)' } : {}}
                      >
                        Create new repo
                      </button>
                      <button
                        onClick={() => setMode('existing')}
                        className={`button secondary ${mode === 'existing' ? '' : ''}`}
                        style={mode === 'existing' ? { borderColor: 'var(--gold)', background: 'rgba(212, 175, 55, 0.1)' } : {}}
                      >
                        Use existing repo
                      </button>
                    </div>

                    {mode === 'create' && (
                      <div className="space-y-2">
                        <label>Repo name</label>
                        <input
                          type="text"
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          placeholder="metaspn-listening-log"
                        />
                        <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={createPrivate}
                            onChange={(e) => setCreatePrivate(e.target.checked)}
                            style={{ width: 'auto', height: 'auto', margin: 0 }}
                          />
                          Private
                        </label>
                      </div>
                    )}

                    {mode === 'existing' && (
                      <div>
                        <label>Owner / repo (e.g. myuser/myrepo)</label>
                        <input
                          type="text"
                          value={existingOwnerRepo}
                          onChange={(e) => setExistingOwnerRepo(e.target.value)}
                          placeholder="myuser/myrepo"
                        />
                      </div>
                    )}

                    <button
                      onClick={handleConnect}
                      disabled={connectLoading}
                      className="button"
                    >
                      {connectLoading ? 'Connecting…' : 'Seed & connect'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
          </>
        )}
      </main>
    </div>
  )
}
