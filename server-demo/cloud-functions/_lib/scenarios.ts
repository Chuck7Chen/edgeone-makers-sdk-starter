/**
 * 错误场景：把 SDK 三个反直觉的地方做成可点击的演示。
 *
 * 这些场景**故意**抛异常。没人会为了看一眼报错去改示例代码，所以把它们做成
 * 按钮 —— 这是 UI 相对命令行示例最大的增量。
 *
 * 每个场景跑完都会抛出异常，由 handlers.ts 统一翻译成 HTTP 状态码。
 */
import { createClient, type Env } from "./client.js";
import type { Trace } from "./trace.js";

export interface ScenarioInput {
  name: string;
  html: string;
}

type Scenario = (input: ScenarioInput, env: Env, trace: Trace) => Promise<void>;

/** 项目名重复 → ConflictError（HTTP 409）。 */
const conflict: Scenario = async (input, env, trace) => {
  const client = createClient(env, trace);
  const name = input.name;

  await trace.record("client.projects.create", { name }, () => client.projects.create({ name }));
  trace.note("第一次创建成功。项目名在同一账号下唯一，这是新用户最容易踩的第一个坑：quickstart 用时间戳做名字就是为了绕开它。");

  await trace.record("client.projects.create", { name }, () => client.projects.create({ name }));
};

/** 新项目直接发 Preview 部署 → ValidationError（HTTP 400）。 */
const previewPrecheck: Scenario = async (input, env, trace) => {
  const client = createClient(env, trace);
  const name = input.name;

  const { projectId } = await trace.record("client.projects.create", { name }, () =>
    client.projects.create({ name }),
  );
  trace.note("这是一个全新项目，还没有任何 Production 部署。");

  const request = {
    projectId,
    artifact: { files: { "index.html": "…" } },
    env: "Preview" as const,
    wait: false,
  };
  await trace.record("client.deployments.deploy", request, () =>
    client.deployments.deploy({
      projectId,
      artifact: { files: { "index.html": input.html } },
      env: "Preview",
      wait: false,
    }),
  );
};

/** 对不存在的项目发部署 → NotFoundError（HTTP 404）。不产生任何项目。 */
const notFound: Scenario = async (input, env, trace) => {
  const client = createClient(env, trace);
  const projectId = "makers-does-not-exist-000";
  trace.note("拿一个不存在的 projectId 发部署，看 SDK 怎么把后端的错误码翻译成类型化异常。");

  const request = { projectId, artifact: { files: { "index.html": "…" } }, wait: false };
  await trace.record("client.deployments.deploy", request, () =>
    client.deployments.deploy({
      projectId,
      artifact: { files: { "index.html": input.html } },
      wait: false,
    }),
  );
};

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  conflict,
  "preview-precheck": previewPrecheck,
  "not-found": notFound,
};
