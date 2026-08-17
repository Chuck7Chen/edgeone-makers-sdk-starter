/**
 * 框架无关的 API 层：接收标准 Request，返回标准 Response。
 *
 * 不依赖 node:http，也不依赖任何 Web 框架，所以同一份代码可以跑在两个地方：
 *   - 本地：dev-server.ts 用 node:http 适配（开发时用）
 *   - 线上：cloud-functions/api/[[default]].ts 直接转发（生产姿势）
 *
 * 端点刻意和 SDK 方法一一对应，让浏览器 Network 面板里看到的调用顺序
 * 就是 SDK 的调用顺序。特别是**不把四步合并成一个接口** —— 合并之后
 * 前端只剩一个进度条，最该讲的东西全被藏起来了。
 */
import { createClient, DEMO_PREFIX, type Env, MissingTokenError, resolveRegion } from "./client.js";
import { httpStatusFor, serializeError } from "./errors.js";
import { SCENARIOS, type ScenarioInput } from "./scenarios.js";
import { Trace } from "./trace.js";

export const RUNTIME_LABEL = "node";

class RouteNotFoundError extends Error {
  constructor(method: string, path: string) {
    super(`没有这个端点：${method} ${path}`);
    this.name = "RouteNotFoundError";
  }
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function statusFor(error: unknown): number {
  if (error instanceof MissingTokenError) return 503;
  if (error instanceof RouteNotFoundError) return 404;
  if (error instanceof BadRequestError) return 400;
  return httpStatusFor(error);
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const trace = new Trace();
  const regionConfigured = Boolean(resolveRegion(env));
  try {
    const data = await route(request, env, trace);
    trace.observeRegion(regionConfigured);
    return json({ ok: true, data, trace: trace.items });
  } catch (error) {
    // trace 照样返回：失败时的调用记录比成功时更有价值。
    trace.observeRegion(regionConfigured);
    return json({ ok: false, error: serializeError(error), trace: trace.items }, statusFor(error));
  }
}

async function route(request: Request, env: Env, trace: Trace): Promise<unknown> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] !== "api") throw new RouteNotFoundError(method, url.pathname);
  const [, resource, first, second] = segments;

  if (resource === "config" && method === "GET") {
    return {
      runtime: RUNTIME_LABEL,
      hasToken: Boolean(env.MAKERS_API_TOKEN),
      region: resolveRegion(env) ?? null,
    };
  }

  if (resource === "projects") {
    if (!first && method === "GET") return listProjects(env, trace);
    if (!first && method === "POST") return createProject(await body(request), env, trace);
    if (first && method === "GET") return getProject(first, env, trace);
    if (first && method === "DELETE") return deleteProject(first, env, trace);
  }

  if (resource === "deployments") {
    if (!first && method === "POST") return deploy(await body(request), env, trace);
    if (first && !second && method === "GET") {
      return getDeployment(requireQuery(url, "projectId"), first, env, trace);
    }
    if (first && second === "log" && method === "GET") {
      return getLog(requireQuery(url, "projectId"), first, env, trace);
    }
  }

  if (resource === "scenarios" && first && method === "POST") {
    return runScenario(first, await body(request), env, trace);
  }

  throw new RouteNotFoundError(method, url.pathname);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // 落到下面统一报错
  }
  throw new BadRequestError("请求体必须是 JSON 对象");
}

function requireQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value) throw new BadRequestError(`缺少查询参数 ${key}`);
  return value;
}

function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`缺少字段 ${key}`);
  }
  return value;
}

// ── Projects ──────────────────────────────────────────────────────

async function createProject(input: Record<string, unknown>, env: Env, trace: Trace) {
  const name = requireString(input, "name");
  const client = createClient(env, trace);
  const created = await trace.record("client.projects.create", { name }, () =>
    client.projects.create({ name }),
  );
  trace.note("create 只返回 projectId。名称、状态、域名都要再调 projects.get 才拿得到。");
  return created;
}

