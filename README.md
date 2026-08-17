# EdgeOne Makers SDK Starter (Node)

English | [中文](README.zh-CN.md)

The shortest path through the EdgeOne Makers SDK: create a project, deploy a page, get its URL. The example needs no local build output.

Looking for Python? See [edgeone-makers-sdk-starter-python](https://github.com/Chuck7Chen/edgeone-makers-sdk-starter-python).

Targets contract version `0.1.21`.

## Prerequisites

- Node.js 20.12+ (uses `--env-file-if-exists`)
- Clone the [SDK repository](https://github.com/QT-7274/edgeone-makers-sdk-dev) next to this one. The SDK repository is private before public release, so your GitHub account needs access:

```text
Code/
├── edgeone-makers-sdk-dev/      # SDK repository
└── edgeone-makers-sdk-starter/  # this repository
```

If the SDK lives elsewhere, change the `file:` dependency and `setup:sdk` path in `package.json`.

## 60 seconds to first deploy

```sh
# 1. Build the SDK (once)
npm install
npm run setup:sdk

# 2. Configure your token
cp .env.example .env
# edit .env and fill in MAKERS_API_TOKEN

# 3. Run
npm start
```

### Expected output

```text
[1/3] 创建项目 hello-1755144000000
      projectId = pages-xxxxxxxx
[2/3] 打包上传并部署
      (首次查询) -> Process
      Process -> Success
[3/3] 读取访问地址

完成 → https://hello-1755144000000.edgeone.app
```

Open that URL to see the deployed page.

## Three things that will surprise you

All three are counterintuitive. Read them before writing your own code.

### 1. A successful deploy does not give you the URL

The return value of `deployments.deploy()` contains **no production domain**. Without waiting it carries only `deploymentId`, `projectId`, and `env`; even with `wait: true`, `previewUrl` is populated for Preview deployments only.

The production URL lives on the **project**, so query it separately:

```ts
const project = await client.projects.get({ projectId });
console.log(`https://${project.presetDomain}`);
```

`presetDomain` is optional and a freshly created project may not have one yet, so check for it.

### 2. `source` can only be `cli` right now

`source` is required when constructing a Client, but **`cli` is the only value covered by the current contract**. Other values are unverified and should not be relied on.

### 3. Preview deploys require an existing Production deployment

`deploy({ env: "Preview" })` runs a precheck first and throws `ValidationError` if the project has no Production deployment yet. Ship a Production deployment first.

## Common errors

Every SDK failure throws a subclass of `MakersError`, carrying `code`, `requestId`, and `httpStatus` for diagnosis.

| Error | Typical cause | What to do |
|-------|---------------|------------|
| `AuthError` | Token invalid or expired | Reissue the token; verify the region is correct |
| `ValidationError` | Bad argument; Preview without a Production deploy; illegal artifact path | Read the message, it names the offending field |
| `ConflictError` | Project name already exists in this account | Pick another name, or find the existing project with `projects.list({ name })` |
| `NotFoundError` | Unknown projectId or deploymentId | Verify the ID; deletion is not reversible |
| `RateLimitError` | Management API rate limit | Queries retry automatically; back off and retry writes yourself |
| `UploadError` | Artifact upload to COS failed | Check artifact size and network |
| `DeploymentTimeoutError` | Wait timed out (15 minutes by default) | **The deployment keeps running**; poll with `deployments.get` |

Network-level failures (DNS, connection refused) also throw `MakersError`, but `code` / `requestId` / `httpStatus` are all `null` — the backend never answered. Only print those fields when they are set.

## Notes for serverless

Two things to know before calling the SDK from a cloud function:

- **Do not use `wait: true`.** Cloud functions have an execution time limit while `wait` polls for up to 15 minutes. Call `deploy({ wait: false })` to get a `deploymentId` immediately, then let the browser poll a separate status function.
- **Pass `region` explicitly.** Left empty, the SDK probes china then global, and the result is cached per Client instance only. Every cold start is a new instance, so every cold start pays for another probe.

Both points have a runnable demonstration in [`server-demo/`](server-demo/README.md).

## Call inspector (server-demo)

A server-side integration example with a UI that shows every SDK call — arguments,
return value, and duration — in real time. It also lets you trigger
`ConflictError` / `ValidationError` / `NotFoundError` on demand to see the real failures.

```sh
npm run demo   # open http://localhost:8787
```

See [`server-demo/README.md`](server-demo/README.md).

## SDK dependency

The npm package is `@edgeone/makers-sdk`; its source lives in
[QT-7274/edgeone-makers-sdk-dev](https://github.com/QT-7274/edgeone-makers-sdk-dev).
Example code already imports the official package name. Until it is published,
`package.json` maps that name to the sibling source repository with a `file:` dependency.
After publishing, replace only that dependency with the released version.

## What comes next

This repository contains the L0 quickstart and the L2 server integration. Planned:

- `recipes/` — deploy a directory, deploy a Zip, environment variables, pagination, manual polling, error handling, Preview deploys
