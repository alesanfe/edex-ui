# Releasing xDEX-UI

## Process

1. Ensure `package.json` and `src/package.json` declare the target version.
2. Land all release-blocking fixes on the release branch and push it.
3. Push an `rc` tag first for non-trivial releases: `git tag vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N`.
   The pipeline builds every OS/arch artifact and publishes a **prerelease**.
4. Verify the rc artifacts (install + smoke boot on each platform you can access).
5. Push the final tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Automated checks (enforced in CI)

- Tag version must equal `package.json` and `src/package.json` version
  (a `vX.Y.Z-suffix` tag may carry a prerelease suffix on the same base version).
- The tagged commit must be reachable from a pushed remote branch; releases
  never ship from local-only commits.
- Windows, Linux and macOS artifacts must all be present or the release fails.
- `SHA256SUMS.txt` and a CycloneDX SBOM are generated and attached to every release.
- Tags containing a `-` suffix are published as GitHub *prereleases*.

## Rollback

If a released version is broken:

1. **Do not delete the tag** — it breaks checksum verification for anyone who
   already downloaded.
2. Mark the GitHub release as a prerelease or edit its notes with a warning.
3. Publish a hotfix tag `vX.Y.(Z+1)` reverting the offending commit.
4. If binaries must be pulled urgently, delete the release *assets* via
   `gh release delete-asset` and replace them; keep checksums updated.
5. File a postmortem issue describing the regression and why CI did not catch it.