async function listProjects(env: Env, trace: Trace) {
  const client = createClient(env, trace);
  // 只翻第一页。演示项目不会多，真实场景请用 listAll() 自动翻页。
  const page = await trace.record("client.projects.list", { pageSize: 100 }, () =>
    client.projects.list({ pageSize: 100 }),
  );
  const items = page.items
    .filter((project) => project.name.startsWith(DEMO_PREFIX))
    .map((project) => ({
      projectId: project.projectId,
      name: project.name,
      createdOn: project.createdOn,
      presetDomain: project.presetDomain ?? null,
    }));
  return { items };
}

async function getProject(projectId: string, env: Env, trace: Trace) {
  const client = createClient(env, trace);
  // 已知问题：SDK v0.1.0 的 projects.get 打的是后端不存在的单数 Action
  // DescribePagesProject，目前必定返回 Code 107。SDK 修好后这里无需改动。
  const project = await trace.record("client.projects.get", { projectId }, () =>
    client.projects.get({ projectId }),
  );
  trace.note("presetDomain 在项目上。Production 的正式地址不在部署结果里 —— 这是 SDK 最反直觉的一点，也是为什么部署完还要多查一次。");
  return { project };
}

async function deleteProject(projectId: string, env: Env, trace: Trace) {
  const client = createClient(env, trace);
  await trace.record("client.projects.delete", { projectId }, () =>
    client.projects.delete({ projectId }),
  );
  return {};
}

// ── Deployments ───────────────────────────────────────────────────

async function deploy(input: Record<string, unknown>, env: Env, trace: Trace) {
  const projectId = requireString(input, "projectId");
  const html = requireString(input, "html");
  const target = input["env"] === "Preview" ? "Preview" : "Production";
  const client = createClient(env, trace);

  const request = {
    projectId,
    artifact: { files: { "index.html": `<${html.length} 字节>` } },
    env: target,
    wait: false,
  };
  const deployment = await trace.record("client.deployments.deploy", request, () =>
    client.deployments.deploy({
      projectId,
      // 内联文件由 SDK 在内存里打成 Zip，服务端不需要有任何构建产物落盘。
      artifact: { files: { "index.html": html } },
      env: target,
      // 关键：Serverless 里绝不能用 wait: true。函数有执行时长上限，
      // 而 wait 默认等 15 分钟，必然超时。立刻返回 deploymentId，
      // 让前端轮询 GET /api/deployments/:id。
      wait: false,
    }),
  );
  trace.note("wait: false 时只返回 deploymentId / projectId / env 三个字段。没有状态，也没有地址。接下来的轮询由前端驱动。");
  return deployment;
}

async function getDeployment(projectId: string, deploymentId: string, env: Env, trace: Trace) {
  const client = createClient(env, trace);
  const deployment = await trace.record(
    "client.deployments.get",
    { projectId, deploymentId },
    () => client.deployments.get({ projectId, deploymentId }),
  );
  return { status: deployment.status ?? null, deployment };
}

async function getLog(projectId: string, deploymentId: string, env: Env, trace: Trace) {
  const client = createClient(env, trace);
  return trace.record("client.deployments.getLog", { projectId, deploymentId }, () =>
    client.deployments.getLog({ projectId, deploymentId }),
  );
}

// ── 场景 ──────────────────────────────────────────────────────────

async function runScenario(
  name: string,
  input: Record<string, unknown>,
  env: Env,
  trace: Trace,
): Promise<never> {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new BadRequestError(`未知场景：${name}`);
  const payload: ScenarioInput = {
    name: typeof input["name"] === "string" ? input["name"] : `${DEMO_PREFIX}${Date.now()}`,
    html: typeof input["html"] === "string" ? input["html"] : "<h1>hello</h1>",
  };
  await scenario(payload, env, trace);
  // 场景的意义就是抛异常。走到这里说明后端行为变了，值得当成失败暴露出来。
  throw new Error("场景执行完毕却没有抛出预期的异常，后端行为可能已变化。");
}
