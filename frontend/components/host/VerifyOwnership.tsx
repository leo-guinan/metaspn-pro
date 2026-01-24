'use client'

import { useState } from 'react'
import * as api from '@/lib/api'

interface VerifyOwnershipProps {
  podcast_id: string
  verification_token: string
  verification_instructions: string
  onVerified: () => void
}

export default function VerifyOwnership({
  podcast_id,
  verification_token,
  verification_instructions,
  onVerified,
}: VerifyOwnershipProps) {
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setVerifying(true)
    setError(null)

    try {
      if (!api.hostApi) {
        throw new Error('API not available')
      }

      const result = await api.hostApi.verifyOwnership(podcast_id)

      if (result.verified) {
        setVerified(true)
        onVerified()
      } else {
        setError(result.message)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify ownership')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="question-card mb-6">
      <h3 className="mb-4">Verify Ownership</h3>

      {verified ? (
        <div style={{ 
          background: 'rgba(212, 175, 55, 0.1)', 
          border: '1px solid var(--gold)', 
          padding: '1rem',
          borderRadius: '4px'
        }}>
          <p style={{ color: 'var(--gold)', fontWeight: 500, margin: 0 }}>
            ✓ Ownership verified successfully!
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-sm mb-3" style={{ color: 'var(--fg-dim)' }}>
              {verification_instructions}
            </p>
            <div style={{ 
              background: 'var(--bg-elevated)', 
              border: '1px solid var(--border)', 
              padding: '1rem',
              borderRadius: '4px',
              fontFamily: 'var(--mono)',
              fontSize: '0.85rem'
            }}>
              <code>
                {`<meta name="metaspn-verification" content="${verification_token}">`}
              </code>
            </div>
          </div>

          {error && (
            <div className="error-message mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="button"
          >
            {verifying ? 'Verifying...' : 'Verify Ownership'}
          </button>
        </>
      )}
    </div>
  )
}
