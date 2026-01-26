# Workflow Dependency Fix

## Problem

The `deploy-production.yml` workflow was running in parallel with the `ci.yml` workflow, causing:
1. **Race condition**: Deploy could finish before CI's `docker-build` job completed
2. **Duplicate work**: Both workflows were building the same Docker images
3. **Potential failures**: Deploy might try to pull images that don't exist yet

## Solution

### Changes Made

1. **Removed duplicate Docker builds** from `deploy-production.yml`
   - CI workflow's `docker-build` job already builds and pushes images
   - Deploy workflow now only pulls images built by CI

2. **Added workflow dependency** (already existed but improved)
   - `deploy-production.yml` uses `workflow_run` to wait for CI workflow to complete
   - Added `if` condition to only run when CI succeeds: `github.event.workflow_run.conclusion == 'success'`

3. **Added verification steps**
   - Verify CI workflow completed successfully before deploying
   - Checkout the correct commit SHA from the CI workflow run
   - Retry logic when pulling images (in case of registry propagation delay)

4. **Improved error handling**
   - Clear error messages if images aren't available
   - Links to CI workflow run for debugging

## Workflow Flow

```
Push to main
    ↓
CI Workflow starts
    ↓
├─ lint-and-type-check
├─ build (needs: lint-and-type-check)
├─ docker-build (needs: build) ← Builds and pushes images
└─ security-scan (needs: docker-build)
    ↓
CI Workflow completes
    ↓
Deploy Workflow triggers (workflow_run)
    ↓
Checks: CI succeeded? → Yes
    ↓
Pulls images built by CI
    ↓
Deploys to production
```

## Key Points

- **No duplicate builds**: Images are built once by CI, deployed by deploy workflow
- **Proper sequencing**: Deploy waits for CI to complete successfully
- **Same commit**: Deploy uses the commit SHA from the CI workflow run
- **Retry logic**: Handles registry propagation delays gracefully

## Manual Deployment

When using `workflow_dispatch` (manual trigger), the workflow will:
- Use the current commit SHA
- Still pull images from registry (they should exist from previous CI runs)
- If images don't exist, the pull will fail with a clear error message

## Verification

After this fix, you should see:
1. CI workflow completes (including docker-build job)
2. Deploy workflow starts only after CI succeeds
3. Deploy workflow pulls images instead of building them
4. Faster deployments (no duplicate build time)
