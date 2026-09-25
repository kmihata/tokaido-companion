# GitHub Pages deployment

**Nothing here has been executed.** No repository exists, no remote is
configured, nothing has been pushed, and no DNS or domain has been touched. This
document is the reviewable plan.

Deployment needs Kevin's explicit approval. So does creating the repository.

## Current state

- `Notes/tokaido-reset/` is **not** a Git repository, and neither is any parent
  directory. `git rev-parse` fails from here.
- No `git init` has been run. That is deliberate: initialising a repository
  inside Dropbox is a structural change, and the instruction was not to do it
  without approval.
- A `.gitignore` is written and ready.

## What the build already guarantees

The hard parts of a Pages project-site deployment are done and tested.

| Requirement | State |
| --- | --- |
| Static output | `dist/`, no server runtime |
| Project subpath | `base: '/tokaido-companion/'`, used in dev, preview and production alike |
| No hard-coded absolute asset paths | Asserted by `tests/build/bundle.test.ts` |
| Works at a *different* subpath | Asserted: the test rebuilds at `/some-other-name/` and checks |
| Manifest scope under the subpath | `start_url: '.'`, `scope: '.'`, relative icon paths |
| Service-worker scope | Registered at `<base>sw.js`, so its scope is the subpath |
| Deep links without server rewrites | Hash routing; no `404.html` trick needed |
| HTTPS | GitHub Pages provides it; the PWA requires it |
| Rollback | `git revert` and redeploy |

## Approval needed before any of the following

1. Running `git init` anywhere inside Dropbox
2. Creating a GitHub repository
3. Authenticating to GitHub from this machine
4. Adding a remote or pushing
5. Enabling GitHub Pages
6. Moving the workflow file into `.github/workflows/`
7. Anything touching DNS or `kevinmihata.net`

## The sequence, when approved

### 1. Decide on the repository boundary — the real decision

Three options.

**A. A separate repository containing only `field-companion/`.** Cleanest. The
repository holds the app and nothing else. `Notes/tokaido-reset/*.md` stay
private in Dropbox. This is the recommendation.

**B. A repository at `tokaido-reset/` with the app in a subdirectory.** Would
publish the project notes — `STATUS.md` contains booking economics and personal
planning detail. Reject.

**C. No repository; deploy built output by hand.** Loses version history and the
rollback story. Reject.

Under option A, the working copy would live outside Dropbox — for example
`~/code/tokaido-companion` — with this folder as the source of truth until the
first push. Keeping a Git working tree inside Dropbox risks conflicted copies in
`.git/` when two machines sync, which is a well-known way to corrupt a
repository. That is a second reason to prefer A.

### 2. Initialise, review, commit

```bash
git init
git add -A
git status          # READ THIS. Confirm no private file is staged.
git commit -m "Samwise: initial Tokaido field companion vertical slice"
```

Before committing, re-read `PRIVACY-AND-THREAT-MODEL.md` and confirm nothing on
the forbidden list is present. `npm run verify` must pass; its bundle tests are
part of that check.

### 3. Create the repository

Public. A private repository cannot serve Pages on a free plan. Name it
`tokaido-companion` to match `BASE_PATH`; if a different name is chosen, change
`BASE_PATH` in `vite.config.ts` and in the workflow, and rerun
`npm run test:build`.

### 4. Activate the workflow

```bash
mkdir -p .github/workflows
git mv proposed/deploy-github-pages.yml .github/workflows/deploy.yml
```

The workflow typechecks, lints, runs unit tests, builds, runs the bundle
assertions, installs Chromium, runs the Playwright suite, and only then uploads
and deploys. A failure at any step blocks the deployment.

### 5. Enable Pages

Repository → Settings → Pages → Source: **GitHub Actions**.

### 6. Push and watch

```bash
git remote add origin git@github.com:<user>/tokaido-companion.git
git branch -M main
git push -u origin main
```

The site appears at `https://<user>.github.io/tokaido-companion/`.

### 7. Verify the deployment

- [ ] Loads over HTTPS at the subpath
- [ ] The demonstration banner is the first thing on screen
- [ ] Every tab works; a deep link like `#/day/d-2026-10-24` survives a reload
- [ ] `manifest.webmanifest` resolves; Add to Home Screen offers the right name
      and icon
- [ ] Offline readiness reports "Ready" after one reload
- [ ] Airplane mode, then relaunch from the Home Screen icon
- [ ] View the repository as a logged-out stranger and confirm there is nothing
      there Kevin would mind

## Rollback

```bash
git revert <bad-commit>
git push
```

The workflow redeploys. The data version in the app's status strip tells you
which dataset a given phone is actually holding, which matters when a phone is
still running a cached older build — remember that a client only takes a new
version when the update prompt is tapped.

## Custom domain

Out of scope, and not needed. `github.io` is fine for a one-person field tool.
If it is ever wanted: a `CNAME` file, a DNS record, and a wait for the
certificate. Do not do this near departure — a domain change invalidates the
service-worker origin and every installed copy would need reinstalling.

## Cost

Zero. GitHub Pages and Actions are free at this scale on a public repository.
No paid service is introduced by this plan.
